"""Observabilidade do RAG (#67): o que a busca no Vector Store fez, sem texto do aluno.

`OpenAIRagService.invoke_structured` monta um resumo de cada chamada com `file_search`
(`resumo_da_busca`) e o entrega a quem estiver coletando (`coletar_buscas_rag`). Quem tem
sessão e aluno (o chat do mentor) grava os resumos em `ia_decision_logs`
(`gravar_buscas_rag`), uma linha por busca, `source='chat'` e `stage='rag_retrieval'`.

O que entra no resumo, e por quê:

- **Sem texto.** Nem a mensagem do aluno, nem as consultas que o modelo gerou a partir dela
  (`file_search_call.queries` deriva do texto do aluno), nem o trecho recuperado, nem o nome do
  arquivo. Das consultas fica só a quantidade.
- **Recuperação:** `file_id` e `score` de cada resultado (a API não expõe id de chunk; o par
  arquivo e score é o que identifica o que voltou), `n_resultados`, `score_max` e
  `score_medio` (relevância) e `com_resultado` (cobertura).
- **Custo:** `latencia_ms` é a chamada inteira da Responses API (busca e geração juntas; a API
  não separa o tempo da busca). `top_k` é o `max_num_results` configurado
  (`OPENAI_RAG_TOP_K`), ou `null` quando vale o padrão da OpenAI.
- **Falha:** `status='erro'` e o nome da exceção, nunca a mensagem (pode trazer conteúdo).
- **Intervenção:** quem grava informa se o guardrail interveio (retry ou fallback) na resposta
  que usou a busca; a taxa de intervenção sai da proporção dessas linhas.

Menor de idade (#195): a busca já vai só para a OpenAI, com `store=False`. Este módulo não manda
nada para fora: grava no nosso banco, sem texto.
"""

from __future__ import annotations

import logging
from contextvars import ContextVar
from typing import Any

logger = logging.getLogger(__name__)

STAGE = "rag_retrieval"
SOURCE = "chat"
MAX_RESULTADOS_NO_LOG = 20

_coletor: ContextVar[list[dict[str, Any]] | None] = ContextVar("rag_buscas", default=None)


def _campo(item: Any, nome: str) -> Any:
    if isinstance(item, dict):
        return item.get(nome)
    return getattr(item, nome, None)


def resumo_da_busca(
    response: Any,
    *,
    latencia_ms: float,
    prompt_name: str,
    model: str | None,
    top_k: int | None,
    erro: BaseException | None = None,
) -> dict[str, Any]:
    """Resumo sem texto de uma chamada com `file_search`. `response` pode ser `None` (falhou)."""
    consultas = 0
    resultados: list[dict[str, Any]] = []
    for item in _campo(response, "output") or []:
        if _campo(item, "type") != "file_search_call":
            continue
        consultas += len(_campo(item, "queries") or [])
        for r in _campo(item, "results") or []:
            score = _campo(r, "score")
            resultados.append(
                {
                    "file_id": _campo(r, "file_id"),
                    "score": round(float(score), 4) if isinstance(score, (int, float)) else None,
                }
            )
    scores = [r["score"] for r in resultados if r["score"] is not None]
    return {
        "provider": "openai",
        "prompt": prompt_name,
        "model": model,
        "status": "erro" if erro is not None else "ok",
        "erro": type(erro).__name__ if erro is not None else None,
        "latencia_ms": round(float(latencia_ms), 1),
        "top_k": top_k,
        "consultas": consultas,
        "n_resultados": len(resultados),
        "com_resultado": bool(resultados),
        "score_max": max(scores) if scores else None,
        "score_medio": round(sum(scores) / len(scores), 4) if scores else None,
        "resultados": resultados[:MAX_RESULTADOS_NO_LOG],
    }


def registrar_busca(resumo: dict[str, Any]) -> None:
    """Entrega o resumo a quem estiver coletando e deixa uma linha no log da aplicação."""
    buscas = _coletor.get()
    if buscas is not None:
        buscas.append(resumo)
    logger.info(
        "rag.retrieval=%s",
        {k: resumo.get(k) for k in ("prompt", "status", "erro", "latencia_ms", "top_k", "n_resultados", "score_max")},
    )


class coletar_buscas_rag:  # noqa: N801 - usado como gerenciador de contexto
    """Coleta as buscas feitas dentro do bloco (mesma tarefa/contexto). Serve em `with` e em
    `async with` (para entrar na mesma linha que `rota_ia_para_alunos`)."""

    def __init__(self) -> None:
        self.buscas: list[dict[str, Any]] = []
        self._token: Any = None

    def __enter__(self) -> list[dict[str, Any]]:
        self._token = _coletor.set(self.buscas)
        return self.buscas

    def __exit__(self, *exc: object) -> None:
        _coletor.reset(self._token)

    async def __aenter__(self) -> list[dict[str, Any]]:
        return self.__enter__()

    async def __aexit__(self, *exc: object) -> None:
        self.__exit__(*exc)


def iniciar_coleta_rag() -> list[dict[str, Any]]:
    """Começa a coletar no contexto atual, sem bloco: serve para um handler de requisição (cada
    requisição roda no próprio contexto, então a coleta morre com ela). Fora disso, prefira
    `coletar_buscas_rag`."""
    buscas: list[dict[str, Any]] = []
    _coletor.set(buscas)
    return buscas


async def gravar_buscas_rag(
    repo: Any,
    buscas: list[dict[str, Any]],
    *,
    aluno_id: str,
    classe_id: int,
    topico_id: int | None = None,
    conteudo_id: int | None = None,
    trigger_event: str | None = None,
    intervencao: bool = False,
) -> int:
    """Uma linha de `ia_decision_logs` por busca. Sem `prompt_text` nem `raw_response`."""
    for busca in buscas:
        await repo.log(
            aluno_id=aluno_id,
            classe_id=classe_id,
            topico_id=topico_id,
            conteudo_id=conteudo_id,
            source=SOURCE,
            stage=STAGE,
            provider=busca.get("provider"),
            model_name=busca.get("model"),
            trigger_event=trigger_event,
            input_summary={**busca, "intervencao": bool(intervencao)},
            decision_summary=(
                f"rag {busca.get('status')}: {busca.get('n_resultados')} resultado(s) em {busca.get('latencia_ms')} ms"
            ),
        )
    return len(buscas)
