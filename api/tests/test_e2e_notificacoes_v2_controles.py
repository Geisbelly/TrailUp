"""`20261105_05`: o aluno escolhe os dias, até 3 horários e o próprio silêncio.

Mesmo banco do e2e da `20261105_04` (motor v2), com a `20261105_05` por cima. As RPCs do app são
chamadas como o PostgREST chamaria: `SET ROLE authenticated` com o `sub` do JWT. Dados sintéticos.

O `_semear` da `_18` desliga o silêncio global (início = fim); os testes que precisam dele o religam.
"""

from __future__ import annotations

import datetime as dt

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_notificacao_no_horario_do_aluno as h
from tests import test_e2e_notificacao_por_perfil_e_foco as p
from tests import test_e2e_notificacoes_v2_motor as v2

pytestmark = f5.e2e

M = f5.modulo("20261105_05_notificacoes_v2_controles.py")
A, B = p.A, p.B
UTC = dt.timezone.utc


def _banco():
    return f5.banco(
        *p.h._motor(),
        *f5.sql_de(p.M01),
        p.ANTES,
        p.RETENCAO,
        p.M_LIMITE.TABELA_CONFIG,
        p.M_LIMITE.FUNCAO_LIMITE,
        *f5.sql_de(p.M),
        *f5.sql_de(v2.g.M),
        *f5.sql_de(v2.fala.M),
        *f5.sql_de(v2.M),
        *f5.sql_de(M),
    )


def _silencio_global(c, inicio: int = 22, fim: int = 7) -> None:
    h._cfg(c, "janela_silencio_inicio", inicio)
    h._cfg(c, "janela_silencio_fim", fim)


def _rpc(c, aluno, sql: str, params: tuple = ()):
    p._como(c, aluno)
    try:
        return c.execute(sql, params).fetchone()[0]
    finally:
        p._dono(c)


def _salvar(c, aluno, *, hora: int | None = 8, minuto: int = 0, dias=None, horarios=None, ativo: bool = True):
    return _rpc(
        c,
        aluno,
        "SELECT public.notificacoes_salvar_rotina('revisao_diaria', 'diaria', 'horario', NULL, NULL,"
        " %s::smallint, %s::smallint, 'UTC', 0, '{}'::jsonb, %s, %s::smallint[], %s::smallint[])",
        (hora, minuto, ativo, dias, horarios),
    )


def _salvar_antigo(c, aluno, *, hora: int, ativo: bool = True):
    """Como o app 1.0.7 chama: os 11 argumentos de antes."""
    return _rpc(
        c,
        aluno,
        "SELECT public.notificacoes_salvar_rotina(p_tipo => 'revisao_diaria', p_recorrencia => 'diaria',"
        " p_gatilho => 'horario', p_titulo => NULL, p_corpo => NULL, p_hora_local => %s::smallint,"
        " p_minuto_local => 0::smallint, p_timezone => 'UTC', p_prioridade => 0,"
        " p_contexto => '{}'::jsonb, p_ativo => %s)",
        (hora, ativo),
    )


def _rotina(c, aluno) -> tuple:
    return c.execute(
        "SELECT hora_local, minuto_local, dias_semana, horarios, hora_origem FROM public.notificacoes_agendamentos"
        " WHERE aluno_id = %s AND tipo = 'revisao_diaria'",
        (aluno,),
    ).fetchone()


def _erro(c, aluno, chamada) -> str:
    p._como(c, aluno)
    try:
        with pytest.raises(psycopg.errors.InvalidParameterValue) as erro:
            with c.transaction():
                chamada()
    finally:
        p._dono(c)
    return erro.value.diag.message_primary


def _proxima(c, agora: str, *, hora=8, minuto=0, dias=None, horarios=None, rec="diaria") -> dt.datetime:
    return c.execute(
        "SELECT public.notificacoes_proxima_ocorrencia(%s, %s::timestamptz, %s::smallint, %s::smallint, 'UTC',"
        " %s::smallint[], %s::smallint[])",
        (rec, agora, hora, minuto, dias, horarios),
    ).fetchone()[0]


# --------------------------------------------------------------------------- próxima ocorrência

QUARTA_MEIO_DIA = "2026-11-04 12:00+00"  # 04/11/2026 é quarta (ISO 3)


