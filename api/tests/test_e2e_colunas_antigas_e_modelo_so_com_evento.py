"""`20261101_01`: as colunas antigas voltam às views, e o modelo de evasão só roda em semana com evento.

A `_05` e a `_08` mescladas já estão em produção; esta revisão é a correção. Os testes instalam a
cadeia como produção a tem (`_03` … `_08`) e a `20261101_01` por cima.
"""

from __future__ import annotations

from tests import _f5_banco as f5
from tests.test_e2e_abandono_pelo_modelo_do_core import (
    M as CADEIA_ATE_08,
)
from tests.test_e2e_abandono_pelo_modelo_do_core import (
    _esperada,
    _estudo,
    _faixa,
    _matricula_ha,
    _prazo,
)

NOVA = f5.modulo("20261101_01_colunas_antigas_e_modelo_so_com_evento.py")
ESPELHO = f5.modulo("20261031_03_views_de_metricas_no_alembic.py")

ANTIGAS = (
    ("vw_metricas_engajamento_aluno_classe", "taxa_abandono_pct"),
    ("vw_metricas_engajamento_aluno_classe", "taxa_retorno_pct"),
    ("vw_metricas_turma_geral_classe", "taxa_media_abandono_pct"),
    ("vw_metricas_turma_geral_classe", "taxa_media_retorno_pct"),
    ("vw_metricas_turma_perfil_classe", "taxa_abandono_pct"),
    ("vw_metricas_turma_perfil_classe", "taxa_retorno_pct"),
)


def _sql_da_cadeia() -> list[str]:
    return [_prazo()] + [s for m in CADEIA_ATE_08 for s in f5.sql_de(m)]


def _banco(*, com_correcao: bool = True):
    sql = _sql_da_cadeia()
    if com_correcao:
        sql += f5.sql_de(NOVA)
    return f5.banco(*sql)


def _colunas(c) -> set[tuple[str, str]]:
    return {
        (r[0], r[1])
        for r in c.execute(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name LIKE 'vw_metricas_%'"
        ).fetchall()
    }


def _origem(c, aluno) -> str | None:
    return c.execute(
        "SELECT risco_abandono_origem FROM public.vw_metricas_engajamento_aluno_classe WHERE aluno_id = %s", (aluno,)
    ).fetchone()[0]


@f5.e2e
def test_toda_coluna_que_producao_tinha_antes_da_f5_continua() -> None:
    """Decisão de 31/10: nada sai das views sem confirmação. Compara com o texto de produção (_03)."""
    with f5.banco(*f5.sql_de(ESPELHO)) as c:
        antes = _colunas(c)
    with _banco() as c:
        depois = _colunas(c)
    assert antes - depois == set()
    for esperada in ANTIGAS:
        assert esperada in depois, esperada
    assert ("vw_metricas_engajamento_aluno_classe", "risco_abandono_origem") in depois


@f5.e2e
def test_sem_a_correcao_as_antigas_tinham_saido() -> None:
    """Prova de que o teste acima mede a correção, e não o esqueleto."""
    with _banco(com_correcao=False) as c:
        assert not (set(ANTIGAS) & _colunas(c))


@f5.e2e
def test_coluna_antiga_tem_a_conta_de_sempre_e_a_faixa_de_presenca_volta() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        for topico, pct in ((10, 100), (11, 20), (12, 0)):
            status = "concluido" if pct >= 100 else ("em andamento" if pct > 0 else "não iniciado")
            c.execute(
                "INSERT INTO public.topico_aluno (aluno_id, topico_id, status, percentual_concluido) VALUES (%s, %s, %s, %s)",
                (f5.A, topico, status, pct),
            )
        abandono = c.execute(
            "SELECT taxa_abandono_pct FROM public.vw_metricas_engajamento_aluno_classe WHERE aluno_id = %s", (f5.A,)
        ).fetchone()[0]
        assert round(float(abandono), 1) == 66.7  # 2 de 3 tópicos com linha ainda não concluídos
        faixas = {
            r[0] for r in c.execute("SELECT DISTINCT metrica FROM public.vw_metricas_distribuicao_turma_classe").fetchall()
        }
        assert {"tempo_uso", "tempo_ativo"} <= faixas


@f5.e2e
def test_semana_sem_evento_usa_a_inatividade_e_diz_a_origem() -> None:
    """O modelo só foi medido em semana com clique. Sem evento: 30 dias = alto, 7 = atenção."""
    with _banco() as c:
        f5.semear_turma(c)
        f5.afrouxa(c, "atividades")
        _matricula_ha(c, f5.A, 2)
        _estudo(c, f5.A, 1)
        c.execute(
            "INSERT INTO public.atividades (id, topico_id, titulo, data_entrega) OVERRIDING SYSTEM VALUE"
            " VALUES (801, 10, 'Lista', now() - interval '1 day')"
        )
        # Fora do domínio, o modelo diria "alto" para quem estudou ontem.
        assert _esperada(c, 0, 0, 0, 0, -1, 0, 1, 0, 0) == "alto"
        assert (_faixa(c, f5.A), _origem(c, f5.A)) == ("normal", "inatividade")
        _estudo(c, f5.B, 10)
        assert (_faixa(c, f5.B), _origem(c, f5.B)) == ("atencao", "inatividade")
        _estudo(c, f5.C, 31)
        assert (_faixa(c, f5.C), _origem(c, f5.C)) == ("alto", "inatividade")


@f5.e2e
def test_semana_com_evento_usa_o_modelo_com_as_4_semanas_anteriores() -> None:
    """C: 1 evento nesta semana, nenhum nas 4 anteriores, três entregas vencidas sem fazer."""
    with _banco() as c:
        f5.semear_turma(c)
        f5.afrouxa(c, "atividades")
        _matricula_ha(c, f5.C, 2)
        sid = _estudo(c, f5.C, 1)
        f5.evento(c, sid, f5.C, "tap", 10, c.execute("SELECT now() - interval '1 day'").fetchone()[0], "interaction")
        for i in range(3):
            c.execute(
                "INSERT INTO public.atividades (id, topico_id, titulo, data_entrega) OVERRIDING SYSTEM VALUE"
                f" VALUES ({600 + i}, 10, 'Lista', now() - interval '1 day')"
            )
        # A semana corrente NÃO entra nas "4 semanas" (painel do OULAD: sem-4 <= semana < sem).
        assert _esperada(c, 1, 0, 0, 0, -1, 0, 3, 0, 0) == "alto"
        assert (_faixa(c, f5.C), _origem(c, f5.C)) == ("alto", "modelo")


@f5.e2e
def test_sem_dado_nao_tem_origem() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        assert (_faixa(c, f5.B), _origem(c, f5.B)) == ("sem dados", None)


@f5.e2e
def test_downgrade_volta_ao_estado_de_producao() -> None:
    with _banco(com_correcao=False) as c:
        producao = _colunas(c)
    with _banco() as c:
        for sql in f5.sql_de(NOVA, "downgrade"):
            c.execute(sql)
        assert _colunas(c) == producao
