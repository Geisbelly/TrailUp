"""`20261031_08`: taxa de abandono e "crítico" pelo modelo de evasão do core-trailup (F5).

O teste confere duas coisas: que as funções são as do core, byte a byte, e que as entradas que o
TrailUp passa ao modelo são as descritas na migration. Para isso calcula o risco esperado chamando
`trailup_risco_evasao` com as entradas montadas à mão e compara a faixa com a da view.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest

from tests import _f5_banco as f5

M = [
    f5.modulo(a)
    for a in (
        "20261029_02_catalogo_de_metricas.py",
        "20261031_03_views_de_metricas_no_alembic.py",
        "20261031_04_views_de_metricas_tempo_e_sessoes.py",
        "20261031_05_views_de_metricas_retorno_e_sinais.py",
        "20261031_07_catalogo_f5.py",
        "20261031_08_abandono_pelo_modelo_do_core.py",
    )
]
M8 = M[-1]
CORE = Path(__file__).resolve().parents[3] / "core-trailup" / "sql" / "evasao.sql"
PRAZO = f5.modulo("20261020_04_economia_correcoes_e2e.py")


def test_funcoes_sao_as_do_core_sem_alteracao() -> None:
    if not CORE.exists():
        pytest.skip("core-trailup não está ao lado do monorepo")
    core = CORE.read_text(encoding="utf-8")
    for nome in ("trailup_risco_evasao(", "trailup_faixa_risco("):
        a = core.index(f"CREATE OR REPLACE FUNCTION {nome}")
        trecho = core[a : core.index("$$;", a) + 3].replace(f"FUNCTION {nome}", f"FUNCTION public.{nome}")
        assert trecho in M8.MODELO, nome


def test_so_a_faixa_sai_da_view_nunca_o_score() -> None:
    assert "risco_abandono_faixa" in M8.ENGAJAMENTO
    assert "AS risco_abandono_score" not in M8.ENGAJAMENTO
    assert "trailup_faixa_risco(public.trailup_risco_evasao(" in M8.ENGAJAMENTO


def test_nada_e_removido_das_views() -> None:
    """As colunas da `_05` continuam todas, na mesma ordem; as novas entram no fim (CREATE OR REPLACE)."""
    for anterior, novo in ((M[3].TURMA_GERAL, M8.TURMA_GERAL), (M[3].TURMA_PERFIL, M8.TURMA_PERFIL)):
        for coluna in ("alunos_inativos", "retorno_semanal_pct" if "retorno" in anterior else "alunos_estagnados"):
            assert coluna in novo
    assert "CREATE OR REPLACE VIEW public.vw_metricas_engajamento_aluno_classe" in M8.ENGAJAMENTO


def _banco():
    sql = [PRAZO.PRAZO_DEPOIS if hasattr(PRAZO, "PRAZO_DEPOIS") else _prazo()]
    sql += [s for m in M for s in f5.sql_de(m)]
    return f5.banco(*sql)


def _prazo() -> str:
    texto = (f5.VERSOES / "20261020_04_economia_correcoes_e2e.py").read_text(encoding="utf-8")
    a = texto.index("CREATE OR REPLACE FUNCTION public.fn_prazo_efetivo")
    return texto[a : texto.index("$fn$;", a) + 5]


def _faixa(c, aluno) -> str:
    return c.execute(
        "SELECT risco_abandono_faixa FROM public.vw_metricas_engajamento_aluno_classe WHERE aluno_id = %s", (aluno,)
    ).fetchone()[0]


def _esperada(c, *args) -> str:
    return c.execute(
        "SELECT public.trailup_faixa_risco(public.trailup_risco_evasao(%s, %s, %s, %s, %s, %s, %s, %s, %s))", args
    ).fetchone()[0]


def _estudo(c, aluno, dias_atras: int) -> uuid.UUID:
    quando = c.execute(f"SELECT now() - interval '{dias_atras} days'").fetchone()[0]
    sid = uuid.uuid4()
    f5.sessao(c, sid, aluno, quando, None)
    f5.tempo(c, sid, aluno, "topic", 10, 60, 0, quando)
    return sid


def _matricula_ha(c, aluno, dias: int) -> None:
    c.execute(
        f"UPDATE public.classe_aluno SET created_at = now() - interval '{dias} days' WHERE aluno_id = %s", (aluno,)
    )


@f5.e2e
def test_aluno_ativo_e_em_dia_fica_normal_e_as_entradas_batem() -> None:
    """A: matrícula há 140 dias (semana 20), 20 eventos nesta semana, nota 8,0, uma entrega vencida e
    feita 1 dia antes do prazo. (No começo do curso o próprio modelo dá "atencao": o coeficiente da
    semana do curso é negativo, então aluno novo tem risco maior. É o comportamento do core.)"""
    with _banco() as c:
        f5.semear_turma(c)
        f5.afrouxa(c, "atividades")
        _matricula_ha(c, f5.A, 140)
        c.execute("""UPDATE public.classe_aluno SET "notaMedia" = 8, "porcentagemConcluida" = 40 WHERE aluno_id = %s""", (f5.A,))
        sid = _estudo(c, f5.A, 1)
        for _ in range(20):
            f5.evento(c, sid, f5.A, "tap", 10, c.execute("SELECT now() - interval '1 day'").fetchone()[0], "interaction")
        f5.evento(c, sid, f5.A, "scroll", 10, c.execute("SELECT now() - interval '1 day'").fetchone()[0], "interaction")
        c.execute(
            "INSERT INTO public.atividades (id, topico_id, titulo, data_entrega) OVERRIDING SYSTEM VALUE"
            " VALUES (501, 10, 'Lista', now() - interval '3 days')"
        )
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)"
            " VALUES (%s, 'atividade_concluida', 'atividade:501', 1, now() - interval '4 days')",
            (f5.A,),
        )
        # 20 cliques (o scroll não conta), 0 semanas sem acesso, semana 20, nota 80, 1 feita, 0 perdidas,
        # taxa 1, atraso -1 dia. Risco calculado à mão: 0,0115 (abaixo do p70 0,0213) → normal.
        esperada = _esperada(c, 20, 20, 0, 20, 80, 1, 0, 1, -1)
        assert _faixa(c, f5.A) == esperada == "normal"


@f5.e2e
def test_aluno_sumido_com_entregas_perdidas_fica_alto_e_e_o_critico() -> None:
    """C: matrícula há 2 dias, estudou uma vez há 1 dia, nenhuma entrega feita e três vencidas."""
    with _banco() as c:
        f5.semear_turma(c)
        f5.afrouxa(c, "atividades")
        _matricula_ha(c, f5.C, 2)
        _estudo(c, f5.C, 1)
        for i in range(3):
            c.execute(
                "INSERT INTO public.atividades (id, topico_id, titulo, data_entrega) OVERRIDING SYSTEM VALUE"
                f" VALUES ({600 + i}, 10, 'Lista', now() - interval '1 day')"
            )
        esperada = _esperada(c, 0, 0, 0, 0, -1, 0, 3, 0, 0)
        assert esperada == "alto"
        assert _faixa(c, f5.C) == "alto"


@f5.e2e
def test_sem_atividade_e_sem_dados_e_nao_entra_na_taxa() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        assert _faixa(c, f5.B) == "sem dados"
        geral = c.execute(
            "SELECT alunos_risco_alto, alunos_risco_com_dado, taxa_risco_abandono_pct FROM public.vw_metricas_turma_geral_classe"
        ).fetchone()
        assert geral == (0, 0, None)  # ninguém com dado: taxa sem dado, não 0%


@f5.e2e
def test_taxa_de_abandono_e_a_parcela_com_dado_na_faixa_alta() -> None:
    """A normal, C alto, B sem dado → taxa = 1 de 2 com dado = 50%."""
    with _banco() as c:
        f5.semear_turma(c)
        f5.afrouxa(c, "atividades")
        _matricula_ha(c, f5.A, 140)
        c.execute("""UPDATE public.classe_aluno SET "notaMedia" = 8, "porcentagemConcluida" = 40 WHERE aluno_id = %s""", (f5.A,))
        sid = _estudo(c, f5.A, 1)
        for _ in range(20):
            f5.evento(c, sid, f5.A, "tap", 10, c.execute("SELECT now() - interval '1 day'").fetchone()[0], "interaction")
        _matricula_ha(c, f5.C, 2)
        _estudo(c, f5.C, 1)
        for i in range(3):
            c.execute(
                "INSERT INTO public.atividades (id, topico_id, titulo, data_entrega) OVERRIDING SYSTEM VALUE"
                f" VALUES ({700 + i}, 11, 'Lista', now() - interval '1 day')"
            )
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em) SELECT %s, 'atividade_concluida',"
            " 'atividade:' || id, 1, now() - interval '2 days' FROM public.atividades WHERE id >= 700",
            (f5.A,),
        )
        assert (_faixa(c, f5.A), _faixa(c, f5.C), _faixa(c, f5.B)) == ("normal", "alto", "sem dados")
        alto, com_dado, taxa = c.execute(
            "SELECT alunos_risco_alto, alunos_risco_com_dado, taxa_risco_abandono_pct FROM public.vw_metricas_turma_geral_classe"
        ).fetchone()
        assert (alto, com_dado, float(taxa)) == (1, 2, 50.0)


@f5.e2e
def test_catalogo_tem_a_taxa_de_abandono() -> None:
    with _banco() as c:
        fonte = c.execute("SELECT fonte FROM public.metricas_catalogo WHERE chave = 'prof.risco_abandono'").fetchone()[0]
        assert fonte == "vw_metricas_turma_geral_classe.taxa_risco_abandono_pct"


@f5.e2e
def test_downgrade_volta_a_task_3_e_tira_as_funcoes() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M8, "downgrade"):
            c.execute(sql)
        assert c.execute("SELECT to_regprocedure('public.trailup_faixa_risco(numeric)')").fetchone()[0] is None
        c.execute("SELECT inativo_desde FROM public.vw_metricas_engajamento_aluno_classe")
