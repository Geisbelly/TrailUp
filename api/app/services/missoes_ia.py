"""Worker das missões sugeridas pela IA (`20261102_20`, #151).

O professor pede (`missao_ia_pedir`, RPC do banco: quantidade dentro da faixa, teto por dia, nada de
empilhar sugestão sem decisão) e o pedido entra na fila. Este laço reivindica os vencidos e pede ao
modelo as propostas. **Salvar um tópico não chama nada daqui**, e o professor nunca espera a API
acordar: se ela estiver fora, o pedido espera na tabela.

Regra de fronteira: pedir, espaçar tentativas, decidir o que entra e guardar o histórico é
encanamento e mora no banco; propor é IA e mora aqui. A API não escreve em tabela nenhuma: passa o que o
modelo devolveu e a contagem da saída a `fn_missao_ia_registrar_diagnostico`. O banco aplica as regras
que não são do modelo (métrica do catálogo, alvo inteiro dentro do teto, sem link nem e-mail, sem
repetir título, no máximo a quantidade pedida) e guarda só contagens e motivos agregados, sem o texto.
Tudo nasce `pendente`: o banco recusa uma missão `ia` sem aprovação.

Sem modelo, nada é inventado: a falha vai para `fn_missao_ia_falhou`, que espaça a próxima tentativa e,
na quinta, para o pedido como `falhou` para o professor ver no console.

Ao modelo vai o assunto (turma, tópico, conteúdos, atividades) e os títulos das missões que a turma já
tem. Nenhum dado de aluno: nem nome, nem id, nem telemetria. A missão é da turma.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from sqlalchemy import text

from app.schemas.missoes_ia import MissoesIaSaida
from app.services.llm import JsonLLMService, StructuredOutputError

logger = logging.getLogger(__name__)

PROMPT = "missoes_ia.txt"
RESULTADOS = ("registrada", "sumiu", "falhou")

_REIVINDICAR = text(
    "SELECT * FROM public.fn_missao_ia_reivindicar("
    "CAST(:limite AS integer), CAST(:trava AS integer), CAST(:classes AS bigint[]))"
)
_CONTEXTO = text("SELECT public.fn_missao_ia_contexto(CAST(:id AS uuid))")
_REGISTRAR = text(
    "SELECT public.fn_missao_ia_registrar_diagnostico("
    "CAST(:id AS uuid), CAST(:propostas AS jsonb), CAST(:propostas_modelo AS integer))"
)
_FALHOU = text("SELECT public.fn_missao_ia_falhou(CAST(:id AS uuid), CAST(:erro AS text))")


def _json(bruto: Any) -> Any:
    """Sem codec de JSON no asyncpg, o `jsonb` chega como texto."""
    if isinstance(bruto, str):
        try:
            return json.loads(bruto)
        except ValueError:
            return None
    return bruto


def montar_payload(contexto: dict[str, Any]) -> dict[str, Any]:
    """O que o modelo recebe. O contexto do banco já não tem dado de aluno; aqui só se tira o que
    não ajuda a propor (valores nulos), sem acrescentar nada."""
    return {chave: valor for chave, valor in contexto.items() if valor is not None}


def propostas_para_o_banco(saida: MissoesIaSaida, quantidade: int) -> list[dict[str, Any]]:
    """As propostas como lista de dicts, já cortada na quantidade pedida. A validação de verdade é do
    banco; cortar aqui só evita mandar 50 itens quando se pediu 3."""
    return [p.model_dump() for p in saida.propostas[: max(1, int(quantidade)) * 2]]


async def propor_para_pedido(session: Any, llm: JsonLLMService, pedido_id: str) -> str:
    """Atende um pedido reivindicado. Devolve um de `RESULTADOS`; falha de modelo levanta
    `StructuredOutputError` e proposta nenhuma válida levanta do banco (o chamador registra a falha)."""
    contexto = _json((await session.execute(_CONTEXTO, {"id": pedido_id})).scalar())
    if not isinstance(contexto, dict) or not contexto.get("classe"):
        return "sumiu"
    quantidade = int(contexto.get("quantidade") or 1)
    # Sem dado de aluno no payload (só o assunto e os títulos da turma), não há o que a rota de menor
    # protegeria; por isso este worker não usa `rota_ia_para_turma`, ao contrário dos que leem aluno.
    saida = await llm.ainvoke_structured(prompt_name=PROMPT, payload=montar_payload(contexto), schema=MissoesIaSaida)
    enviadas = propostas_para_o_banco(saida, quantidade)
    gerados = await session.execute(
        _REGISTRAR,
        {
            "id": pedido_id,
            "propostas": json.dumps(enviadas),
            "propostas_modelo": len(saida.propostas),
        },
    )
    quantidade_registrada = gerados.scalar()
    await session.commit()
    if quantidade_registrada is None or int(quantidade_registrada) < 0:
        return "sumiu"
    if int(quantidade_registrada) == 0:
        raise RuntimeError("o modelo não trouxe nenhuma proposta válida")
    return "registrada"


async def _falhou(app: Any, pedido_id: str, erro: str) -> None:
    async with app.state.session_factory() as session:
        await session.execute(_FALHOU, {"id": pedido_id, "erro": erro[:500]})
        await session.commit()
    logger.warning("[missoes_ia] pedido %s falhou: %s", pedido_id, erro.split(":", 1)[0])


def _turmas(settings: Any) -> list[int] | None:
    """A guarda do #652: a lista própria, ou, vazia, a dos jobs de personalização; as duas vazias, todas."""
    turmas = list(getattr(settings, "missoes_ia_classe_ids", None) or []) or list(
        getattr(settings, "personalizacao_jobs_classe_ids", None) or []
    )
    return [int(t) for t in turmas] or None


