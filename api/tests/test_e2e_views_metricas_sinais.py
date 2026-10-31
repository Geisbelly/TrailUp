"""`20261031_05`: retorno semanal e os três sinais (inatividade, estagnação e evasão) (F5, Task 3).

Os sinais são estado atual (`now()`), então o dado sintético é montado em relação a hoje. Cada teste diz
o resultado esperado e por quê.
"""

from __future__ import annotations

import uuid

from tests import _f5_banco as f5

M = [
    f5.modulo("20261031_03_views_de_metricas_no_alembic.py"),
    f5.modulo("20261031_04_views_de_metricas_tempo_e_sessoes.py"),
    f5.modulo("20261031_05_views_de_metricas_retorno_e_sinais.py"),
]
I16 = f5.modulo("20261029_03_invariantes_das_metricas.py").INVARIANTES["16"]


def _banco():
    return f5.banco(*[sql for m in M for sql in f5.sql_de(m)])


def _estudo(c, aluno, topico: int, quando_sql: str, ativo: float = 60) -> None:
    """Uma sessão com um lote de estudo ativo no tópico, no instante `quando_sql` (expressão SQL)."""
    quando = c.execute(f"SELECT ({quando_sql})::timestamptz").fetchone()[0]
    sid = uuid.uuid4()
    f5.sessao(c, sid, aluno, quando, None)
    f5.tempo(c, sid, aluno, "topic", topico, ativo, 0, quando)


def _progresso(c, aluno, topico: int, pct: float) -> None:
    status = "concluido" if pct >= 100 else ("em andamento" if pct > 0 else "não iniciado")
    c.execute(
        "INSERT INTO public.topico_aluno (aluno_id, topico_id, status, percentual_concluido) VALUES (%s, %s, %s, %s)",
        (aluno, topico, status, pct),
    )


def _eng(c, aluno):
    cur = c.execute("SELECT * FROM public.vw_metricas_engajamento_aluno_classe WHERE aluno_id = %s", (aluno,))
    return dict(zip([d.name for d in cur.description], cur.fetchone()))


def _geral(c):
    cur = c.execute("SELECT * FROM public.vw_metricas_turma_geral_classe WHERE classe_id = 1")
    return dict(zip([d.name for d in cur.description], cur.fetchone()))


# Meio da semana completa de N semanas atrás, em Brasília.
def _semana(n: int) -> str:
    return (
        "(date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') "
        f"- interval '{n} weeks' + interval '2 days 12 hours') AT TIME ZONE 'America/Sao_Paulo'"
    )


@f5.e2e
def test_toda_matricula_tem_linha_e_as_colunas_antigas_sairam() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        n = c.execute("SELECT count(*) FROM public.vw_metricas_engajamento_aluno_classe").fetchone()[0]
        assert n == 3  # A, B e C, mesmo sem sessão nenhuma
        colunas = {
            r[0]
            for r in c.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name LIKE 'vw_metricas_%'"
            ).fetchall()
        }
        assert not colunas & {"taxa_abandono_pct", "taxa_retorno_pct", "taxa_media_abandono_pct", "taxa_media_retorno_pct"}


@f5.e2e
def test_retorno_um_dia_de_uso_nao_e_100() -> None:
    """B estudou um dia, há duas semanas, e não voltou: 1 elegível, 0 retornos → 0%, não 100%."""
    with _banco() as c:
        f5.semear_turma(c)
        _estudo(c, f5.B, 10, _semana(2))
        g = _geral(c)
        assert g["retorno_semanal_elegiveis"] == 1
        assert g["retorno_semanal_pct"] == 0


@f5.e2e
def test_retorno_em_duas_semanas_seguidas_e_100() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        _estudo(c, f5.A, 10, _semana(2))
        _estudo(c, f5.A, 10, _semana(1))
        g = _geral(c)
        assert (g["retorno_semanal_elegiveis"], g["retorno_semanal_pct"]) == (1, 100)


@f5.e2e
def test_retorno_sem_atividade_nas_semanas_completas_e_nulo() -> None:
    """Só estudo na semana corrente (incompleta): nenhum par de semanas completas → NULL."""
    with _banco() as c:
        f5.semear_turma(c)
        _estudo(c, f5.A, 10, "now() - interval '1 hour'")
        g = _geral(c)
        assert g["retorno_semanal_elegiveis"] == 0
        assert g["retorno_semanal_pct"] is None


