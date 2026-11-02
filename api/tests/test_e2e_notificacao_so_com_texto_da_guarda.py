"""`20261102_24`: o banco só entrega o texto da IA que passou pela guarda de hoje.

Mesmo banco do e2e da `20261102_18` (motor da `_01`, matriz, foco), com a `_24` por cima. O texto
que motivou a migração (`notificacoes_ia` 33 de produção, escrita antes da guarda e entregue no dia
seguinte) entra aqui como sugestão da API sem `texto_guarda`. O aluno entra como o PostgREST entraria
(`SET ROLE authenticated` com o `sub` do JWT) e dispara a entrega pelo login. Dados sintéticos.
"""

from __future__ import annotations

import json

from tests import _f5_banco as f5
from tests import test_e2e_notificacao_por_perfil_e_foco as p

pytestmark = f5.e2e

M = f5.modulo("20261102_24_notificacao_so_com_texto_da_guarda.py")
A = p.A

VELHO = ("Próxima hipótese em [MOCK] Aceleração", "A evidência apoia a progressão do modelo.")


def _banco():
    return f5.banco(
        *p.h._motor(),
        *f5.sql_de(p.M01),
        p.ANTES,
        p.RETENCAO,
        p.M_LIMITE.TABELA_CONFIG,
        p.M_LIMITE.FUNCAO_LIMITE,
        *f5.sql_de(p.M),
        *f5.sql_de(M),
    )


def _sugerir(c, titulo: str, contexto: dict, origem: str = "ciclo") -> int:
    return c.execute(
        "INSERT INTO public.notificacoes_ia (aluno_id, tipo, contexto, titulo, corpo, origem, prioridade)"
        " VALUES (%s, 'suporte', %s::jsonb, %s, 'corpo', %s, 2) RETURNING id",
        (A, json.dumps({"motivo": titulo, **contexto}), titulo, origem),
    ).fetchone()[0]


def _login_do_aluno(c) -> None:
    c.execute("SET ROLE authenticated")
    f5.como(c, A)
    c.execute("SELECT public.notificacoes_registrar_login('android')")
    c.execute("RESET ROLE")
    f5.como(c, None)


def _caixa_das_sugestoes(c) -> list[str]:
    """O que chegou à caixa vindo de sugestão (o login também entrega o "Bem-vindo de volta")."""
    return [
        t
        for (t,) in c.execute(
            "SELECT n.titulo FROM public.notificacoes n"
            "  JOIN public.notificacoes_pendentes p ON p.notificacao_id = n.id"
            " WHERE n.aluno_id = %s AND p.sugestao_id IS NOT NULL ORDER BY n.id",
            (A,),
        ).fetchall()
    ]


def _estado(c, sugestao: int) -> tuple:
    return c.execute(
        "SELECT s.status, COALESCE(s.motivo, ''), p.status, COALESCE(p.ultimo_erro, '')"
        "  FROM public.notificacoes_ia s JOIN public.notificacoes_pendentes p ON p.sugestao_id = s.id"
        " WHERE s.id = %s",
        (sugestao,),
    ).fetchone()


def test_so_sai_o_texto_da_api_aprovado_pela_guarda_de_hoje():
    with _banco() as c:
        p._semear(c)
        velho = c.execute(
            "INSERT INTO public.notificacoes_ia (aluno_id, tipo, contexto, titulo, corpo, prioridade)"
            " VALUES (%s, 'suporte', '{\"origem\": \"modelo\"}', %s, %s, 2) RETURNING id",
            (A, *VELHO),
        ).fetchone()[0]
        marcado = _sugerir(c, "marcado", {"texto_guarda": 1})
        lixo = _sugerir(c, "lixo", {"texto_guarda": "x1"})
        professor = _sugerir(c, "professor", {}, origem="professor")
        _login_do_aluno(c)
        caixa = _caixa_das_sugestoes(c)
        estados = {n: _estado(c, i) for n, i in (("velho", velho), ("marcado", marcado), ("lixo", lixo), ("professor", professor))}
        posts = [r for (r,) in c.execute("SELECT corpo::text FROM net.posts").fetchall()]

    assert sorted(caixa) == ["marcado", "professor"]
    assert VELHO[0] not in caixa
    fora = ("suprimida", "texto_fora_da_guarda", "suprimida", "texto_fora_da_guarda")
    assert estados["velho"] == fora
    assert estados["lixo"] == fora
    assert estados["marcado"][2] == "entregue" and estados["professor"][2] == "entregue"
    assert not any("MOCK" in r or "lixo" in r for r in posts)  # nem push
    assert sum("marcado" in r or "professor" in r for r in posts) == 2


def test_minimo_mais_alto_segura_a_marca_velha():
    with _banco() as c:
        p._semear(c)
        p.h._cfg(c, "texto_guarda_versao_minima", 2)
        antiga = _sugerir(c, "v1", {"texto_guarda": 1})
        nova = _sugerir(c, "v2", {"texto_guarda": 2})
        _login_do_aluno(c)
        caixa = _caixa_das_sugestoes(c)
        antiga_estado = _estado(c, antiga)
        nova_estado = _estado(c, nova)
    assert caixa == ["v2"]
    assert antiga_estado[2:] == ("suprimida", "texto_fora_da_guarda")
    assert nova_estado[2] == "entregue"


def test_aluno_nao_chama_a_entrega_nem_le_a_config():
    with _banco() as c:
        p._semear(c)
        c.execute("SET ROLE authenticated")
        f5.como(c, A)
        execute = c.execute(
            "SELECT has_function_privilege('notificacoes_entregar(uuid, text[])', 'EXECUTE')"
        ).fetchone()[0]
        c.execute("RESET ROLE")
    assert execute is False


def test_downgrade_volta_a_entrega_da_18_e_tira_a_chave():
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        corpo = c.execute("SELECT prosrc FROM pg_proc WHERE proname = 'notificacoes_entregar'").fetchone()[0]
        chave = c.execute(
            "SELECT count(*) FROM public.notificacoes_config WHERE chave = 'texto_guarda_versao_minima'"
        ).fetchone()[0]
    assert "texto_fora_da_guarda" not in corpo and "fim_foco" in corpo
    assert chave == 0


def test_upgrade_e_idempotente():
    with _banco() as c:
        for sql in f5.sql_de(M):
            c.execute(sql)
        corpo = c.execute("SELECT prosrc FROM pg_proc WHERE proname = 'notificacoes_entregar'").fetchone()[0]
    assert corpo.count("texto_fora_da_guarda") == 2
