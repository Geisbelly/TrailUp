"""Worker do diagnóstico antes do tópico (`20261105_22`, #137).

O aluno pede (`diagnostico_pedir`, RPC do banco: só da própria turma, uma vez por tópico, só antes de
começar, nada para turma retida pelo estudo) e o pedido entra na fila. Este laço reivindica os vencidos
e pede ao modelo 3 a 5 perguntas sobre o que o tópico ensina. O aluno nunca espera a API acordar: se ela
estiver fora, o pedido espera na tabela.

Regra de fronteira: pedir, espaçar tentativas, corrigir, decidir o nível e desistir é encanamento e mora
no banco; escrever as perguntas é IA e mora aqui. A API não escreve em tabela nenhuma: passa o que o
modelo devolveu a `fn_diagnostico_registrar`, que valida tamanho, quantidade, resposta dentro das opções
e links, e guarda o gabarito onde o cliente não chega.

O diagnóstico NÃO dispara geração de material nem mexe no `source_hash`: custa uma chamada curta por
aluno e tópico. Sem modelo (cota estourada, 402, timeout), nada é inventado: a falha vai para
`fn_diagnostico_falhou`, que espaça a próxima tentativa e, na terceira, deixa o pedido `sem_ia` e o aluno
segue o tópico como sempre.

Ao modelo vão só o tópico e o conteúdo do professor. Nenhum dado de aluno: nem nome, nem id, nem
telemetria, então não há o que a rota de menor protegeria (como em `missoes_ia`).
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from sqlalchemy import text

from app.schemas.diagnostico import DiagnosticoSaida
from app.services.llm import JsonLLMService, StructuredOutputError

logger = logging.getLogger(__name__)

PROMPT = "diagnostico_topico.txt"
RESULTADOS = ("registrado", "sumiu", "falhou")

_REIVINDICAR = text(
    "SELECT * FROM public.fn_diagnostico_reivindicar("
    "CAST(:limite AS integer), CAST(:trava AS integer), CAST(:classes AS bigint[]))"
)
_CONTEXTO = text("SELECT public.fn_diagnostico_contexto(CAST(:id AS uuid))")
_REGISTRAR = text("SELECT public.fn_diagnostico_registrar(CAST(:id AS uuid), CAST(:perguntas AS jsonb))")
_FALHOU = text("SELECT public.fn_diagnostico_falhou(CAST(:id AS uuid), CAST(:erro AS text))")


def _json(bruto: Any) -> Any:
    """Sem codec de JSON no asyncpg, o `jsonb` chega como texto."""
    if isinstance(bruto, str):
        try:
            return json.loads(bruto)
        except ValueError:
            return None
    return bruto


def montar_payload(contexto: dict[str, Any]) -> dict[str, Any]:
    """O que o modelo recebe. O contexto do banco já não tem dado de aluno; aqui só se tira o que não ajuda
    (valores nulos), sem acrescentar nada."""
    return {chave: valor for chave, valor in contexto.items() if valor is not None}


def perguntas_para_o_banco(saida: DiagnosticoSaida, maximo: int) -> list[dict[str, Any]]:
    """As perguntas como lista de dicts, cortadas em `maximo` * 2: a validação de verdade é do banco, que
    descarta as ruins e fica com até `maximo`; sobra margem para as descartadas sem mandar 50 itens."""
    return [p.model_dump() for p in saida.perguntas[: max(1, int(maximo)) * 2]]


async def perguntar_para_diagnostico(session: Any, llm: JsonLLMService, diagnostico_id: str) -> str:
    """Atende um pedido reivindicado. Devolve um de `RESULTADOS`; falha do modelo levanta
    `StructuredOutputError` e pergunta nenhuma válida levanta do banco (o chamador registra a falha)."""
    contexto = _json((await session.execute(_CONTEXTO, {"id": diagnostico_id})).scalar())
    if not isinstance(contexto, dict) or not contexto.get("topico"):
        return "sumiu"
    maximo = int(contexto.get("max_perguntas") or 5)
    saida = await llm.ainvoke_structured(prompt_name=PROMPT, payload=montar_payload(contexto), schema=DiagnosticoSaida)
    resultado = await session.execute(
        _REGISTRAR, {"id": diagnostico_id, "perguntas": json.dumps(perguntas_para_o_banco(saida, maximo))}
    )
    registradas = resultado.scalar()
    await session.commit()
    # 0 = o pedido deixou de estar pendente enquanto o modelo pensava (dispensado, ou outro worker).
    if registradas is None or int(registradas) <= 0:
        return "sumiu"
    return "registrado"


async def _falhou(app: Any, diagnostico_id: str, erro: str) -> None:
    async with app.state.session_factory() as session:
        await session.execute(_FALHOU, {"id": diagnostico_id, "erro": erro[:500]})
        await session.commit()
    logger.warning("[diagnostico] pedido %s falhou: %s", diagnostico_id, erro.split(":", 1)[0])


def _turmas(settings: Any) -> list[int] | None:
    """A guarda do #652: a lista própria, ou, vazia, a dos jobs de personalização; as duas vazias, todas."""
    turmas = list(getattr(settings, "diagnostico_classe_ids", None) or []) or list(
        getattr(settings, "personalizacao_jobs_classe_ids", None) or []
    )
    return [int(t) for t in turmas] or None


async def processar_diagnosticos_uma_vez(app: Any, llm: JsonLLMService | None = None) -> dict[str, int]:
    """Uma passada: até `diagnostico_lote` pedidos, um por vez."""
    settings = app.state.settings
    llm = llm or JsonLLMService(settings)
    limite = max(1, int(settings.diagnostico_lote))
    trava = int(settings.diagnostico_trava_seconds)
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
        for diagnostico_id in ids:
            erro: str | None = None
            try:
                async with app.state.session_factory() as session:
                    resultado = await asyncio.wait_for(
                        perguntar_para_diagnostico(session, llm, str(diagnostico_id)), timeout=max(1, trava // 2)
                    )
            except asyncio.CancelledError:
                raise
            except StructuredOutputError as exc:
                erro, resultado = f"{type(exc).__name__}: {exc}", "falhou"
            except Exception as exc:  # noqa: BLE001 - um pedido não derruba a passada
                erro, resultado = f"{type(exc).__name__}: {exc}", "falhou"
            if erro is not None:
                try:
                    await _falhou(app, str(diagnostico_id), erro)
                except Exception as exc:  # noqa: BLE001 - banco fora: a trava vence e o pedido volta
                    logger.warning("[diagnostico] falha nao registrada: %s", type(exc).__name__)
            contagem[resultado] += 1
    return contagem


async def diagnostico_loop(app: Any) -> None:
    """Passadas seguidas enquanto a fila tiver o que dar; o intervalo quando secar."""
    settings = app.state.settings
    intervalo = max(1, int(settings.diagnostico_interval_seconds))
    limite = max(1, int(settings.diagnostico_lote))
    llm = JsonLLMService(settings)
    while True:
        cheia = False
        try:
            contagem = await processar_diagnosticos_uma_vez(app, llm)
            if any(contagem.values()):
                logger.info("[diagnostico] passada: %s", contagem)
            cheia = sum(contagem.values()) >= limite
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - o laço não pode morrer
            logger.warning("[diagnostico] passada falhou: %s", type(exc).__name__)
        if not cheia:
            await asyncio.sleep(intervalo)


__all__ = [
    "diagnostico_loop",
    "montar_payload",
    "perguntar_para_diagnostico",
    "perguntas_para_o_banco",
    "processar_diagnosticos_uma_vez",
]
