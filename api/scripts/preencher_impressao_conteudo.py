"""Dá a impressão de conteúdo ao material pronto gerado antes da camada de reuso (20261104_08).

Sem ela, a linha antiga não é encontrada como origem: duplicar uma turma já personalizada geraria
tudo de novo. A linha também ganha a impressão sozinha quando passa pelo worker; este script só evita
esperar por isso.

Só grava quando o `source_hash` recalculado é o da linha: se o conteúdo mudou depois da geração, o
material não corresponde mais a ele e a impressão seria falsa. Calcular a impressão baixa cada
arquivo uma vez, e guarda o hash dele em `fontes_personalizacao.metadata` mesmo sem `--aplicar`.

Uso, a partir de `api/`:
    python -m scripts.preencher_impressao_conteudo
    python -m scripts.preencher_impressao_conteudo --aplicar
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import text

from app.core.settings import get_settings
from app.db.session import build_session_factory
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.services.personalizacao import fetch_personalizacao_context

_LINHAS_SEM_IMPRESSAO = text(
    """
    SELECT id, classe_id, topico_id, conteudo_id, source_hash
      FROM conteudo_personalizado
     WHERE aluno_id IS NULL
       AND status = 'pronto'
       AND conteudo_id IS NOT NULL
       AND impressao_conteudo IS NULL
     ORDER BY id
    """
)


async def executar(aplicar: bool) -> int:
    settings = get_settings()
    engine, sessions = build_session_factory(settings)
    gravadas = puladas = 0
    try:
        async with sessions() as session:
            linhas = [dict(row) for row in (await session.execute(_LINHAS_SEM_IMPRESSAO)).mappings()]
            await session.commit()
        for linha in linhas:
            async with sessions() as session:
                ctx = await fetch_personalizacao_context(
                    aluno_id=None,
                    classe_id=int(linha["classe_id"]),
                    topico_id=int(linha["topico_id"]),
                    conteudo_id=int(linha["conteudo_id"]),
                    settings=settings,
                    session=session,
                    include_student_sources=False,
                )
                impressao = ctx.get("impressao_conteudo")
                if not impressao or ctx.get("source_hash") != linha["source_hash"]:
                    puladas += 1
                    print(f"linha {linha['id']}: pulada (sem impressão, ou conteúdo mudou depois da geração)")
                    await session.commit()
                    continue
                if aplicar:
                    await ConteudoPersonalizadoRepository(session).gravar_impressao(
                        record_id=int(linha["id"]),
                        impressao=str(impressao),
                    )
                await session.commit()
                gravadas += 1
    finally:
        await engine.dispose()
    verbo = "gravadas" if aplicar else "a gravar (rode com --aplicar)"
    print(f"{gravadas} linha(s) {verbo}, {puladas} pulada(s).")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--aplicar", action="store_true", help="grava a impressão; sem isto só mostra o plano")
    return asyncio.run(executar(parser.parse_args().aplicar))


if __name__ == "__main__":
    sys.exit(main())
