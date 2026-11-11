"""Estrutura da `20261110_11` (portões das RPCs `SECURITY DEFINER` da visibilidade do tópico).

O comportamento foi medido num Postgres descartável com o texto de produção das quatro funções;
aqui fica o que não pode regredir no texto.
"""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261110_11_portoes_da_visibilidade.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def test_encadeia_depois_da_visibilidade():
    assert M.revision == "20261110_11"
    assert M.down_revision == "20261110_10"


def test_sem_porcentagem_nem_bind():
    assert "%" not in UP and "%" not in DOWN
    assert not re.search(r"(?<!:):[A-Za-z_]", UP)
    assert not re.search(r"(?<!:):[A-Za-z_]", DOWN)


def test_portoes_das_rpcs_definer_barram_topico_oculto():
    # SECURITY DEFINER não passa pela RLS: o bloqueio entra nos portões por onde elas passam.
    assinaturas = {p[0] for p in M.PORTOES}
    assert assinaturas == {
        "public.fn_questao_acesso(uuid, bigint)",
        "public.atividade_iniciar_tentativa(bigint)",
        "public.fn_questao_liberada_para(uuid, bigint)",
        "public.bag_listar(text, text, bigint, bigint, text)",
    }
    for assinatura, de, para, marca in M.PORTOES:
        assert para.count(de) == 1, assinatura  # a âncora continua lá, só ganha o bloqueio
        assert marca in para and marca not in de, assinatura
        assert f"to_regprocedure('{assinatura}')" in UP
        assert f"to_regprocedure('{assinatura}')" in DOWN
    # Responder e iniciar tentativa recusam com um erro próprio, não com "sem matrícula".
    recusam = [p for p in M.PORTOES if "RAISE EXCEPTION 'topico_nao_publicado'" in p[2]]
    assert {p[0] for p in recusam} == {
        "public.fn_questao_acesso(uuid, bigint)",
        "public.atividade_iniciar_tentativa(bigint)",
    }
    assert all("ERRCODE = '42501'" in p[2] for p in recusam)
    # Na Bag, só o card personalizado sai; a anotação do próprio aluno fica.
    bag = next(p for p in M.PORTOES if p[0].startswith("public.bag_listar"))
    assert "cp.topico_id" in bag[2] and "bi." not in bag[2]


def test_funcao_ausente_e_pulada_e_ancora_ausente_falha():
    assert UP.count("IF v_fn IS NULL THEN RETURN; END IF;") == len(M.PORTOES)
    assert UP.count("sem a ancora esperada';") == len(M.PORTOES)
    # O downgrade nunca aborta: cita o RAISE dos portões só como o texto a remover.
    assert "sem a ancora esperada" not in DOWN
    assert DOWN.count("RAISE EXCEPTION") == DOWN.count("RAISE EXCEPTION 'topico_nao_publicado'")


def test_repetir_nao_faz_nada():
    # A marca já no texto encerra a troca antes do replace (e o contrário no downgrade).
    for assinatura, de, para, marca in M.PORTOES:
        sobe = M.troca_no_vivo(assinatura, de, para, ligar=True, marca=marca)
        desce = M.troca_no_vivo(assinatura, de, para, ligar=False, marca=marca)
        assert f"IF strpos(v_def, $c${marca}$c$) > 0 THEN RETURN; END IF;" in sobe
        assert f"IF strpos(v_def, $c${marca}$c$) = 0 THEN RETURN; END IF;" in desce
        assert sobe.index("strpos(v_def, $c$" + marca) < sobe.index("EXECUTE replace")
