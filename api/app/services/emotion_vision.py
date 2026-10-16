"""Analise de emocao a partir do frame da camera, com modelo LOCAL.

Diferente dos seis estagios de `linear_analysis_pipeline.py`, cujos nomes
anunciam algoritmos que nao estao implementados (ver a nota no topo daquele
arquivo), esta classe faz o que o nome diz: decodifica o JPEG, procura um
rosto, recorta, e roda uma rede de verdade.

MODELO. FER+ (`emotion-ferplus-8.onnx`, ONNX Model Zoo, licenca MIT). Entrada
1x1x64x64 em tons de cinza; saida com 8 logits. Foi escolhido no lugar do
DeepFace porque o DeepFace puxa TensorFlow (~500 MB) e CPU pesada para o mesmo
VPS que ja roda API, microservice e BrainHexPDF; o FER+ em onnxruntime ocupa
~35 MB e infere em milissegundos sobre um recorte 48x48.

DEGRADACAO. Nada aqui pode derrubar o ciclo de analise. Sem o arquivo do
modelo, sem `onnxruntime`/`cv2`, sem frame, sem rosto detectado ou com erro de
inferencia, o resultado do analisador heuristico injetado em `fallback` e
devolvido como esta. O motivo da queda vai sempre em `resumo["visao"]`, para a
diferenca entre "nao rodou" e "rodou e nao achou rosto" ser legivel depois.

PRIVACIDADE. Os bytes do frame existem so dentro de `analyze`. Nada e gravado:
nem o JPEG, nem o recorte do rosto, nem o vetor de probabilidades por frame. O
que sai daqui e um rotulo, uma valencia e uma confianca — e `resumo`, que
guarda contagens, nunca imagem. `_sanitize_lote_payload` ja impede que o frame
chegue a `telemetria_lotes` e a `ia_decision_logs`; esta classe nao abre
nenhuma porta nova.
"""

from __future__ import annotations

import base64
import binascii
import logging
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Ordem das saidas do FER+, fixada pelo modelo. Nao reordenar.
_FERPLUS_LABELS = (
    "neutral",
    "happiness",
    "surprise",
    "sadness",
    "anger",
    "disgust",
    "fear",
    "contempt",
)

# De-para para o vocabulario que o resto do sistema ja usa (o mesmo da
# heuristica: neutro/focado/frustrado/ansioso/cansado). E uma ESCOLHA, nao uma
# equivalencia cientifica — "happiness" nao e' "focado", e "surprise" pode ser
# engajamento tanto quanto susto. Fica aqui, explicito e num lugar so, para
# poder ser revisto sem cacar constante espalhada pelo codigo.
_PARA_VOCABULARIO: dict[str, tuple[str, float]] = {
    "neutral": ("neutro", 0.10),
    "happiness": ("focado", 0.55),
    "surprise": ("ansioso", -0.15),
    "sadness": ("cansado", -0.35),
    "anger": ("frustrado", -0.65),
    "disgust": ("frustrado", -0.55),
    "fear": ("ansioso", -0.50),
    "contempt": ("frustrado", -0.40),
}

# Teto de frames analisados por lote. A captura e' de 1 a cada 6s e o lote
# carrega ate 30 (MAX_CAMERA_FRAMES_PER_BATCH no mobile); rodar os 30 gastaria
# CPU do VPS sem mudar a conclusao, porque sao segundos consecutivos da mesma
# pessoa. Os escolhidos sao espalhados pelo lote, nao os primeiros.
_MAX_FRAMES_ANALISADOS = 5


@dataclass(slots=True)
class _Visao:
    """Resultado bruto da visao, antes de virar EmotionStageResult."""

    rotulo_ferplus: str
    probabilidade: float
    frames_com_rosto: int
    frames_tentados: int


def _softmax(valores: list[float]) -> list[float]:
    if not valores:
        return []
    maximo = max(valores)
    expoentes = [math.exp(v - maximo) for v in valores]
    soma = sum(expoentes) or 1.0
    return [e / soma for e in expoentes]


def _amostrar(frames: list[str], teto: int) -> list[str]:
    """Pega ate `teto` frames espalhados uniformemente pelo lote."""
    if len(frames) <= teto:
        return list(frames)
    passo = len(frames) / teto
    return [frames[int(i * passo)] for i in range(teto)]