def test_sem_dias_nem_horarios_a_conta_e_a_de_antes():
    with _banco() as c:
        assert _proxima(c, QUARTA_MEIO_DIA, hora=19) == dt.datetime(2026, 11, 4, 19, tzinfo=UTC)
        assert _proxima(c, QUARTA_MEIO_DIA, hora=8) == dt.datetime(2026, 11, 5, 8, tzinfo=UTC)
        # Chamada de 5 argumentos, como as rotinas antigas fazem.
        cinco = c.execute(
            "SELECT public.notificacoes_proxima_ocorrencia('semanal', %s::timestamptz, 8::smallint,"
            " 0::smallint, 'UTC')",
            (QUARTA_MEIO_DIA,),
        ).fetchone()[0]
    assert cinco == dt.datetime(2026, 11, 11, 8, tzinfo=UTC)


def test_dias_da_semana_pulam_os_dias_fora_da_lista():
    with _banco() as c:
        # Só segunda (1) e sexta (5): de quarta ao meio-dia, a próxima é sexta.
        assert _proxima(c, QUARTA_MEIO_DIA, dias=[1, 5]) == dt.datetime(2026, 11, 6, 8, tzinfo=UTC)
        # Hoje está na lista, mas o horário já passou: o próximo dia da lista.
        assert _proxima(c, QUARTA_MEIO_DIA, dias=[3]) == dt.datetime(2026, 11, 11, 8, tzinfo=UTC)
        assert _proxima(c, QUARTA_MEIO_DIA, hora=19, dias=[3]) == dt.datetime(2026, 11, 4, 19, tzinfo=UTC)


def test_varios_horarios_saem_em_ordem_no_mesmo_dia():
    with _banco() as c:
        horarios = [20 * 60, 8 * 60, 14 * 60]  # fora de ordem de propósito
        assert _proxima(c, QUARTA_MEIO_DIA, horarios=horarios) == dt.datetime(2026, 11, 4, 14, tzinfo=UTC)
        assert _proxima(c, "2026-11-04 15:00+00", horarios=horarios) == dt.datetime(2026, 11, 4, 20, tzinfo=UTC)
        assert _proxima(c, "2026-11-04 21:00+00", horarios=horarios) == dt.datetime(2026, 11, 5, 8, tzinfo=UTC)
        # Com dias: depois do último horário de sexta, só na segunda.
        assert _proxima(c, "2026-11-06 21:00+00", dias=[1, 5], horarios=horarios) == dt.datetime(
            2026, 11, 9, 8, tzinfo=UTC
        )


# --------------------------------------------------------------------------- salvar a rotina


def test_aluno_salva_dias_e_tres_horarios():
    with _banco() as c:
        p._semear(c)
        r = _salvar(c, A, dias=[5, 1, 3, 1], horarios=[20 * 60, 8 * 60, 14 * 60])
        assert r["horarios"] == [480, 840, 1200]
        assert r["dias_semana"] == [1, 3, 5]
        assert _rotina(c, A) == (8, 0, [1, 3, 5], [480, 840, 1200], "aluno")
        lidas = _rpc(c, A, "SELECT json_agg(r) FROM public.notificacoes_minhas_rotinas() r")
    revisao = next(x for x in lidas if x["tipo"] == "revisao_diaria")
    assert (revisao["dias_semana"], revisao["horarios"]) == ([1, 3, 5], [480, 840, 1200])


def test_os_sete_dias_e_um_horario_so_voltam_ao_formato_de_antes():
    with _banco() as c:
        p._semear(c)
        _salvar(c, A, dias=[1, 2, 3, 4, 5, 6, 7], horarios=[9 * 60 + 30])
        assert _rotina(c, A) == (9, 30, None, None, "aluno")


def test_o_app_antigo_nao_apaga_o_que_o_aluno_escolheu():
    with _banco() as c:
        p._semear(c)
        _salvar(c, A, dias=[1, 5], horarios=[8 * 60, 14 * 60])
        _salvar_antigo(c, A, hora=8, ativo=False)  # o liga/desliga manda a hora de sempre
        assert _rotina(c, A)[2:4] == ([1, 5], [480, 840])
        _salvar_antigo(c, A, hora=19)  # trocou a hora: a lista vira essa hora
        assert _rotina(c, A)[:4] == (19, 0, [1, 5], None)


@pytest.mark.parametrize(
    ("kwargs", "codigo"),
    [
        ({"horarios": [6 * 60, 12 * 60, 18 * 60, 23 * 60]}, "horarios_demais"),
        ({"horarios": [8 * 60, 10 * 60]}, "horarios_perto_demais"),
        # 2h, 14h e 21h: de 21h às 2h do dia seguinte são só 5 h (a volta da meia-noite conta).
        ({"horarios": [14 * 60, 21 * 60, 2 * 60]}, "horarios_perto_demais"),
        ({"horarios": [24 * 60]}, "horario_invalido"),
        ({"dias": [0]}, "dias_invalidos"),
        ({"dias": []}, "dias_invalidos"),
    ],
)
def test_rotina_recusada(kwargs, codigo):
    with _banco() as c:
        p._semear(c)
        assert _erro(c, A, lambda: c.execute(*_sql_salvar(kwargs))) == codigo