@f5.e2e
def test_inativo_7_dias_evadido_30_e_sem_dado_nao_e_inativo() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        _estudo(c, f5.A, 10, "now() - interval '9 days'")
        _estudo(c, f5.C, 10, "now() - interval '31 days'")
        a, b, cc = _eng(c, f5.A), _eng(c, f5.B), _eng(c, f5.C)
        assert a["inativo_desde"] is not None and a["evadido_desde"] is None
        assert cc["inativo_desde"] is not None and cc["evadido_desde"] is not None
        assert b["sem_dado"] is True and b["inativo_desde"] is None and b["evadido_desde"] is None
        g = _geral(c)
        assert (g["alunos_inativos"], g["alunos_evadidos"], g["alunos_sem_dado"]) == (2, 1, 1)


@f5.e2e
def test_quem_estudou_ontem_nao_tem_sinal() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        _estudo(c, f5.A, 10, "now() - interval '1 day'")
        a = _eng(c, f5.A)
        assert a["sem_dado"] is False
        assert a["inativo_desde"] is None and a["evadido_desde"] is None and a["estagnado_topico_id"] is None


@f5.e2e
def test_estagnado_so_no_topico_em_que_parou() -> None:
    """A concluiu o tópico 10 e parou no 11 há 15 dias, com 20% contra a mediana de 60%.
    C (60%) e B (80%) estão no 11 na mediana ou acima. Só A é estagnado, e só no 11."""
    with _banco() as c:
        f5.semear_turma(c)
        _progresso(c, f5.A, 10, 100)
        _progresso(c, f5.A, 11, 20)
        _progresso(c, f5.C, 11, 60)
        _progresso(c, f5.B, 11, 80)
        _estudo(c, f5.A, 10, "now() - interval '20 days'")
        _estudo(c, f5.A, 11, "now() - interval '15 days'")
        _estudo(c, f5.C, 11, "now() - interval '15 days'")
        _estudo(c, f5.B, 11, "now() - interval '15 days'")
        a = _eng(c, f5.A)
        assert a["estagnado_topico_id"] == 11
        assert _eng(c, f5.C)["estagnado_topico_id"] is None
        assert _eng(c, f5.B)["estagnado_topico_id"] is None
        assert _geral(c)["alunos_estagnados"] == 1


@f5.e2e
def test_avanco_recente_tira_a_estagnacao_mesmo_com_estudo_antigo() -> None:
    """A entrou no 11 há 20 dias, mas concluiu um conteúdo dele há 3: avançou, não está estagnado."""
    with _banco() as c:
        f5.semear_turma(c)
        _progresso(c, f5.A, 11, 20)
        _progresso(c, f5.C, 11, 60)
        _progresso(c, f5.B, 11, 80)
        _estudo(c, f5.A, 11, "now() - interval '20 days'")
        sid = c.execute("SELECT id FROM public.telemetria_sessoes WHERE aluno_id = %s", (f5.A,)).fetchone()[0]
        quando = c.execute("SELECT now() - interval '3 days'").fetchone()[0]
        f5.evento(c, sid, f5.A, "content_complete", 11, quando)
        assert _eng(c, f5.A)["estagnado_topico_id"] is None


@f5.e2e
def test_aluno_no_meio_da_trilha_nao_aparece_como_abandono() -> None:
    """O achado da spec §1: com 1 de 3 tópicos concluído e estudo recente, a view velha dava 66,7% de
    "abandono". Agora: nenhum sinal, e a conclusão continua visível (33,3%)."""
    with _banco() as c:
        f5.semear_turma(c)
        _progresso(c, f5.A, 10, 100)
        _progresso(c, f5.A, 11, 40)
        _progresso(c, f5.A, 12, 10)
        _estudo(c, f5.A, 11, "now() - interval '2 days'")
        a = _eng(c, f5.A)
        assert (a["inativo_desde"], a["estagnado_topico_id"], a["evadido_desde"]) == (None, None, None)
        assert round(float(a["taxa_conclusao_topicos_pct"]), 1) == 33.3


@f5.e2e
def test_faixa_de_tempo_ativo_tem_sem_dado() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        _estudo(c, f5.A, 10, "now() - interval '1 day'", ativo=2000)
        faixas = dict(
            c.execute(
                "SELECT faixa, total_alunos FROM public.vw_metricas_distribuicao_turma_classe WHERE metrica = 'tempo_ativo'"
            ).fetchall()
        )
        assert faixas == {"medio": 1, "sem_dado": 2}


@f5.e2e
def test_i16_continua_passando() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        _estudo(c, f5.A, 10, "now() - interval '1 day'")
        assert c.execute(I16).fetchall() == []


@f5.e2e
def test_downgrade_volta_as_colunas_antigas() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M[2], "downgrade"):
            c.execute(sql)
        c.execute("SELECT taxa_abandono_pct, taxa_retorno_pct FROM public.vw_metricas_engajamento_aluno_classe")
        c.execute("SELECT taxa_media_abandono_pct FROM public.vw_metricas_turma_geral_classe")
