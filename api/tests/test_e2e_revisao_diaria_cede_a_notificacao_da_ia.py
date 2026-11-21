"""`20261120_06`: no dia em que a IA escreveu a notificação diária, a revisão diária não sai.

Mesmo banco do e2e da `20261120_02`, com a `_06` por cima. Aluno C (Conqueror, estudando Frações).
Dados sintéticos.
"""

from __future__ import annotations

import json

from tests import _f5_banco as f5
from tests import test_e2e_notificacao_rotina_com_o_topico_do_aluno as rotina

pytestmark = f5.e2e

M = f5.modulo("20261120_06_revisao_diaria_cede_a_notificacao_da_ia.py")
C = rotina.C


def _banco():
    return f5.banco(*rotina._banco_args(), *f5.sql_de(M))


def _sugestao_da_ia(c, *, diaria: bool) -> None:
    """Sugestão promovida pelo banco, com a pendente no MESMO dia local da revisão."""
    contexto = {"motivo": "engajamento", "texto_guarda": 3} | ({"diaria": True} if diaria else {})
    c.execute(
        "INSERT INTO public.notificacoes_ia (aluno_id, tipo, contexto, titulo, corpo, origem, prioridade, horario_sugerido)"
        " VALUES (%s, 'lembrete', %s::jsonb, 'Bora fechar Frações, {nome}?', 'Abra Soma de frações.', 'ciclo', 1,"
        " now() + interval '1 hour')",
        (C, json.dumps(contexto)),
    )
    # O dia da pendente da IA sai do horário escolhido; aqui fica igual ao da revisão, para o teste não
    # depender da hora em que roda.
    c.execute(
        "UPDATE public.notificacoes_pendentes p"
        "   SET contexto = p.contexto || jsonb_build_object('dia', public.notificacoes_dia_local(a.timezone)::text)"
        "  FROM public.notificacoes_agendamentos a"
        " WHERE a.aluno_id = p.aluno_id AND a.tipo = 'revisao_diaria' AND p.sugestao_id IS NOT NULL AND p.aluno_id = %s",
        (C,),
    )


def _revisao(c) -> tuple[str, dict]:
    c.execute(
        "UPDATE public.notificacoes_agendamentos SET proxima_execucao = now() - interval '1 minute'"
        " WHERE aluno_id = %s AND tipo = 'revisao_diaria'",
        (C,),
    )
    c.execute("SELECT public.notificacoes_processar_rotinas(%s, 'horario')", (C,))
    return c.execute(
        "SELECT status, contexto FROM public.notificacoes_pendentes"
        " WHERE aluno_id = %s AND tipo = 'revisao_diaria' AND sugestao_id IS NULL",
        (C,),
    ).fetchone()


def test_revisao_cede_a_notificacao_diaria_da_ia():
    with _banco() as c:
        rotina._semear(c)
        rotina.fala._login(c, C)
        _sugestao_da_ia(c, diaria=True)
        status, contexto = _revisao(c)

    assert status == "suprimida"
    assert contexto["suprimida_por"] == "notificacao_diaria_da_ia"


def test_lembrete_que_nao_e_o_diario_nao_cala_a_revisao():
    with _banco() as c:
        rotina._semear(c)
        rotina.fala._login(c, C)
        _sugestao_da_ia(c, diaria=False)
        status, contexto = _revisao(c)

    assert status == "pendente"
    assert "suprimida_por" not in contexto


def test_sem_notificacao_da_ia_a_revisao_sai_com_o_topico():
    with _banco() as c:
        rotina._semear(c)
        rotina.fala._login(c, C)
        status, contexto = _revisao(c)

    assert status == "pendente"
    assert contexto["texto_rotina"]["variante"] == "com_topico"