def _sql_salvar(kwargs: dict) -> tuple:
    return (
        "SELECT public.notificacoes_salvar_rotina('revisao_diaria', 'diaria', 'horario', NULL, NULL,"
        " 8::smallint, 0::smallint, 'UTC', 0, '{}'::jsonb, true, %s::smallint[], %s::smallint[])",
        (kwargs.get("dias"), kwargs.get("horarios")),
    )


def test_tres_horarios_a_seis_horas_passam():
    with _banco() as c:
        p._semear(c)
        _salvar(c, A, horarios=[8 * 60, 14 * 60, 20 * 60])
        assert _rotina(c, A)[3] == [480, 840, 1200]


def test_horario_dentro_do_silencio_e_recusado():
    with _banco() as c:
        p._semear(c)
        _silencio_global(c)
        assert _erro(c, A, lambda: c.execute(*_sql_salvar({"horarios": [8 * 60, 23 * 60]}))) == (
            "horario_no_silencio"
        )
        # Desligada, a rotina não toca: pode ficar com o horário.
        _salvar(c, A, hora=23, ativo=False)


# --------------------------------------------------------------------------- disparo


def test_dois_horarios_no_mesmo_dia_viram_duas_notificacoes():
    """O dedupe era por dia: o segundo horário batia no primeiro e sumia."""
    with _banco() as c:
        p._semear(c)
        _salvar(c, A, horarios=[8 * 60, 14 * 60, 20 * 60])
        for atras in ("1 minute", "2 hours"):
            c.execute(
                "UPDATE public.notificacoes_agendamentos SET proxima_execucao = now() - %s::interval"
                " WHERE aluno_id = %s AND tipo = 'revisao_diaria'",
                (atras, A),
            )
            c.execute("SELECT public.notificacoes_processar_rotinas(%s, 'horario')", (A,))
        n = c.execute(
            "SELECT count(DISTINCT dedupe_key) FROM public.notificacoes_pendentes"
            " WHERE aluno_id = %s AND tipo = 'revisao_diaria'",
            (A,),
        ).fetchone()[0]
        prox = c.execute(
            "SELECT proxima_execucao > now() FROM public.notificacoes_agendamentos"
            " WHERE aluno_id = %s AND tipo = 'revisao_diaria'",
            (A,),
        ).fetchone()[0]
    assert n == 2
    assert prox


def test_um_horario_so_mantem_o_dedupe_do_dia():
    with _banco() as c:
        p._semear(c)
        _salvar(c, A, hora=8)
        for atras in ("1 minute", "2 hours"):
            c.execute(
                "UPDATE public.notificacoes_agendamentos SET proxima_execucao = now() - %s::interval"
                " WHERE aluno_id = %s AND tipo = 'revisao_diaria'",
                (atras, A),
            )
            c.execute("SELECT public.notificacoes_processar_rotinas(%s, 'horario')", (A,))
        n = c.execute(
            "SELECT count(*) FROM public.notificacoes_pendentes WHERE aluno_id = %s AND tipo = 'revisao_diaria'",
            (A,),
        ).fetchone()[0]
    assert n == 1


# --------------------------------------------------------------------------- silêncio do aluno


def _salvar_silencio(c, aluno, inicio, fim):
    return _rpc(c, aluno, "SELECT public.notificacoes_salvar_silencio(%s::smallint, %s::smallint)", (inicio, fim))


def test_sem_escolha_vale_o_silencio_global():
    with _banco() as c:
        p._semear(c)
        _silencio_global(c)
        meu = _rpc(c, A, "SELECT public.notificacoes_meu_silencio()")
    assert (meu["inicio"], meu["fim"], meu["proprio"]) == (22, 7, False)
    assert (meu["duracao_min_h"], meu["duracao_max_h"]) == (6, 14)


def test_aluno_escolhe_o_silencio_e_volta_ao_padrao():
    with _banco() as c:
        p._semear(c)
        _silencio_global(c)
        meu = _salvar_silencio(c, A, 0, 8)
        assert (meu["inicio"], meu["fim"], meu["proprio"]) == (0, 8, True)
        em = "SELECT public.notificacoes_em_silencio('UTC', %s::timestamptz, %s)"
        assert c.execute(em, ("2026-11-04 23:00+00", A)).fetchone()[0] is False  # o dele começa à 0h
        assert c.execute(em, ("2026-11-04 23:00+00", B)).fetchone()[0] is True  # B segue o global
        assert c.execute(em, ("2026-11-04 07:30+00", A)).fetchone()[0] is True
        fora = c.execute(
            "SELECT public.notificacoes_fora_do_silencio('UTC', '2026-11-04 03:00+00', %s)", (A,)
        ).fetchone()[0]
        assert fora == dt.datetime(2026, 11, 4, 8, tzinfo=UTC)
        meu = _salvar_silencio(c, A, None, None)
    assert (meu["inicio"], meu["fim"], meu["proprio"]) == (22, 7, False)


