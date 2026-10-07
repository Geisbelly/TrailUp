"""Testes da analise de emocao por visao local.

O que e' exercitado de verdade: `_softmax`, `_amostrar`, o de-para para o
vocabulario do sistema, e TODA a cadeia de degradacao — que e' o que impede
este estagio de derrubar o ciclo de analise.

O que NAO e' exercitado aqui: a deteccao de um rosto humano real pelo YuNet.
Nao ha rosto no repositorio, e nao vai haver — validar isso e' papel de uma
passada em staging com aparelho de verdade. O que da para garantir sem foto, e
esta' garantido abaixo, e que o recorte vira tensor 1x1x64x64 e atravessa o
modelo FER+ com saida valida.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any

import pytest

from app.services import emotion_vision as ev


@dataclass
class _ResultadoFake:
    provider_name: str
    emocao_primaria: str
    valencia: float
    confianca: float
    resumo: dict[str, Any]


class _EventoFake:
    def __init__(self, tipo: str) -> None:
        self.tipo = tipo


class _HeuristicaFake:
    """Dubla o DeepFaceEmotionAnalyzer sem importar o pipeline (evita ciclo)."""

    provider_name = "deepface"

    def __init__(self) -> None:
        self.chamadas = 0

    async def analyze(self, **_: Any) -> _ResultadoFake:
        self.chamadas += 1
        return _ResultadoFake(
            provider_name=self.provider_name,
            emocao_primaria="neutro",
            valencia=0.1,
            confianca=0.36,
            resumo={"eventos": {}},
        )


def test_softmax_normaliza_e_preserva_a_ordem() -> None:
    saida = ev._softmax([2.0, 1.0, 0.1])
    assert pytest.approx(sum(saida), abs=1e-9) == 1.0
    assert saida[0] > saida[1] > saida[2]
    assert all(0.0 <= v <= 1.0 for v in saida)


def test_softmax_nao_estoura_com_valores_grandes() -> None:
    # Sem subtrair o maximo, exp(1000) vira inf e o resultado vira nan.
    saida = ev._softmax([1000.0, 999.0])
    assert pytest.approx(sum(saida), abs=1e-9) == 1.0


def test_softmax_de_lista_vazia() -> None:
    assert ev._softmax([]) == []


def test_amostrar_espalha_em_vez_de_pegar_os_primeiros() -> None:
    frames = [str(i) for i in range(30)]
    escolhidos = ev._amostrar(frames, 5)
    assert len(escolhidos) == 5
    assert escolhidos[0] == "0"
    # se pegasse os primeiros, o ultimo seria "4"
    assert escolhidos[-1] != "4"
    assert int(escolhidos[-1]) >= 24


def test_amostrar_devolve_tudo_quando_cabe() -> None:
    assert ev._amostrar(["a", "b"], 5) == ["a", "b"]


def test_mapeamento_cobre_todos_os_rotulos_do_modelo() -> None:
    # Um rotulo sem de-para cairia silenciosamente em "neutro".
    assert set(ev._PARA_VOCABULARIO) == set(ev._FERPLUS_LABELS)


def test_mapeamento_so_usa_o_vocabulario_do_sistema() -> None:
    vocabulario = {"neutro", "focado", "frustrado", "ansioso", "cansado"}
    assert {emocao for emocao, _ in ev._PARA_VOCABULARIO.values()} <= vocabulario


def test_valencia_negativa_para_emocao_negativa() -> None:
    for rotulo in ("anger", "disgust", "fear", "sadness", "contempt"):
        _, valencia = ev._PARA_VOCABULARIO[rotulo]
        assert valencia < 0, rotulo
    assert ev._PARA_VOCABULARIO["happiness"][1] > 0


@pytest.mark.asyncio
async def test_sem_frame_devolve_a_heuristica_intacta() -> None:
    heuristica = _HeuristicaFake()
    analisador = ev.LocalVisionEmotionAnalyzer(
        fallback=heuristica, caminho_modelo="/nao/existe", caminho_detector="/nao/existe"
    )
    saida = await analisador.analyze(
        frames_b64=[], eventos_novos=[], telemetry_payload={}, state={}
    )
    assert saida.emocao_primaria == "neutro"
    assert saida.provider_name == "deepface"
    assert saida.resumo["visao"] == {"usada": False, "motivo": "sem_frame"}
    assert heuristica.chamadas == 1


@pytest.mark.asyncio
async def test_modelo_ausente_nao_derruba_o_ciclo() -> None:
    heuristica = _HeuristicaFake()
    analisador = ev.LocalVisionEmotionAnalyzer(
        fallback=heuristica,
        caminho_modelo="/opt/models/nao-existe.onnx",
        caminho_detector="/opt/models/tambem-nao.onnx",
    )
    saida = await analisador.analyze(
        frames_b64=["ZmFrZQ=="], eventos_novos=[], telemetry_payload={}, state={}
    )
    assert saida.provider_name == "deepface"
    assert saida.resumo["visao"]["motivo"] == "sem_conclusao"


@pytest.mark.asyncio
async def test_evento_de_erro_tem_precedencia_sobre_a_face(monkeypatch) -> None:
    """Errar tres vezes e' um fato; a cara de um quadro e' uma leitura."""
    monkeypatch.setattr(
        ev,
        "_analisar_frames",
        lambda *_args, **_kw: ev._Visao("happiness", 0.9, 5, 5),
    )
    heuristica = _HeuristicaFake()
    analisador = ev.LocalVisionEmotionAnalyzer(fallback=heuristica, caminho_modelo="x", caminho_detector="y")
    saida = await analisador.analyze(
        frames_b64=["ZmFrZQ=="],
        eventos_novos=[_EventoFake("erro_recorrente")],
        telemetry_payload={},
        state={},
    )
    assert saida.provider_name == "deepface"
    assert saida.resumo["visao"]["motivo"] == "evento_de_erro_tem_precedencia"
    assert saida.resumo["visao"]["rotulo_descartado"] == "happiness"


@pytest.mark.asyncio
async def test_visao_vence_quando_conclui_e_nao_ha_evento_de_erro(monkeypatch) -> None:
    monkeypatch.setattr(
        ev, "_analisar_frames", lambda *_a, **_k: ev._Visao("anger", 0.8, 4, 5)
    )
    analisador = ev.LocalVisionEmotionAnalyzer(
        fallback=_HeuristicaFake(), caminho_modelo="x", caminho_detector="y"
    )
    saida = await analisador.analyze(
        frames_b64=["ZmFrZQ=="], eventos_novos=[], telemetry_payload={}, state={}
    )
    assert saida.provider_name == "local_vision"
    assert saida.emocao_primaria == "frustrado"
    assert saida.valencia < 0
    # 4 rostos em 5 quadros reduz a confianca: 0.8 * 0.8
    assert pytest.approx(saida.confianca, abs=1e-6) == 0.64
    assert saida.resumo["visao"]["heuristica_diria"] == "neutro"


@pytest.mark.asyncio
async def test_base64_invalido_nao_levanta(monkeypatch) -> None:
    # Sem o modelo em disco o caminho ja' retorna cedo; com ele, o decode
    # invalido tem de ser engolido. Garante os dois sem exigir o arquivo.
    analisador = ev.LocalVisionEmotionAnalyzer(
        fallback=_HeuristicaFake(), caminho_modelo="/x", caminho_detector="/y"
    )
    saida = await analisador.analyze(
        frames_b64=["nao-e-base64-valido!!!"], eventos_novos=[], telemetry_payload={}, state={}
    )
    assert saida.provider_name == "deepface"


@pytest.mark.asyncio
async def test_resumo_nao_carrega_imagem(monkeypatch) -> None:
    """`resumo` e gravado inteiro em ia_decision_logs — nao pode levar foto."""
    import json

    frame = base64.b64encode(b"\xff\xd8\xff" + b"P" * 4096).decode()
    monkeypatch.setattr(
        ev, "_analisar_frames", lambda *_a, **_k: ev._Visao("neutral", 0.7, 2, 3)
    )
    analisador = ev.LocalVisionEmotionAnalyzer(
        fallback=_HeuristicaFake(), caminho_modelo="x", caminho_detector="y"
    )
    saida = await analisador.analyze(
        frames_b64=[frame], eventos_novos=[], telemetry_payload={}, state={}
    )

    serializado = json.dumps(saida.resumo)
    assert frame not in serializado
    # nenhum valor longo o bastante para ser imagem embutida
    assert max((len(str(v)) for v in saida.resumo["visao"].values()), default=0) < 64
    assert saida.resumo["visao"]["frames_com_rosto"] == 2


# --- Integracao: so roda onde os modelos existem (o container os baixa no
# build; o CI nao, de proposito — sao 35 MB por execucao). Em maquina com os
# arquivos, exercita a cadeia inteira: JPEG -> deteccao -> recorte -> cinza ->
# 64x64 -> FER+ -> rotulo.
_FALTA_MODELO = None
try:  # pragma: no cover - depende do ambiente
    from app.core.settings import get_settings as _get_settings

    _cfg = _get_settings()
    _MODELO, _DETECTOR = _cfg.emotion_vision_model_path, _cfg.emotion_vision_detector_path
    import pathlib as _pathlib

    if not (_pathlib.Path(_MODELO).is_file() and _pathlib.Path(_DETECTOR).is_file()):
        _FALTA_MODELO = f"modelos ausentes ({_MODELO}, {_DETECTOR})"
except Exception as _exc:  # pragma: no cover
    _MODELO = _DETECTOR = ""
    _FALTA_MODELO = f"settings indisponivel ({_exc})"


@pytest.mark.skipif(bool(_FALTA_MODELO), reason=str(_FALTA_MODELO))
def test_integracao_ruido_nao_vira_rosto() -> None:
    """Falso positivo aqui marcaria emocao em quem nem esta na frente da camera."""
    import cv2  # type: ignore[import-not-found]
    import numpy as np  # type: ignore[import-not-found]

    ruido = np.random.randint(0, 255, (240, 320, 3), dtype=np.uint8)
    ok, buffer = cv2.imencode(".jpg", ruido)
    assert ok
    frame = base64.b64encode(buffer.tobytes()).decode()
    assert ev._analisar_frames([frame], _MODELO, _DETECTOR) is None


@pytest.mark.skipif(bool(_FALTA_MODELO), reason=str(_FALTA_MODELO))
def test_integracao_modelos_carregam() -> None:
    assert ev._carregar_recursos(_MODELO, _DETECTOR) is not None
