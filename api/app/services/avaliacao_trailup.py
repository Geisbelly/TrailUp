"""O que o Guia (aluno de teste) e a Lumi (professor) sabem da avaliação do avaliador.

Só para as duas contas de quem avalia o TrailUp na pesquisa com professores (`pesquisa_avaliador`,
`20261123_01`): o roteiro do vídeo "Passo a passo da pesquisa", as etapas que ele já marcou e as
anotações que ele escreveu (`20261123_03`). Para qualquer outra conta, nada muda: a função devolve
`None` e o payload não ganha a chave.

**O roteiro é cópia.** A fonte é `frontend/src/features/pesquisa/roteiroDaPesquisa.ts` (com as
tarefas de `pesquisaProfessores.ts`); `app/agent/prompts/pesquisa_roteiro.json` é a cópia que o
modelo lê, e o teste `roteiroDaPesquisa.paridade.test.ts` do frontend falha se as duas se separarem.

**As anotações são do avaliador** e só ele as lê (não há policy nem para o dono). Elas vão ao modelo
porque o próprio avaliador pediu ajuda ao guia dele, passam pelo mascarador do chat (e-mail,
telefone, link, documento) e chegam cortadas, das mais recentes para as mais antigas.

**Ler nunca derruba o chat.** A consulta roda num SAVEPOINT: se as tabelas não existirem no banco
ou a leitura falhar, só ela é desfeita e o guia responde como responderia a qualquer outra conta.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.llm import PROMPTS_DIR
from app.services.mascaramento_chat import mascarar

logger = logging.getLogger(__name__)

MAX_ANOTACOES = 30
MAX_CARACTERES_DA_ANOTACAO = 600

_SQL_AVALIADOR = text(
    """
    SELECT pa.id,
           CASE WHEN pa.professor_id = CAST(:usuario AS uuid) THEN 'professor' ELSE 'aluno' END AS papel,
           pa.classe_id
      FROM public.pesquisa_avaliador pa
     WHERE pa.professor_id = CAST(:usuario AS uuid) OR pa.aluno_teste_id = CAST(:usuario AS uuid)
     LIMIT 1
    """
)
_SQL_MARCAS = text(
    "SELECT etapa, feita_em FROM public.pesquisa_roteiro_marca WHERE avaliador_id = :avaliador ORDER BY feita_em"
)
_SQL_ANOTACOES = text(
    """
    SELECT etapa, plataforma, texto, criada_em
      FROM public.pesquisa_anotacao
     WHERE avaliador_id = :avaliador
     ORDER BY criada_em DESC, id DESC
     LIMIT :limite
    """
)

ONDE = {"site": "no site", "console": "no console do professor", "app": "no app do aluno"}


@lru_cache(maxsize=1)
def etapas_do_roteiro() -> list[dict[str, Any]]:
    """As etapas, na ordem do vídeo. Cópia do roteiro do frontend (ver o docstring do módulo)."""
    return json.loads((PROMPTS_DIR / "pesquisa_roteiro.json").read_text(encoding="utf-8"))


def _data(valor: Any) -> str | None:
    if valor is None:
        return None
    iso = getattr(valor, "isoformat", None)
    return iso() if callable(iso) else str(valor)


def montar_avaliacao(
    papel: str, marcas: list[dict[str, Any]], anotacoes: list[dict[str, Any]]
) -> dict[str, Any]:
    """O bloco `avaliacao_trailup` do payload, a partir do que o banco devolveu."""
    feitas = {str(m.get("etapa")) for m in marcas if m.get("etapa")}
    etapas = [
        {
            "id": e["id"],
            "titulo": e["titulo"],
            "onde": ONDE.get(e["onde"], e["onde"]),
            "passos": e["passos"],
            "observar": e.get("observar"),
            "feita": e["id"] in feitas,
        }
        for e in etapas_do_roteiro()
    ]
    proxima = next((e for e in etapas if not e["feita"]), None)
    return {
        "papel_desta_conta": papel,
        "onde_responder": "Na aba Avaliar o TrailUp do console: as quatro perguntas de cada tarefa, os blocos e as perguntas abertas.",
        "etapas": etapas,
        "feitas": sum(1 for e in etapas if e["feita"]),
        "total": len(etapas),
        "proxima_etapa": {"id": proxima["id"], "titulo": proxima["titulo"]} if proxima else None,
        "anotacoes": [
            {
                "etapa": a.get("etapa"),
                "onde_escreveu": "console" if a.get("plataforma") == "console" else "app",
                "quando": _data(a.get("criada_em")),
                "texto": mascarar(str(a.get("texto") or ""))[:MAX_CARACTERES_DA_ANOTACAO],
            }
            for a in anotacoes
            if str(a.get("texto") or "").strip()
        ],
    }


async def contexto_da_avaliacao(session: AsyncSession | None, usuario_id: Any) -> dict[str, Any] | None:
    """O bloco da avaliação, só se a conta é de avaliador. Qualquer falha devolve `None`."""
    if session is None or not usuario_id:
        return None
    try:
        async with session.begin_nested():
            linha = (await session.execute(_SQL_AVALIADOR, {"usuario": str(usuario_id)})).mappings().first()
            if not linha:
                return None
            marcas = [dict(m) for m in (await session.execute(_SQL_MARCAS, {"avaliador": linha["id"]})).mappings()]
            anotacoes = [
                dict(a)
                for a in (
                    await session.execute(_SQL_ANOTACOES, {"avaliador": linha["id"], "limite": MAX_ANOTACOES})
                ).mappings()
            ]
    except Exception as exc:  # tabela ausente, uuid inválido, banco fora
        logger.warning("avaliacao_trailup.leitura_falhou: %s", type(exc).__name__)
        return None
    return montar_avaliacao(str(linha["papel"]), marcas, anotacoes)