@pytest.mark.parametrize(("inicio", "fim"), [(22, 2), (8, 23), (5, 5)])
def test_silencio_fora_dos_limites_e_recusado(inicio, fim):
    with _banco() as c:
        p._semear(c)
        sql = "SELECT public.notificacoes_salvar_silencio(%s::smallint, %s::smallint)"
        assert _erro(c, A, lambda: c.execute(sql, (inicio, fim))) == "silencio_duracao"


def test_silencio_que_cobre_uma_rotina_ativa_e_recusado():
    with _banco() as c:
        p._semear(c)
        _salvar(c, A, horarios=[8 * 60, 20 * 60])
        sql = "SELECT public.notificacoes_salvar_silencio(19::smallint, 7::smallint)"
        assert _erro(c, A, lambda: c.execute(sql)) == "horario_no_silencio"
        _salvar_silencio(c, A, 21, 7)  # 20h fica de fora


def test_evento_no_silencio_do_aluno_espera_o_fim_dele():
    with _banco() as c:
        p._semear(c)
        hora = c.execute("SELECT EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC')::int").fetchone()[0]
        inicio, fim = (hora - 1) % 24, (hora + 6) % 24
        c.execute(
            "INSERT INTO public.alunos_notificacao_preferencias (aluno_id, silencio_inicio, silencio_fim)"
            " VALUES (%s, %s, %s)",
            (A, inicio, fim),
        )
        v2._evento(c, A, "conquista")
        v2._evento(c, B, "conquista")
        horarios = dict(
            c.execute(
                "SELECT aluno_id, horario > now() + interval '1 hour' FROM public.notificacoes_pendentes"
                " WHERE tipo = 'conquista'"
            ).fetchall()
        )
        hora_a = c.execute(
            "SELECT EXTRACT(HOUR FROM horario AT TIME ZONE 'UTC')::int FROM public.notificacoes_pendentes"
            " WHERE tipo = 'conquista' AND aluno_id = %s",
            (A,),
        ).fetchone()[0]
    assert horarios == {A: True, B: False}  # só A espera; o global está desligado
    assert hora_a == fim


def test_aluno_le_so_o_proprio_silencio():
    with _banco() as c:
        p._semear(c)
        _salvar_silencio(c, A, 0, 8)
        _salvar_silencio(c, B, 1, 9)
        p._como(c, A)
        linhas = c.execute("SELECT aluno_id FROM public.alunos_notificacao_preferencias").fetchall()
        with pytest.raises(psycopg.errors.InsufficientPrivilege), c.transaction():
            c.execute("SELECT public.notificacoes_janela_silencio(%s)", (B,))
        with pytest.raises(psycopg.errors.InsufficientPrivilege), c.transaction():
            c.execute("UPDATE public.alunos_notificacao_preferencias SET silencio_inicio = 3")
        p._dono(c)
    assert linhas == [(A,)]


# --------------------------------------------------------------------------- downgrade


def test_downgrade_devolve_as_funcoes_de_antes():
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        args = dict(
            c.execute(
                "SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc"
                " WHERE proname IN ('notificacoes_em_silencio', 'notificacoes_fora_do_silencio',"
                " 'notificacoes_proxima_ocorrencia')"
            ).fetchall()
        )
        corpos = [
            r[0]
            for r in c.execute(
                "SELECT prosrc FROM pg_proc WHERE proname IN ('notificacoes_enfileirar_evento',"
                " 'notificacoes_entregar', 'notificacoes_processar_rotinas', 'notificacoes_horario_preferido')"
            ).fetchall()
        ]
        colunas = c.execute(
            "SELECT count(*) FROM information_schema.columns WHERE table_name = 'notificacoes_agendamentos'"
            " AND column_name IN ('dias_semana', 'horarios')"
        ).fetchone()[0]
    assert args["notificacoes_em_silencio"] == "p_timezone text, p_momento timestamp with time zone"
    assert args["notificacoes_proxima_ocorrencia"].endswith("p_timezone text")
    assert not any(
        trecho in x
        for x in corpos
        for trecho in ("janela_silencio(", "dias_semana", "now(), p_aluno)", "v_adiar, p_aluno)", "iniciada_em, p_aluno)")
    )
    assert colunas == 0
