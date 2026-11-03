"""`20261103_12`: a notificação fala com o aluno pelo nome, com o guia e no tom do perfil da tela.

Mesmo banco do e2e da `20261102_24` (motor da `_01`, matriz e foco da `_18`, guarda da `_24`), com a
`_10` por cima. O aluno entra como o PostgREST entraria (`SET ROLE authenticated` com o `sub` do JWT)
e dispara a entrega pelo login. `net.http_post` é o dublê da `_18`: grava o corpo do push. Dados
sintéticos.

Alunos de `_semear` da `_18`: A é Socializer (90) com Mastermind (40); B é Socializer (70) com
Conqueror (20); C é Conqueror (85), apelido "Cacau".
"""

from __future__ import annotations

import json

from tests import _f5_banco as f5
from tests import test_e2e_notificacao_por_perfil_e_foco as p
from tests import test_e2e_notificacao_so_com_texto_da_guarda as g

pytestmark = f5.e2e

M = f5.modulo("20261103_12_notificacao_fala_com_o_aluno_no_perfil.py")
A, B, C = p.A, p.B, p.C


def _banco_completo():
    return f5.banco(
        *p.h._motor(),
        *f5.sql_de(p.M01),
        p.ANTES,
        p.RETENCAO,
        p.M_LIMITE.TABELA_CONFIG,
        p.M_LIMITE.FUNCAO_LIMITE,
        *f5.sql_de(p.M),
        *f5.sql_de(g.M),
        *f5.sql_de(M),
    )


def _semear(c) -> None:
    p._semear(c)
    c.execute(f"UPDATE public.alunos SET nome = 'Ana  Clara Souza' WHERE id = '{A}'")


def _login(c, aluno) -> None:
    c.execute("SET ROLE authenticated")
    f5.como(c, aluno)
    c.execute("SELECT public.notificacoes_registrar_login('android')")
    c.execute("RESET ROLE")
    f5.como(c, None)


def _caixa(c, aluno, tipo: str) -> list[tuple[str, str]]:
    return c.execute(
        "SELECT titulo, corpo FROM public.notificacoes WHERE aluno_id = %s AND tipo = %s ORDER BY id",
        (aluno, tipo),
    ).fetchall()


def _rotina(c, aluno, tipo: str) -> tuple[str, str]:
    return c.execute(
        "SELECT titulo, corpo FROM public.notificacoes_agendamentos WHERE aluno_id = %s AND tipo = %s",
        (aluno, tipo),
    ).fetchone()


def _pushes(c) -> list[dict]:
    return [r for (r,) in c.execute("SELECT corpo FROM net.posts ORDER BY id").fetchall()]


def _titulos_do_push(c) -> list[str]:
    return [m["title"] for corpo in _pushes(c) for m in (corpo if isinstance(corpo, list) else [corpo])]


def test_login_fala_com_o_aluno_pelo_nome_e_com_o_guia_do_perfil():
    with _banco_completo() as c:
        _semear(c)
        _login(c, A)
        _login(c, C)
        caixa_a = _caixa(c, A, "retomada_login")
        caixa_c = _caixa(c, C, "retomada_login")
        push = _titulos_do_push(c)

    assert caixa_a == [("Que bom te ver de novo, Ana!", "Mateo e a turma seguem na trilha. Continue de onde parou.")]
    assert caixa_c == [("De volta à trilha, Cacau", "Amina guardou a sua próxima etapa. Hora de avançar.")]
    assert "Que bom te ver de novo, Ana!" in push and "De volta à trilha, Cacau" in push
    assert not any("{" in t for t in push)


def test_sem_nome_utilizavel_a_frase_fica_de_pe():
    with _banco_completo() as c:
        _semear(c)
        c.execute(f"UPDATE public.alunos SET nome = 'b@teste.invalid' WHERE id = '{B}'")
        _login(c, B)
        caixa = _caixa(c, B, "retomada_login")
    assert caixa == [("Que bom te ver de novo!", "Mateo e a turma seguem na trilha. Continue de onde parou.")]


def test_rotina_segue_o_perfil_que_o_aluno_escolheu_se_for_representativo():
    with _banco_completo() as c:
        _semear(c)
        _login(c, A)
        antes = _rotina(c, A, "revisao_diaria")
        c.execute(f"UPDATE public.alunos SET perfil_ativo = 'mastermind' WHERE id = '{A}'")
        escolhido = _rotina(c, A, "revisao_diaria")
        # Conqueror não aparece no vetor de A: não é representativo, vale o dominante.
        c.execute(f"UPDATE public.alunos SET perfil_ativo = 'conqueror' WHERE id = '{A}'")
        fora = _rotina(c, A, "revisao_diaria")
        # O login reescreve a rotina com o texto genérico (upsert de garantir_rotinas): o perfil vence.
        _login(c, A)
        depois_do_login = _rotina(c, A, "revisao_diaria")

    assert antes == ("Vem com a turma, Ana", "Mateo guardou o seu lugar na trilha. Estudar um pouco hoje te deixa junto da turma.")
    assert escolhido == ("A próxima peça, Ana", "Idris separou a próxima parte, que se liga ao que você já viu. Que tal entender como?")
    assert fora == antes
    assert depois_do_login == antes