@lru_cache(maxsize=1)
def _carregar_recursos(caminho_modelo: str, caminho_detector: str) -> tuple[Any, Any] | None:
    """Sessao ONNX do FER+ + detector de rosto YuNet, uma vez por processo.

    Devolve None quando qualquer peca falta, e registra o motivo. O `lru_cache`
    evita repetir o disco a cada lote; como a chave sao os caminhos, troca-los
    em teste invalida sozinho.

    YuNet, e nao a cascata Haar: o OpenCV 5 deixou de empacotar os XML de
    `cv2.data.haarcascades` (o diretorio existe e vem vazio), e mesmo onde
    existem o Haar erra muito com rosto em angulo e luz fraca — que e'
    exatamente a condicao de um aluno segurando o celular.
    """
    try:
        import cv2  # type: ignore[import-not-found]
        import onnxruntime  # type: ignore[import-not-found]
    except ImportError as exc:
        logger.warning("emocao.visao indisponivel: dependencia ausente (%s)", exc)
        return None

    modelo = Path(caminho_modelo)
    detector_arq = Path(caminho_detector)
    for arquivo, rotulo in ((modelo, "FER+"), (detector_arq, "YuNet")):
        if not arquivo.is_file():
            logger.warning("emocao.visao indisponivel: %s nao encontrado em %s", rotulo, arquivo)
            return None

    try:
        sessao = onnxruntime.InferenceSession(str(modelo), providers=["CPUExecutionProvider"])
        detector = cv2.FaceDetectorYN.create(str(detector_arq), "", (320, 320), 0.8, 0.3, 5000)
    except Exception as exc:  # pragma: no cover - depende dos arquivos em disco
        logger.warning("emocao.visao indisponivel: falha ao carregar (%s)", exc)
        return None

    return sessao, detector


def _analisar_frames(
    frames_b64: list[str], caminho_modelo: str, caminho_detector: str
) -> _Visao | None:
    """Roda a visao sobre uma amostra dos frames. None = sem conclusao."""
    recursos = _carregar_recursos(caminho_modelo, caminho_detector)
    if recursos is None:
        return None

    import cv2  # type: ignore[import-not-found]
    import numpy as np  # type: ignore[import-not-found]

    sessao, detector = recursos
    entrada = sessao.get_inputs()[0].name
    amostra = _amostrar(frames_b64, _MAX_FRAMES_ANALISADOS)

    acumulado: list[float] | None = None
    com_rosto = 0

    for frame in amostra:
        try:
            crus = base64.b64decode(frame, validate=True)
        except (binascii.Error, ValueError):
            continue

        # YuNet quer BGR de 3 canais; o FER+ quer cinza. Decodifica colorido e
        # converte so' o recorte, que e' bem menor.
        imagem = cv2.imdecode(np.frombuffer(crus, dtype=np.uint8), cv2.IMREAD_COLOR)
        if imagem is None or imagem.size == 0:
            continue

        altura_img, largura_img = imagem.shape[:2]
        detector.setInputSize((largura_img, altura_img))
        try:
            _, rostos = detector.detect(imagem)
        except Exception as exc:  # pragma: no cover - erro interno do detector
            logger.warning("emocao.visao: deteccao falhou (%s)", exc)
            continue
        if rostos is None or len(rostos) == 0:
            continue

        # O maior rosto: quem esta estudando esta' mais perto da camera do que
        # qualquer pessoa que passe ao fundo.
        melhor = max(rostos, key=lambda r: float(r[2]) * float(r[3]))
        x, y, largura, altura = (int(max(0, v)) for v in melhor[:4])
        recorte = imagem[y : y + altura, x : x + largura]
        if recorte.size == 0:
            continue

        cinza = cv2.cvtColor(recorte, cv2.COLOR_BGR2GRAY)
        tensor = cv2.resize(cinza, (64, 64)).astype("float32").reshape(1, 1, 64, 64)
        try:
            saida = sessao.run(None, {entrada: tensor})[0]
        except Exception as exc:  # pragma: no cover - erro de runtime do ONNX
            logger.warning("emocao.visao: inferencia falhou (%s)", exc)
            continue

        bruto = np.asarray(saida).reshape(-1)
        if bruto.shape[0] < len(_FERPLUS_LABELS):
            continue
        probabilidades = _softmax([float(v) for v in bruto[: len(_FERPLUS_LABELS)]])

        com_rosto += 1
        acumulado = probabilidades if acumulado is None else [a + b for a, b in zip(acumulado, probabilidades)]

    if acumulado is None or com_rosto == 0:
        return None

    medias = [valor / com_rosto for valor in acumulado]
    indice = max(range(len(medias)), key=medias.__getitem__)
    return _Visao(
        rotulo_ferplus=_FERPLUS_LABELS[indice],
        probabilidade=medias[indice],
        frames_com_rosto=com_rosto,
        frames_tentados=len(amostra),
    )


