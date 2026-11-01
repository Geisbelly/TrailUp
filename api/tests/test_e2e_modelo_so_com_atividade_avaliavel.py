"""`20261101_09`: o modelo de evasão só julga quem tem atividade avaliável ao alcance (decisão de 01/11).

Avaliável = com questões ou pontuação máxima. Ao alcance = num tópico que o aluno começou, com prazo
vencido, ou o aluno já tem nota. Sem isso vale a inatividade (30 dias = alto, 7 = atenção).
"""

from __future__ import annotations

from tests import _f5_banco as f5
from tests.test_e2e_abandono_pelo_modelo_do_core import _esperada, _matricula_ha
from tests.test_e2e_colunas_antigas_e_modelo_so_com_evento import NOVA as M01
from tests.test_e2e_colunas_antigas_e_modelo_so_com_evento import _sql_da_cadeia

M02 = f5.modulo("20261101_02_modelo_roda_com_pendencia.py")
M09 = f5.modulo("20261101_09_modelo_so_com_atividade_avaliavel.py")
CLIQUES = 14  # a semana do Aluno Demo na conferência de 01/11


def _banco(*depois: str):
    return f5.banco(*_sql_da_cadeia(), *f5.sql_de(M01), *f5.sql_de(M02), *depois)


def _risco(c, aluno) -> tuple[str, str | None]:
    return c.execute(
        "SELECT risco_abandono_faixa, risco_abandono_origem FROM public.vw_metricas_engajamento_aluno_classe"
        " WHERE aluno_id = %s",
        (aluno,),
    ).fetchone()


def _novo_e_ativo(c, aluno) -> None:
    """Matriculado hoje, estudou hoje com CLIQUES eventos, nenhum tópico concluído (há pendência)."""
    _matricula_ha(c, aluno, 0)
    quando = c.execute("SELECT now() - interval '1 hour'").fetchone()[0]
    sid = f5.uuid.uuid4()
    f5.sessao(c, sid, aluno, quando, None)
    f5.tempo(c, sid, aluno, "topic", 10, 60, 0, quando)
    for _ in range(CLIQUES):
        f5.evento(c, sid, aluno, "tap", 10, quando, "interaction")


def _atividade(c, id_: int, topico: int, *, questoes: bool = False, pontuacao=None, prazo_vencido=False) -> None:
    for t in ("atividades", "questoes"):
        f5.afrouxa(c, t)
    prazo = "now() - interval '1 day'" if prazo_vencido else "NULL"
    c.execute(
        "INSERT INTO public.atividades (id, topico_id, titulo, pontuacao_maxima, data_entrega) OVERRIDING SYSTEM VALUE"
        f" VALUES (%s, %s, 'A', %s, {prazo})",
        (id_, topico, pontuacao),
    )
    if questoes:
        c.execute("INSERT INTO public.questoes (atividade_id, enunciado) VALUES (%s, 'Q')", (id_,))


def _comeca(c, aluno, topico: int) -> None:
    c.execute(
        "INSERT INTO public.topico_aluno (aluno_id, topico_id, status, percentual_concluido)"
        " VALUES (%s, %s, 'em andamento', 30)",
        (aluno, topico),
    )


@f5.e2e
def test_antes_turma_sem_atividade_deixava_o_aluno_novo_e_ativo_em_alto() -> None:
    with _banco() as c:
        f5.semear_turma(c)
        _novo_e_ativo(c, f5.A)
        assert _risco(c, f5.A) == ("alto", "modelo")


@f5.e2e
def test_turma_sem_atividade_avaliavel_usa_a_inatividade() -> None:
    with _banco(*f5.sql_de(M09)) as c:
        f5.semear_turma(c)
        _novo_e_ativo(c, f5.A)
        _atividade(c, 500, 10)  # sem questões nem pontuação: não avalia
        _comeca(c, f5.A, 10)
        assert _risco(c, f5.A) == ("normal", "inatividade")


@f5.e2e
def test_atividade_avaliavel_em_topico_que_o_aluno_nao_comecou_ainda_nao_conta() -> None:
    with _banco(*f5.sql_de(M09)) as c:
        f5.semear_turma(c)
        _novo_e_ativo(c, f5.A)
        _atividade(c, 500, 12, questoes=True)
        _comeca(c, f5.A, 10)
        assert _risco(c, f5.A) == ("normal", "inatividade")


@f5.e2e
def test_atividade_com_questoes_em_topico_iniciado_faz_o_modelo_decidir() -> None:
    with _banco(*f5.sql_de(M09)) as c:
        f5.semear_turma(c)
        _novo_e_ativo(c, f5.A)
        _atividade(c, 500, 10, questoes=True)
        _comeca(c, f5.A, 10)
        # Entradas: CLIQUES na semana, 0 nas 4 anteriores, 0 semanas sem acesso, semana 0, sem nota,
        # nenhuma entrega com prazo.
        assert _risco(c, f5.A) == (_esperada(c, CLIQUES, 0, 0, 0, -1, 0, 0, 1, 0), "modelo")


@f5.e2e
def test_entrega_corrigida_pelo_professor_com_prazo_vencido_conta_mesmo_sem_comecar() -> None:
    with _banco(*f5.sql_de(M09)) as c:
        f5.semear_turma(c)
        _novo_e_ativo(c, f5.A)
        _atividade(c, 500, 12, pontuacao=10, prazo_vencido=True)  # sem questões, só pontuação
        assert _risco(c, f5.A)[1] == "modelo"


@f5.e2e
def test_aluno_com_nota_sempre_tem_evidencia() -> None:
    with _banco(*f5.sql_de(M09)) as c:
        f5.semear_turma(c)
        _novo_e_ativo(c, f5.A)
        c.execute('UPDATE public.classe_aluno SET "notaMedia" = 8, "porcentagemConcluida" = 30 WHERE aluno_id = %s', (f5.A,))
        assert _risco(c, f5.A) == (_esperada(c, CLIQUES, 0, 0, 0, 80, 0, 0, 1, 0), "modelo")


@f5.e2e
def test_sem_avaliavel_a_inatividade_ainda_marca_quem_sumiu() -> None:
    with _banco(*f5.sql_de(M09)) as c:
        f5.semear_turma(c)
        _matricula_ha(c, f5.A, 60)
        quando = c.execute("SELECT now() - interval '40 days'").fetchone()[0]
        sid = f5.uuid.uuid4()
        f5.sessao(c, sid, f5.A, quando, None)
        f5.tempo(c, sid, f5.A, "topic", 10, 60, 0, quando)
        assert _risco(c, f5.A) == ("alto", "inatividade")


@f5.e2e
def test_downgrade_volta_ao_texto_da_02() -> None:
    with _banco(*f5.sql_de(M09), *f5.sql_de(M09, "downgrade")) as c:
        f5.semear_turma(c)
        _novo_e_ativo(c, f5.A)
        assert _risco(c, f5.A) == ("alto", "modelo")