def test_nome_escrito_pela_ia_vira_nome_so_no_banco():
    with _banco_completo() as c:
        _semear(c)
        sugestao = c.execute(
            "INSERT INTO public.notificacoes_ia (aluno_id, tipo, contexto, titulo, corpo, origem, prioridade)"
            " VALUES (%s, 'suporte', %s::jsonb, 'Vamos juntos, {nome}?', 'Mateo separou um passo curto em Frações.', 'ciclo', 2)"
            " RETURNING id",
            (A, json.dumps({"motivo": "emocao_negativa", "texto_guarda": 1})),
        ).fetchone()[0]
        _login(c, A)
        caixa = _caixa(c, A, "suporte")
        guardado = c.execute("SELECT titulo FROM public.notificacoes_ia WHERE id = %s", (sugestao,)).fetchone()[0]
        push = _titulos_do_push(c)

    assert caixa == [("Vamos juntos, Ana?", "Mateo separou um passo curto em Frações.")]
    assert "Vamos juntos, Ana?" in push
    assert guardado == "Vamos juntos, {nome}?"


def test_conquista_no_tom_do_perfil_com_o_nome_da_conquista():
    with _banco_completo() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.notificacoes (aluno_id, titulo, corpo, tipo) VALUES"
            " (%s, 'Nova conquista desbloqueada!', 'Parabéns! Você desbloqueou a conquista \"Maratonista\".', 'conquista'),"
            " (%s, 'Nova conquista desbloqueada!', 'Parabéns! Você desbloqueou a conquista \"Maratonista\".', 'conquista'),"
            " (%s, 'Nova conquista desbloqueada!', 'Texto em outro formato.', 'conquista')",
            (C, A, A),
        )
        caixa_c = _caixa(c, C, "conquista")
        caixa_a = _caixa(c, A, "conquista")

    assert caixa_c == [("Mais uma vitória, Cacau!", "A conquista “Maratonista” é sua. Rumo à próxima!")]
    assert caixa_a == [
        ("Conquista para comemorar, Ana!", "Você desbloqueou “Maratonista”. Que tal contar para a turma?"),
        ("Conquista para comemorar, Ana!", "Texto em outro formato."),
    ]


def test_falha_no_texto_nao_derruba_quem_escreve():
    with _banco_completo() as c:
        _semear(c)
        c.execute("DROP TABLE public.notificacoes_textos_perfil")
        c.execute(
            "INSERT INTO public.notificacoes (aluno_id, titulo, corpo, tipo)"
            " VALUES (%s, 'Nova conquista desbloqueada!', 'corpo', 'conquista')",
            (C,),
        )
        _login(c, C)
        conquista = _caixa(c, C, "conquista")
        retomada = _caixa(c, C, "retomada_login")
    assert conquista == [("Nova conquista desbloqueada!", "corpo")]
    assert len(retomada) == 1  # o login seguiu e entregou, com o texto que veio


def test_cliente_nao_le_os_textos_nem_chama_as_funcoes():
    with _banco_completo() as c:
        _semear(c)
        c.execute("SET ROLE authenticated")
        f5.como(c, A)
        tabela = c.execute(
            "SELECT has_table_privilege('public.notificacoes_textos_perfil', 'SELECT')"
        ).fetchone()[0]
        funcao = c.execute(
            "SELECT has_function_privilege('public.notificacoes_resolver_texto(uuid, text, text)', 'EXECUTE')"
        ).fetchone()[0]
        c.execute("RESET ROLE")
    assert tabela is False and funcao is False


def test_upgrade_e_idempotente_e_downgrade_volta_o_texto_antigo():
    with _banco_completo() as c:
        _semear(c)
        _login(c, A)
        for sql in f5.sql_de(M):
            c.execute(sql)
        de_novo = _rotina(c, A, "retomada_login")
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        antiga = _rotina(c, A, "retomada_login")
        sobra = c.execute(
            "SELECT count(*) FROM pg_proc WHERE proname IN ('notificacoes_resolver_texto', 'notificacoes_caixa_texto')"
        ).fetchone()[0]
    assert de_novo == ("Que bom te ver de novo, Ana!", "Mateo e a turma seguem na trilha. Continue de onde parou.")
    assert antiga == ("Bem-vindo de volta", "Continue de onde parou na sua trilha.")
    assert sobra == 0
