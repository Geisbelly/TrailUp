"""`20261031_03`: as dez views de métricas entram no Alembic com o texto de produção (F5, Task 1)."""

from __future__ import annotations

import hashlib

from tests import _f5_banco as f5

ARQUIVO = "20261031_03_views_de_metricas_no_alembic.py"
M = f5.modulo(ARQUIVO)

# md5 de `pg_get_viewdef(oid, true)` na produção, 31/10 (somente leitura).
MD5_PRODUCAO = {
    "vw_aluno_perfil_segmentos": "843202053be4e82a7d3e4b2450074c6a",
    "vw_metricas_sessoes_aluno_dia": "af2ef2d4583a08d23d03766bf6f7221d",
    "vw_metricas_chat_aluno_classe": "cbb9b8420b60d61aa3b64faf10d7abf7",
    "vw_metricas_comportamento_aluno_classe": "555fc6b1af177cc293a58e736edf6eee",
    "vw_metricas_desempenho_aluno_classe": "8e32d5ce4dcf851c788b059279d385ea",
    "vw_metricas_evolucao_desempenho_aluno_dia": "43bbbc00f4f1fad8d11ec0e712f4ae89",
    "vw_metricas_engajamento_aluno_classe": "ee2685a936afa182aebb3763fde24cae",
    "vw_metricas_distribuicao_turma_classe": "5e155e24bc4bebc7ec187fc1d4614816",
    "vw_metricas_turma_geral_classe": "f6e0b3c1e70354ebf115fe90d0bf1bfc",
    "vw_metricas_turma_perfil_classe": "3527e505c6d9bd20294beb983e3182e8",
}


def test_encadeia_na_cabeca_da_main() -> None:
    assert (M.revision, M.down_revision) == ("20261031_03", "20261031_02")


def test_as_dez_sao_o_texto_de_producao_byte_a_byte() -> None:
    assert [nome for nome, _ in M.VIEWS] == list(MD5_PRODUCAO)
    for nome, corpo in M.VIEWS:
        assert hashlib.md5(corpo.encode()).hexdigest() == MD5_PRODUCAO[nome], nome


def test_ordem_respeita_dependencias() -> None:
    ordem = [nome for nome, _ in M.VIEWS]
    for nome, corpo in M.VIEWS:
        for outra in ordem:
            if outra != nome and f" {outra} " in corpo:
                assert ordem.index(outra) < ordem.index(nome), f"{nome} lê {outra} antes de ela existir"


def test_todas_com_invoker_e_sem_anon() -> None:
    sql = "\n".join(f5.sql_de(M))
    for nome, _ in M.VIEWS:
        assert f"CREATE OR REPLACE VIEW public.{nome} WITH (security_invoker = on) AS" in sql
        assert f"REVOKE ALL ON public.{nome} FROM anon;" in sql
        assert f"GRANT SELECT ON public.{nome} TO authenticated;" in sql


def test_downgrade_nao_remove_nada() -> None:
    assert f5.sql_de(M, "downgrade") == []


@f5.e2e
def test_aplicada_sobre_o_esqueleto_cada_view_devolve_o_texto_de_producao() -> None:
    with f5.banco(*f5.sql_de(M)) as c:
        for nome, corpo in M.VIEWS:
            atual = c.execute("SELECT pg_get_viewdef(%s::regclass, true)", (f"public.{nome}",)).fetchone()[0]
            assert atual == corpo, nome
            invoker = c.execute(
                "SELECT reloptions @> '{security_invoker=on}' FROM pg_class WHERE oid = %s::regclass",
                (f"public.{nome}",),
            ).fetchone()[0]
            assert invoker, nome


@f5.e2e
def test_aplicar_duas_vezes_e_no_op() -> None:
    sql = f5.sql_de(M)
    with f5.banco(*sql, *sql) as c:
        assert c.execute("SELECT count(*) FROM public.vw_metricas_turma_geral_classe").fetchone()[0] == 0
