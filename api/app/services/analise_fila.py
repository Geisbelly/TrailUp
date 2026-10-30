"""Worker da fila de análise de lote de telemetria (F3, Task 2).

O banco enfileira todo lote novo em `telemetria_analise_fila` (`20261029_09`, pelos dois caminhos: API e
direto do app). Este laço reivindica os itens vencidos e roda neles a mesma análise que
`POST /api/v1/telemetria/lotes` roda dentro do pedido, fora de qualquer requisição HTTP. É o que faz os
lotes gravados pelo caminho direto (hoje, todos) finalmente serem analisados.

Regra de fronteira: enfileirar, espaçar tentativas e desistir é encanamento e mora no banco
(`fn_telemetria_analise_reivindicar` / `fn_telemetria_analise_falhou`); analisar é IA e mora aqui.

O que o worker **não** faz, de propósito:

- não grava eventos legados em `eventos_aluno` (P5): só passa a lista ao pipeline (`eventos_novos`);
- não manda frame de câmera (`frame_b64=None`, `frames_b64=[]`): o lote gravado não guarda o rosto.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError
from sqlalchemy import text

from app.repositories.telemetria import TelemetriaRepository
from app.schemas.telemetria import TelemetriaLotePayload
from app.services import modo_restrito
from app.services.analysis_runner import run_analysis
from app.services.telemetria_eventos_legados import normalizar_eventos_legados

logger = logging.getLogger(__name__)

RESULTADOS = ("analisado", "modo_restrito", "payload_invalido", "payload_no_r2", "sumiu", "falhou")
PAYLOAD_INVALIDO = "payload_invalido"
PAYLOAD_NO_R2 = "payload_no_r2"
ANALYSIS_ERROR_MAX = 500

_LER_LOTE = text(
    """
    SELECT id, aluno_id, classe_id, topico_id, atividade_id, sessao_id, payload,
           analysis_ciclo_id, analysis_error
      FROM public.telemetria_lotes
     WHERE id = CAST(:lote AS uuid)
    """
)
_REIVINDICAR = text(
    "SELECT * FROM public.fn_telemetria_analise_reivindicar("
    "CAST(:limite AS integer), CAST(:trava AS integer), CAST(:classes AS bigint[]))"
)
_ULTIMO_ERRO = text("SELECT ultimo_erro FROM public.telemetria_analise_fila WHERE lote_id = CAST(:lote AS uuid)")


@dataclass(frozen=True)
class RequisicaoInterna:
    """O `request` que o pipeline recebe quando a análise roda fora de um pedido HTTP.

    O pipeline só lê `request.app.state`, em três linhas (medido com grep em `app/services`):
    `analysis_runner.py:149` (`request.app.state.settings`, para montar o orquestrador),
    `analysis_runner.py:156` (`request.app.state.settings.default_checkpoint_ns`) e
    `linear_analysis_pipeline.py:786` (`request.app.state.graph_ephemeral.ainvoke`). Nada de cabeçalho,
    URL ou cliente: o que importa do pedido já vem do lote.
    """

    app: Any


def _tempo_maximo_da_analise(settings: Any) -> int:
    """Metade da trava (R4): a trava de 600 s sobrevive à análise mais longa (300 s), então a desistência
    por trava vencida da reivindicação nunca pega uma análise ainda rodando."""
    return max(1, int(settings.telemetria_analise_fila_trava_seconds) // 2)


async def _ler_lote(session: Any, lote_id: str) -> dict[str, Any] | None:
    linha = (await session.execute(_LER_LOTE, {"lote": lote_id})).mappings().first()
    return dict(linha) if linha else None


def _turmas_da_fila(settings: Any) -> list[int] | None:
    """A guarda do #652: a lista própria, ou, vazia, a dos jobs de personalização; as duas vazias, todas."""
    turmas = list(getattr(settings, "telemetria_analise_fila_classe_ids", None) or []) or list(
        getattr(settings, "personalizacao_jobs_classe_ids", None) or []
    )
    return [int(t) for t in turmas] or None


async def _reivindicar(session: Any, *, limite: int, trava_seg: int, classe_ids: list[int] | None) -> list[str]:
    linhas = await session.execute(_REIVINDICAR, {"limite": limite, "trava": trava_seg, "classes": classe_ids})
    return [str(lote_id) for lote_id in linhas.scalars().all()]


async def _ultimo_erro(session: Any, lote_id: str) -> str | None:
    return (await session.execute(_ULTIMO_ERRO, {"lote": lote_id})).scalar()


def _payload_do_lote(bruto: Any) -> dict[str, Any] | None:
    """Sem codec de JSON no asyncpg, o `jsonb` chega como texto."""
    if isinstance(bruto, str):
        try:
            bruto = json.loads(bruto)
        except ValueError:
            return None
    return bruto if isinstance(bruto, dict) else None