async def processar_pedidos_uma_vez(app: Any, llm: JsonLLMService | None = None) -> dict[str, int]:
    """Uma passada: até `missoes_ia_lote` pedidos, um por vez."""
    settings = app.state.settings
    llm = llm or JsonLLMService(settings)
    limite = max(1, int(settings.missoes_ia_lote))
    trava = int(settings.missoes_ia_trava_seconds)
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
        for pedido_id in ids:
            erro: str | None = None
            try:
                async with app.state.session_factory() as session:
                    resultado = await asyncio.wait_for(
                        propor_para_pedido(session, llm, str(pedido_id)), timeout=max(1, trava // 2)
                    )
            except asyncio.CancelledError:
                raise
            except StructuredOutputError as exc:
                erro, resultado = f"{type(exc).__name__}: {exc}", "falhou"
            except Exception as exc:  # noqa: BLE001 - um pedido não derruba a passada
                erro, resultado = f"{type(exc).__name__}: {exc}", "falhou"
            if erro is not None:
                try:
                    await _falhou(app, str(pedido_id), erro)
                except Exception as exc:  # noqa: BLE001 - banco fora: a trava vence e o pedido volta
                    logger.warning("[missoes_ia] falha nao registrada: %s", type(exc).__name__)
            contagem[resultado] += 1
    return contagem


async def missoes_ia_loop(app: Any) -> None:
    """Passadas seguidas enquanto a fila tiver o que dar; o intervalo quando secar."""
    settings = app.state.settings
    intervalo = max(1, int(settings.missoes_ia_interval_seconds))
    limite = max(1, int(settings.missoes_ia_lote))
    llm = JsonLLMService(settings)
    while True:
        cheia = False
        try:
            contagem = await processar_pedidos_uma_vez(app, llm)
            if any(contagem.values()):
                logger.info("[missoes_ia] passada: %s", contagem)
            cheia = sum(contagem.values()) >= limite
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - o laço não pode morrer
            logger.warning("[missoes_ia] passada falhou: %s", type(exc).__name__)
        if not cheia:
            await asyncio.sleep(intervalo)


__all__ = [
    "missoes_ia_loop",
    "montar_payload",
    "processar_pedidos_uma_vez",
    "propor_para_pedido",
    "propostas_para_o_banco",
]
