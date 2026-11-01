"""`20261101_07`: o professor volta a gravar nas tabelas com índice sobre `trailup_caminho_arquivo`.

O índice de expressão roda com o papel de quem escreve. Sem EXECUTE em `authenticated`, o INSERT do
console morria com `permission denied for function trailup_caminho_arquivo` (403).
"""

from __future__ import annotations

import psycopg
import pytest

from tests import _f5_banco as f5
from tests.test_e2e_kpis_por_topico import _trecho

M = f5.modulo("20261101_07_professor_volta_a_gravar_conteudo.py")
INDICES = f5.modulo("20261024_10_bucket_conteudos_privado.py")._indices_sql()
# A função como a `_07` a deixou, com o REVOKE de `authenticated`.
FUNCAO = _trecho(
    "20261024_07_exclusao_professor_e_aviso_inatividade.py",
    "CREATE OR REPLACE FUNCTION public.trailup_caminho_arquivo(p text)",
    "FROM PUBLIC, anon, authenticated;",
)
TABELAS = ("conteudos", "midias", "questoes", "cards")
# O esqueleto não traz GRANT; em produção `authenticated` escreve nas quatro (a RLS decide a posse).
ESCRITA = "".join(
    f"GRANT INSERT, UPDATE, SELECT ON public.{t} TO authenticated;" for t in TABELAS
) + "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;"


def _semear(c) -> None:
    f5.semear_turma(c)
    f5.afrouxa(c, "atividades")
    c.execute("INSERT INTO public.atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES (1, 10, 'A')")


def _gravar_como_professor(c) -> None:
    c.execute("BEGIN")
    try:
        f5.como(c, f5.PROF)
        c.execute("SET LOCAL ROLE authenticated")
        cid = c.execute(
            "INSERT INTO public.conteudos (topico_id, titulo, tipo, conteudo) VALUES (10, 'T', 'texto', '# Oi')"
            " RETURNING id"
        ).fetchone()[0]
        c.execute("UPDATE public.conteudos SET conteudo = 'prof/10/a.pdf' WHERE id = %s", (cid,))
        c.execute("INSERT INTO public.midias (conteudo_id, tipo, url) VALUES (%s, 'imagem', 'prof/10/b.png')", (cid,))
        c.execute("INSERT INTO public.questoes (atividade_id, enunciado, midia_url) VALUES (1, 'Q', 'prof/10/c.png')")
        c.execute("INSERT INTO public.cards (conteudo_id, titulo, imagem_url) VALUES (%s, 'C', NULL)", (cid,))
    finally:
        c.execute("ROLLBACK")


@f5.e2e
def test_sem_a_migration_o_insert_do_professor_e_recusado() -> None:
    with f5.banco(FUNCAO, INDICES, ESCRITA) as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="trailup_caminho_arquivo"):
            _gravar_como_professor(c)


@f5.e2e
def test_com_a_migration_o_professor_grava_nas_quatro_tabelas() -> None:
    with f5.banco(FUNCAO, INDICES, ESCRITA, *f5.sql_de(M)) as c:
        _semear(c)
        _gravar_como_professor(c)
        assert not c.execute(
            "SELECT has_function_privilege('anon', 'public.trailup_caminho_arquivo(text)', 'EXECUTE')"
        ).fetchone()[0]


@f5.e2e
def test_downgrade_tira_o_execute_de_novo() -> None:
    with f5.banco(FUNCAO, *f5.sql_de(M), *f5.sql_de(M, "downgrade")) as c:
        assert not c.execute(
            "SELECT has_function_privilege('authenticated', 'public.trailup_caminho_arquivo(text)', 'EXECUTE')"
        ).fetchone()[0]