def _e_ponteiro_do_r2(payload: dict[str, Any] | None) -> bool:
    """`TelemetriaRepository._payload_para_gravar` troca o payload por `{"_r2", "_bucket"}` quando o R2
    está configurado, e nada no repositório o lê de volta."""
    return isinstance(payload, dict) and "_r2" in payload


def _para_validar(payload: dict[str, Any] | None) -> Any:
    """Cópia sem frames. Os dois gravadores tiram o `frame_b64` (`_sanitize_lote_payload` na API,
    `sanitizarCameraParaBanco` no app), e ele é obrigatório em `TelemetriaCameraFramePayload`: validar o
    gravado cru recusaria todo lote com câmera. O worker não manda frame nenhum (D-4), então a câmera não
    importa para a validação; o `telemetry_payload` continua sendo o gravado, intacto."""
    if not isinstance(payload, dict) or not isinstance(payload.get("camera"), dict):
        return payload
    return {**payload, "camera": {**payload["camera"], "frames": [], "frame_b64": None}}


async def _gravar(session: Any, lote_id: str, *, ciclo_id: str | None, erro: str | None) -> None:
    # Adiado (fix round 1): falha aqui não vai para falhou(); a trava vence e o item volta a ser reivindicado.
    await TelemetriaRepository(session).update_lote_analysis(
        batch_id=lote_id, analysis_ciclo_id=ciclo_id, analysis_error=erro
    )
    await session.commit()


async def _falhou(app: Any, lote_id: str, erro: str) -> str:
    """Sessão nova: a da análise pode ter ficado inutilizável (cancelamento do `wait_for` no meio de uma
    consulta). O banco espaça a próxima tentativa ou, na quinta, grava `analysis_error = 'fila: ...'`."""
    async with app.state.session_factory() as session:
        await TelemetriaRepository(session).registrar_falha_analise(batch_id=lote_id, erro=erro)
        await session.commit()
    logger.warning("[analise_fila] lote %s falhou: %s", lote_id, erro.split(":", 1)[0])
    return "falhou"


class _FalhaTransitoria(Exception):
    """A tentativa falhou e a fila tenta de novo: a mensagem vai para `fn_telemetria_analise_falhou`."""


async def analisar_lote_da_fila(app: Any, lote_id: str) -> str:
    """Analisa um lote reivindicado. Devolve um de `RESULTADOS`."""
    async with app.state.session_factory() as session:
        lote = await _ler_lote(session, lote_id)
        if lote is None:
            return "sumiu"
        if lote.get("analysis_ciclo_id") is not None or lote.get("analysis_error") is not None:
            # O pedido terminou entre a reivindicação e aqui: o gatilho de saída já tirou o item.
            return "sumiu"

        try:
            return await _analisar(app, session, lote_id, lote)
        except _FalhaTransitoria as falha:
            erro = str(falha)

    return await _falhou(app, lote_id, erro)


def _descreve(exc: BaseException) -> str:
    return f"{type(exc).__name__}: {exc}"


async def _analisar(app: Any, session: Any, lote_id: str, lote: dict[str, Any]) -> str:
    settings = app.state.settings
    aluno_id = str(lote["aluno_id"])
    try:
        # levantar: banco fora na consulta é falha (a fila tenta de novo), não "nada permitido", que
        # gravaria `modo_restrito` definitivo
        permitidas = await modo_restrito.finalidades_permitidas(session, aluno_id, levantar=True)
    except Exception as exc:  # noqa: BLE001 - vai para a fila como qualquer falha
        raise _FalhaTransitoria(_descreve(exc)) from exc
    if not (permitidas.get("telemetria") and permitidas.get("emocional")):
        await _gravar(session, lote_id, ciclo_id=None, erro=modo_restrito.CODIGO)
        return "modo_restrito"

    payload = _payload_do_lote(lote.get("payload"))
    if payload is None:
        # Nem objeto JSON: não há o que o pipeline ler. Definitivo (tentar de novo dá o mesmo resultado).
        await _gravar(session, lote_id, ciclo_id=None, erro=PAYLOAD_INVALIDO)
        return PAYLOAD_INVALIDO
    if _e_ponteiro_do_r2(payload):
        # Definitivo enquanto não houver leitor do R2; o rótulo guarda o erro que deixou o lote na fila.
        rotulo = f"{PAYLOAD_NO_R2}: {await _ultimo_erro(session, lote_id) or ''}"[:ANALYSIS_ERROR_MAX]
        await _gravar(session, lote_id, ciclo_id=None, erro=rotulo)
        return PAYLOAD_NO_R2
    try:
        eventos_novos = normalizar_eventos_legados(TelemetriaLotePayload.model_validate(_para_validar(payload)))
    except ValidationError as exc:
        # O modelo só serve aos eventos legados; o pipeline lê o `telemetry_payload` cru. Analisa sem eles.
        logger.warning(
            "[analise_fila] lote %s fora do schema (%d erros): analisa sem eventos legados",
            lote_id,
            exc.error_count(),
        )
        eventos_novos = []

    try:
        resultado = await asyncio.wait_for(
            run_analysis(
                request=RequisicaoInterna(app),
                session=session,
                aluno_id=aluno_id,
                classe_id=lote["classe_id"],
                topico_id=lote.get("topico_id"),
                atividade_id=lote.get("atividade_id"),
                frame_b64=None,
                frames_b64=[],
                eventos_novos=eventos_novos,
                modo="telemetria",
                telemetry_payload=payload,
                batch_id=lote_id,
                sessao_id=str(lote["sessao_id"]) if lote.get("sessao_id") is not None else None,
            ),
            timeout=_tempo_maximo_da_analise(settings),
        )
    except Exception as exc:  # noqa: BLE001 - inclui TimeoutError: falha como qualquer outra
        try:
            await session.rollback()
        except Exception:  # noqa: BLE001 - sessão já quebrada; a falha vai por outra
            pass
        raise _FalhaTransitoria(_descreve(exc)) from exc
    ciclo_id = getattr(resultado, "ciclo_id", None) or None
    erros = [str(e) for e in (getattr(resultado, "erros", None) or [])]
    if not ciclo_id:
        # Sem ciclo o pipeline não chegou ao fim: transitório, como no pedido.
        raise _FalhaTransitoria(erros[0] if erros else "analise sem ciclo")
    await _gravar(session, lote_id, ciclo_id=ciclo_id, erro=erros[0] if erros else None)
    return "analisado"


