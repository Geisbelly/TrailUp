"""`20261031_07`: o catálogo troca os cards legados pelos da F5 (F5, Task 5)."""

from __future__ import annotations

from tests import _f5_banco as f5

M_CATALOGO = f5.modulo("20261029_02_catalogo_de_metricas.py")
M = f5.modulo("20261031_07_catalogo_f5.py")
NOVAS = {"prof.tempo_ativo", "prof.retorno_semanal", "prof.abandono_por_etapa"}
LEGADAS = {"legado.tempo_uso", "legado.abandono"}


def test_encadeia_na_task_4() -> None:
    assert (M.revision, M.down_revision) == ("20261031_07", "20261031_06")


def test_acerto_nao_entra_sem_invariante() -> None:
    """Sem invariante, a disponibilidade da F0 diria "disponível" para um número sabidamente errado."""
    assert "acerto" not in M.UPGRADE


def test_texto_seguro_para_text_do_sqlalchemy() -> None:
    import re

    for sql in (M.UPGRADE, M.DOWNGRADE):
        assert "%" not in sql
        assert re.search(r"(?<![:\w]):[A-Za-z_]", sql) is None


def _chaves(c) -> set[str]:
    return {r[0] for r in c.execute("SELECT chave FROM public.metricas_catalogo").fetchall()}


@f5.e2e
def test_troca_as_chaves_e_a_disponibilidade_as_ve() -> None:
    with f5.banco(*f5.sql_de(M_CATALOGO)) as c:
        assert LEGADAS <= _chaves(c)
        for sql in f5.sql_de(M):
            c.execute(sql)
        chaves = _chaves(c)
        assert NOVAS <= chaves and not (LEGADAS & chaves)
        disp = {r[0] for r in c.execute("SELECT chave FROM public.vw_metricas_disponibilidade").fetchall()}
        assert NOVAS <= disp and not (LEGADAS & disp)
        fontes = dict(
            c.execute(
                "SELECT chave, fonte FROM public.metricas_catalogo WHERE chave IN ('prof.inatividade','prof.estagnado')"
            ).fetchall()
        )
        assert fontes == {
            "prof.inatividade": "vw_metricas_engajamento_aluno_classe.inativo_desde",
            "prof.estagnado": "vw_metricas_engajamento_aluno_classe.estagnado_desde",
        }


@f5.e2e
def test_sem_rodada_de_auditoria_as_novas_ficam_indisponiveis() -> None:
    """Rodada que nunca aconteceu não vira "tudo certo" (regra da F0)."""
    with f5.banco(*f5.sql_de(M_CATALOGO), *f5.sql_de(M)) as c:
        motivos = dict(
            c.execute(
                "SELECT chave, motivo FROM public.vw_metricas_disponibilidade WHERE chave = ANY(%s)", (list(NOVAS),)
            ).fetchall()
        )
        assert set(motivos.values()) == {"auditoria_atrasada"}


@f5.e2e
def test_downgrade_devolve_as_legadas() -> None:
    with f5.banco(*f5.sql_de(M_CATALOGO), *f5.sql_de(M), *f5.sql_de(M, "downgrade")) as c:
        chaves = _chaves(c)
        assert LEGADAS <= chaves and not (NOVAS & chaves)
