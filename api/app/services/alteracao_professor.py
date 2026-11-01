"""Worker da análise de alteração do professor (`20261101_12`).

Quando o professor muda um conteúdo ou uma atividade que algum aluno já viu ou fez, o banco registra o
que mudou e quem importa (`alteracao_professor` / `alteracao_aluno`) e põe a linha na fila. Este laço
reivindica as linhas vencidas e pede ao modelo duas decisões: se a mudança é cosmética ou relevante, e,
por aluno, se ele precisa revisar a atividade.

Regra de fronteira: registrar, espaçar tentativas, entregar o aviso e guardar a nota de antes é
encanamento e mora no banco; decidir é IA e mora aqui. A API não escreve em tabela nenhuma: passa a
decisão a `fn_alteracao_registrar_decisao`, que aplica as regras que não são do modelo (revisão só
para quem fez, só em atividade com questão; aluno não citado fica só com destaque).

Sem modelo, nada é inventado: a falha vai para `fn_alteracao_falhou`, a linha continua
`pendente_analise` e o aluno não vê destaque até a IA (ou o professor, no console) decidir.

Ao modelo vai perfil, nota e acertos de cada aluno, com uma referência curta no lugar do id. Nada de
nome, emoção ou telemetria. Turma com menor vai pela rota de menor, como os insights.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from sqlalchemy import text

from app.schemas.alteracao_professor import AlteracaoProfessorSaida
from app.services.llm import JsonLLMService, StructuredOutputError
from app.services.roteamento_ia import rota_ia_para_turma

logger = logging.getLogger(__name__)

PROMPT = "alteracao_professor.txt"
MAX_RESUMO = 160
MAX_MOTIVO = 200
RESULTADOS = ("decidida", "sumiu", "falhou")

_REIVINDICAR = text(
    "SELECT * FROM public.fn_alteracao_reivindicar("
    "CAST(:limite AS integer), CAST(:trava AS integer), CAST(:classes AS bigint[]))"
)
_CONTEXTO = text("SELECT public.fn_alteracao_contexto(CAST(:id AS bigint))")
_DECIDIR = text(
    "SELECT public.fn_alteracao_registrar_decisao(CAST(:id AS bigint), CAST(:classificacao AS text), "
    "CAST(:resumo AS text), CAST(:motivo AS text), CAST(:alunos AS jsonb))"
)
_FALHOU = text("SELECT public.fn_alteracao_falhou(CAST(:id AS bigint), CAST(:erro AS text))")


def _json(bruto: Any) -> Any:
    """Sem codec de JSON no asyncpg, o `jsonb` chega como texto."""
    if isinstance(bruto, str):
        try:
            return json.loads(bruto)
        except ValueError:
            return None
    return bruto


def montar_payload(contexto: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    """Troca o uuid de cada aluno por uma ref curta (A1, A2...). Devolve o payload e ref -> uuid."""
    refs: dict[str, str] = {}
    alunos = []
    for indice, aluno in enumerate(contexto.get("alunos") or [], start=1):
        ref = f"A{indice}"
        refs[ref] = str(aluno.get("aluno_id"))
        alunos.append({"ref": ref, **{k: v for k, v in aluno.items() if k != "aluno_id"}})
    payload = {
        "alteracao": contexto.get("alteracao") or {},
        "topico": contexto.get("topico") or {},
        "alvo": contexto.get("alvo") or {},
        "alunos": alunos,
    }
    return payload, refs


def _curto(texto: str | None, limite: int) -> str:
    return " ".join((texto or "").split())[:limite]


def validar_decisao(saida: AlteracaoProfessorSaida, refs: dict[str, str]) -> list[dict[str, Any]]:
    """Decisões por aluno, já com o uuid. Ref fora do payload é descartada (o modelo não cria aluno);
    ref repetida vale a primeira. Cosmética não leva ninguém: o banco marca todos como cosmética."""
    if saida.classificacao == "cosmetica":
        return []
    decisoes: list[dict[str, Any]] = []
    vistos: set[str] = set()
    for item in saida.alunos:
        aluno_id = refs.get((item.aluno_ref or "").strip().upper())
        if aluno_id is None:
            logger.info("[alteracao_professor] decisao descartada: aluno_ref %r fora do payload", item.aluno_ref)
            continue
        if aluno_id in vistos:
            continue
        vistos.add(aluno_id)
        decisoes.append(
            {"aluno_id": aluno_id, "revisar": bool(item.revisar), "motivo": _curto(item.motivo, MAX_MOTIVO)}
        )
    return decisoes


async def decidir_alteracao(session: Any, llm: JsonLLMService, alteracao_id: int) -> str:
    """Analisa uma alteração reivindicada. Devolve um de `RESULTADOS`; falha de modelo levanta
    `StructuredOutputError` (o chamador registra a falha)."""
    contexto = _json((await session.execute(_CONTEXTO, {"id": alteracao_id})).scalar())
    if not isinstance(contexto, dict) or not contexto.get("alteracao"):
        return "sumiu"
    payload, refs = montar_payload(contexto)
    async with rota_ia_para_turma(session, refs.values()):
        saida = await llm.ainvoke_structured(prompt_name=PROMPT, payload=payload, schema=AlteracaoProfessorSaida)
    alunos = validar_decisao(saida, refs)
    await session.execute(
        _DECIDIR,
        {
            "id": alteracao_id,
            "classificacao": saida.classificacao,
            "resumo": _curto(saida.resumo, MAX_RESUMO) if saida.classificacao == "relevante" else "",
            "motivo": _curto(saida.motivo, 300),
            "alunos": json.dumps(alunos),
        },
    )
    await session.commit()
    return "decidida"


async def _falhou(app: Any, alteracao_id: int, erro: str) -> None:
    async with app.state.session_factory() as session:
        await session.execute(_FALHOU, {"id": alteracao_id, "erro": erro[:500]})
        await session.commit()
    logger.warning("[alteracao_professor] alteracao %s falhou: %s", alteracao_id, erro.split(":", 1)[0])


def _turmas(settings: Any) -> list[int] | None:
    """A guarda do #652: a lista própria, ou, vazia, a dos jobs de personalização; as duas vazias, todas."""
    turmas = list(getattr(settings, "alteracao_professor_classe_ids", None) or []) or list(
        getattr(settings, "personalizacao_jobs_classe_ids", None) or []
    )
    return [int(t) for t in turmas] or None


