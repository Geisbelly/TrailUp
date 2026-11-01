"""`20261101_02`: o modelo de evasão roda em semana sem evento enquanto houver pendência (decisão de 01/11).

Pendência = tópico da turma não concluído, missão elegível na janela não concluída, ou evento da turma
aberto. Sem nenhuma, vale a regra de inatividade (30 dias = alto, 7 = atenção).
"""

from __future__ import annotations

from tests import _f5_banco as f5
from tests.test_e2e_abandono_pelo_modelo_do_core import _esperada, _estudo, _faixa, _matricula_ha
from tests.test_e2e_colunas_antigas_e_modelo_so_com_evento import NOVA as M01
from tests.test_e2e_colunas_antigas_e_modelo_so_com_evento import _sql_da_cadeia

M02 = f5.modulo("20261101_02_modelo_roda_com_pendencia.py")


def _banco():
    return f5.banco(*_sql_da_cadeia(), *f5.sql_de(M01), *f5.sql_de(M02))


def _origem(c, aluno) -> str | None:
    return c.execute(
        "SELECT risco_abandono_origem FROM public.vw_metricas_engajamento_aluno_classe WHERE aluno_id = %s", (aluno,)
    ).fetchone()[0]


def _conclui_tudo(c, aluno) -> None:
    for topico in f5.TOPICOS:
        c.execute(
            "INSERT INTO public.topico_aluno (aluno_id, topico_id, status, percentual_concluido)"
            " VALUES (%s, %s, 'concluido', 100)",
            (aluno, topico),
        )


def _missao(c, *, perfil_alvo: str | None = None) -> int:
    f5.afrouxa(c, "missoes")
    return c.execute(
        "INSERT INTO public.missoes (classe_id, origem, escopo, titulo, criterio, recompensa_tipo, perfil_alvo)"
        " VALUES (%s, 'professor', 'turma', 'Missão', '{}'::jsonb, 'moedas', %s) RETURNING id",
        (f5.TURMA, perfil_alvo),
    ).fetchone()[0]


def _parado_ha_10_dias(c, aluno) -> None:
    _matricula_ha(c, aluno, 2)
    _estudo(c, aluno, 10)  # sem nenhum evento de app: semana com 0 cliques


@f5.e2e
def test_conteudo_pendente_faz_o_modelo_rodar_com_zero_eventos() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        _parado_ha_10_dias(c, f5.A)  # nenhum tópico concluído
        # Entradas: 0 cliques na semana e nas 4 anteriores, 1 semana sem acesso, semana 0 do curso,
        # sem nota, nenhuma entrega com prazo.
        esperada = _esperada(c, 0, 0, 1, 0, -1, 0, 0, 1, 0)
        assert (_faixa(c, f5.A), _origem(c, f5.A)) == (esperada, "modelo")


@f5.e2e
def test_sem_pendencia_volta_a_inatividade() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        _parado_ha_10_dias(c, f5.A)
        _conclui_tudo(c, f5.A)
        assert (_faixa(c, f5.A), _origem(c, f5.A)) == ("atencao", "inatividade")


@f5.e2e
def test_missao_pendente_faz_o_modelo_rodar_e_concluida_nao() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        _parado_ha_10_dias(c, f5.A)
        _conclui_tudo(c, f5.A)
        missao = _missao(c)
        assert _origem(c, f5.A) == "modelo"
        f5.afrouxa(c, "missao_aluno")
        c.execute(
            "INSERT INTO public.missao_aluno (aluno_id, missao_id, status, progresso, concluida_em)"
            " VALUES (%s, %s, 'concluida', 100, now())",
            (f5.A, missao),
        )
        assert _origem(c, f5.A) == "inatividade"


@f5.e2e
def test_missao_de_outro_perfil_ou_fora_da_janela_nao_conta() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        _parado_ha_10_dias(c, f5.A)
        _conclui_tudo(c, f5.A)
        _missao(c, perfil_alvo="seeker")  # A não tem perfil nenhum
        assert _origem(c, f5.A) == "inatividade"
        fora = _missao(c)
        c.execute("UPDATE public.missoes SET janela_fim = now() - interval '1 day' WHERE id = %s", (fora,))
        assert _origem(c, f5.A) == "inatividade"


@f5.e2e
def test_evento_aberto_faz_o_modelo_rodar_e_rascunho_nao() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        _parado_ha_10_dias(c, f5.A)
        _conclui_tudo(c, f5.A)
        f5.afrouxa(c, "eventos_classe")
        evento = c.execute(
            "INSERT INTO public.eventos_classe (classe_id, titulo, status, inicio, fim)"
            " VALUES (%s, 'Evento', 'rascunho', now() - interval '1 hour', now() + interval '1 day') RETURNING id",
            (f5.TURMA,),
        ).fetchone()[0]
        assert _origem(c, f5.A) == "inatividade"
        c.execute("UPDATE public.eventos_classe SET status = 'aberto' WHERE id = %s", (evento,))
        assert _origem(c, f5.A) == "modelo"


@f5.e2e
def test_sem_dado_continua_sem_origem() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        assert (_faixa(c, f5.B), _origem(c, f5.B)) == ("sem dados", None)


@f5.e2e
def test_colunas_nao_mudam_e_downgrade_volta_a_regra_so_com_evento() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        _parado_ha_10_dias(c, f5.A)
        colunas = c.execute(
            "SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns"
            " WHERE table_name = 'vw_metricas_engajamento_aluno_classe'"
        ).fetchone()[0]
        assert _origem(c, f5.A) == "modelo"
        for sql in f5.sql_de(M02, "downgrade"):
            c.execute(sql)
        assert _origem(c, f5.A) == "inatividade"
        depois = c.execute(
            "SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns"
            " WHERE table_name = 'vw_metricas_engajamento_aluno_classe'"
        ).fetchone()[0]
        assert colunas == depois