async def processar_fila_analise_uma_vez(app: Any) -> dict[str, int]:
    """Uma passada: até `telemetria_analise_fila_lote` lotes, em série.

    Reivindica **um por vez**, na hora de analisar: reivindicar o lote inteiro de uma vez faria o quinto
    item esperar até 4 análises de 300 s com a trava de 600 s correndo, e a trava venceria antes de ele
    começar (outro worker o pegaria, ou a reivindicação desistiria dele na quinta tentativa).
    """
    settings = app.state.settings
    limite = max(1, int(settings.telemetria_analise_fila_lote))
    trava = int(settings.telemetria_analise_fila_trava_seconds)
    turmas = _turmas_da_fila(settings)
    contagem = dict.fromkeys(RESULTADOS, 0)
    for _ in range(limite):
        async with app.state.session_factory() as session:
            ids = await _reivindicar(session, limite=1, trava_seg=trava, classe_ids=turmas)
            await session.commit()
        if not ids:
            break
        for lote_id in ids:
            try:
                resultado = await analisar_lote_da_fila(app, lote_id)
            except asyncio.CancelledError:
                # Adiado (fix round 1): o desligamento no meio custa uma tentativa (a reivindicação já a contou).
                raise
            except Exception as exc:  # noqa: BLE001 - um lote não derruba a passada
                # Nem a falha conseguiu ser registrada (banco fora): a trava vence e o item volta.
                logger.warning("[analise_fila] lote %s quebrou o worker: %s", lote_id, type(exc).__name__)
                resultado = "falhou"
            contagem[resultado] += 1
    return contagem


async def _consumidor(app: Any) -> None:
    """Um consumidor: passadas seguidas enquanto a fila tiver o que dar, o intervalo quando secar.

    Só dorme quando a passada voltou com menos que o limite (a reivindicação veio vazia) ou falhou: dormir
    o intervalo depois de uma passada cheia limitaria a vazão a `lote` lotes por (`lote` x A + intervalo).
    """
    settings = app.state.settings
    intervalo = max(1, int(settings.telemetria_analise_fila_interval_seconds))
    limite = max(1, int(settings.telemetria_analise_fila_lote))
    while True:
        cheia = False
        try:
            contagem = await processar_fila_analise_uma_vez(app)
            if any(contagem.values()):
                logger.info("[analise_fila] passada: %s", contagem)
            cheia = sum(contagem.values()) >= limite
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - o laço não pode morrer
            logger.warning("[analise_fila] passada falhou: %s", type(exc).__name__)
        if not cheia:
            await asyncio.sleep(intervalo)


async def analise_fila_loop(app: Any) -> None:
    """`telemetria_analise_fila_concorrencia` consumidores ao mesmo tempo.

    Cada um reivindica um item por vez, com as próprias sessões; o `FOR UPDATE SKIP LOCKED` da
    reivindicação os mantém disjuntos. Capacidade com fila cheia: cerca de `concorrencia x 60 / A` lotes
    por minuto, sendo A os segundos de uma análise (o intervalo só conta quando a fila seca). O app manda
    1 lote por minuto por aluno estudando, então com A = 20 s e 2 consumidores a fila acompanha cerca de 6
    alunos ao mesmo tempo; acima disso, ela cresce e drena quando a turma para.
    """
    concorrencia = max(1, int(getattr(app.state.settings, "telemetria_analise_fila_concorrencia", 1)))
    tarefas = [asyncio.create_task(_consumidor(app)) for _ in range(concorrencia)]
    try:
        await asyncio.gather(*tarefas)
    finally:
        for tarefa in tarefas:
            tarefa.cancel()
        await asyncio.gather(*tarefas, return_exceptions=True)