async def processar_alteracoes_uma_vez(app: Any, llm: JsonLLMService | None = None) -> dict[str, int]:
    """Uma passada: até `alteracao_professor_lote` alterações, uma por vez."""
    settings = app.state.settings
    llm = llm or JsonLLMService(settings)
    limite = max(1, int(settings.alteracao_professor_lote))
    trava = int(settings.alteracao_professor_trava_seconds)
    turmas = _turmas(settings)
    contagem = dict.fromkeys(RESULTADOS, 0)
    for _ in range(limite):
        async with app.state.session_factory() as session:
            ids = list(
                (await session.execute(_REIVINDICAR, {"limite": 1, "trava": trava, "classes": turmas})).scalars().all()
            )
            await session.commit()
        if not ids:
            break
        for alteracao_id in ids:
            erro: str | None = None
            try:
                async with app.state.session_factory() as session:
                    resultado = await asyncio.wait_for(
                        decidir_alteracao(session, llm, int(alteracao_id)), timeout=max(1, trava // 2)
                    )
            except asyncio.CancelledError:
                raise
            except StructuredOutputError as exc:
                erro, resultado = f"{type(exc).__name__}: {exc}", "falhou"
            except Exception as exc:  # noqa: BLE001 - uma alteração não derruba a passada
                erro, resultado = f"{type(exc).__name__}: {exc}", "falhou"
            if erro is not None:
                try:
                    await _falhou(app, int(alteracao_id), erro)
                except Exception as exc:  # noqa: BLE001 - banco fora: a trava vence e a linha volta
                    logger.warning("[alteracao_professor] falha nao registrada: %s", type(exc).__name__)
            contagem[resultado] += 1
    return contagem


async def alteracao_professor_loop(app: Any) -> None:
    """Passadas seguidas enquanto a fila tiver o que dar; o intervalo quando secar."""
    settings = app.state.settings
    intervalo = max(1, int(settings.alteracao_professor_interval_seconds))
    limite = max(1, int(settings.alteracao_professor_lote))
    llm = JsonLLMService(settings)
    while True:
        cheia = False
        try:
            contagem = await processar_alteracoes_uma_vez(app, llm)
            if any(contagem.values()):
                logger.info("[alteracao_professor] passada: %s", contagem)
            cheia = sum(contagem.values()) >= limite
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - o laço não pode morrer
            logger.warning("[alteracao_professor] passada falhou: %s", type(exc).__name__)
        if not cheia:
            await asyncio.sleep(intervalo)


__all__ = [
    "alteracao_professor_loop",
    "decidir_alteracao",
    "montar_payload",
    "processar_alteracoes_uma_vez",
    "validar_decisao",
]