class LocalVisionEmotionAnalyzer:
    """Estagio de emocao que de fato olha para a imagem.

    `fallback` e' injetado em vez de importado para nao fechar ciclo com
    `linear_analysis_pipeline`, que e' quem registra esta classe na fabrica.
    Ele e' usado SEMPRE que a visao nao conclui — e tambem quando o lote traz
    evento explicito de erro, porque "errou tres vezes seguidas" e' um sinal
    mais confiavel de frustracao do que a expressao de um unico quadro.
    """

    provider_name = "local_vision"

    def __init__(
        self,
        *,
        fallback: Any,
        caminho_modelo: str | None = None,
        caminho_detector: str | None = None,
    ) -> None:
        self._fallback = fallback
        self._caminho_modelo = caminho_modelo
        self._caminho_detector = caminho_detector

    def _caminhos(self) -> tuple[str, str]:
        if self._caminho_modelo is not None and self._caminho_detector is not None:
            return self._caminho_modelo, self._caminho_detector
        from app.core.settings import get_settings

        config = get_settings()
        return (
            self._caminho_modelo or config.emotion_vision_model_path,
            self._caminho_detector or config.emotion_vision_detector_path,
        )

    async def analyze(
        self,
        *,
        frames_b64: list[str],
        eventos_novos: list[Any],
        telemetry_payload: dict[str, Any] | None,
        state: dict[str, Any],
    ) -> Any:
        base = await self._fallback.analyze(
            frames_b64=frames_b64,
            eventos_novos=eventos_novos,
            telemetry_payload=telemetry_payload,
            state=state,
        )

        if not frames_b64:
            base.resumo = {**base.resumo, "visao": {"usada": False, "motivo": "sem_frame"}}
            return base

        visao = _analisar_frames(frames_b64, *self._caminhos())
        if visao is None:
            base.resumo = {**base.resumo, "visao": {"usada": False, "motivo": "sem_conclusao"}}
            return base

        # Evento explicito de erro vence a expressao facial: ele e' um fato
        # sobre o que o aluno FEZ, nao uma leitura de como ele parece estar.
        tipos = {getattr(evento, "tipo", None) for evento in eventos_novos}
        if tipos & {"erro_recorrente", "abandono_atividade"}:
            base.resumo = {
                **base.resumo,
                "visao": {
                    "usada": False,
                    "motivo": "evento_de_erro_tem_precedencia",
                    "rotulo_descartado": visao.rotulo_ferplus,
                },
            }
            return base

        emocao, valencia = _PARA_VOCABULARIO.get(visao.rotulo_ferplus, ("neutro", 0.1))
        tipo_resultado = type(base)
        return tipo_resultado(
            provider_name=self.provider_name,
            emocao_primaria=emocao,
            valencia=valencia,
            # A confianca e' a probabilidade do modelo, limitada pela fracao de
            # frames em que houve rosto: concordancia de 1 quadro em 5 nao vale
            # o mesmo que de 5 em 5.
            confianca=min(
                0.95,
                max(0.2, visao.probabilidade * (visao.frames_com_rosto / max(visao.frames_tentados, 1))),
            ),
            resumo={
                **base.resumo,
                "visao": {
                    "usada": True,
                    "rotulo_ferplus": visao.rotulo_ferplus,
                    "probabilidade": round(visao.probabilidade, 3),
                    "frames_com_rosto": visao.frames_com_rosto,
                    "frames_tentados": visao.frames_tentados,
                    "heuristica_diria": base.emocao_primaria,
                },
            },
        )
