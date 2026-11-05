"""`20261105_14` num Postgres descartável: quem grava, o que limpa, o que o dono lê e quando avisa."""

from __future__ import annotations

import json
import os
import uuid

import pytest
from sqlalchemy import text

from tests.test_e2e_monitor_disponibilidade import ALUNO, DONO, EMAIL_DONO, _modulo, alertas, banco  # noqa: F401

M = _modulo("20261105_14_saude_dos_clientes.py")
V = _modulo("20261105_17_versao_do_cliente_sem_limpeza.py")
exige_docker = pytest.mark.skipif(os.environ.get("TRAILUP_TEST_DOCKER") != "1", reason="requer TRAILUP_TEST_DOCKER=1 e Docker")


@pytest.fixture
def c(banco):  # noqa: F811
    banco.execute(f"INSERT INTO auth.users VALUES ('{ALUNO}', 'aluna@example.test')")
    banco.execute(M.TABELAS)
    banco.execute(M.FUNCOES_SQL)
    banco.execute(V.FUNCAO)
    banco.execute(V._trocar(V.ANTES, V.DEPOIS))
    return banco


def como(c, uid, email="x@example.test"):
    claims = json.dumps({"sub": uid, "email": email, "role": "authenticated"})
    c.execute("SELECT set_config('request.jwt.claims', %s, false)", (claims,))
    c.execute("SET ROLE authenticated")


def voltar(c):
    c.execute("RESET ROLE")
    c.execute("SELECT set_config('request.jwt.claims', '', false)")


def sessao(id_=None, **campos):
    return {"id": id_ or str(uuid.uuid4()), "superficie": "app", "versao": "1.0.6", "plataforma": "android", **campos}


def registrar(c, s, erros=()):
    c.execute("SELECT public.cliente_saude_registrar(%s::jsonb, %s::jsonb)", (json.dumps(s), json.dumps(list(erros))))


def erro(**campos):
    return {"assinatura": "abc123", "tipo": "tela", "nome": "TypeError", "rota": "/trilha/:id", **campos}


@exige_docker
def test_sem_sessao_nao_grava_e_anon_nem_tem_execute(c) -> None:
    import psycopg

    c.execute("SET ROLE authenticated")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        registrar(c, sessao())
    voltar(c)
    c.execute("SET ROLE anon")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        registrar(c, sessao())
    voltar(c)


@exige_docker
def test_cliente_nao_le_as_tabelas(c) -> None:
    import psycopg

    como(c, ALUNO)
    registrar(c, sessao())
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("SELECT * FROM public.cliente_sessao")
    voltar(c)


@exige_docker
def test_reenvio_nao_conta_duas_vezes(c) -> None:
    s = sessao(chamadas=10, falhas_servidor=2, falhas_por_destino={"rpc/loja_saldo": 2})
    como(c, ALUNO)
    registrar(c, s)
    registrar(c, s)
    registrar(c, {**s, "chamadas": 4})  # lote velho chegando atrasado não baixa o contador
    voltar(c)
    assert c.execute("SELECT chamadas, falhas_servidor, falhas_por_destino FROM public.cliente_sessao").fetchall() == [
        (10, 2, {"rpc/loja_saldo": 2})
    ]


@exige_docker
def test_sessao_de_outra_pessoa_nao_muda_e_nao_recebe_erro(c) -> None:
    s = sessao(chamadas=3)
    como(c, ALUNO)
    registrar(c, s)
    voltar(c)
    como(c, DONO)
    registrar(c, {**s, "chamadas": 99}, [erro()])
    voltar(c)
    assert c.execute("SELECT chamadas, user_id::text FROM public.cliente_sessao").fetchall() == [(3, ALUNO)]
    assert c.execute("SELECT count(*) FROM public.cliente_erro").fetchone()[0] == 0


@exige_docker
def test_texto_chega_limpo_mesmo_se_o_cliente_nao_limpar(c) -> None:
    como(c, ALUNO)
    registrar(c, sessao(), [erro(
        mensagem="falhou para maria@escola.br em https://x.test/a?b=1 aluno 3f2b8c1e-1111-2222-3333-444455556666 fone 51999998888"
    )])
    voltar(c)
    mensagem = c.execute("SELECT mensagem FROM public.cliente_erro").fetchone()[0]
    assert "maria" not in mensagem and "x.test" not in mensagem and "3f2b8c1e" not in mensagem and "9999" not in mensagem
    assert "<email>" in mensagem and "<url>" in mensagem and "<id>" in mensagem and "<n>" in mensagem


@exige_docker
def test_versao_guarda_o_sha_inteiro_e_recusa_o_que_nao_e_versao(c) -> None:
    como(c, ALUNO)
    registrar(c, sessao(versao="7140574f"), [erro()])
    registrar(c, sessao(versao="1.0.6"))
    registrar(c, sessao(versao="maria@escola.br"))
    voltar(c)
    assert sorted(str(r[0]) for r in c.execute("SELECT versao FROM public.cliente_sessao").fetchall()) == [
        "1.0.6", "7140574f", "None"
    ]
    assert c.execute("SELECT versao FROM public.cliente_erro").fetchone()[0] == "7140574f"


@exige_docker
def test_erro_junta_por_assinatura_e_lixo_e_recusado(c) -> None:
    s1, s2 = sessao(), sessao()
    como(c, ALUNO)
    registrar(c, s1, [erro(), erro(), erro(assinatura="UM ID INVALIDO!"), erro(tipo="outro")])
    registrar(c, s2, [erro()])
    voltar(c)
    assert c.execute("SELECT count(*), max(vezes), max(cardinality(sessoes)) FROM public.cliente_erro").fetchone() == (1, 3, 2)


@exige_docker
def test_relogio_do_aparelho_nao_manda(c) -> None:
    como(c, ALUNO)
    registrar(c, sessao(inicio="2099-01-01T00:00:00Z", ultima_em="texto"))
    voltar(c)
    assert c.execute("SELECT inicio <= now(), ultima_em <= now() FROM public.cliente_sessao").fetchone() == (True, True)


@exige_docker
def test_teto_por_pessoa_ignora_sessao_nova_sem_erro(c) -> None:
    c.execute(
        f"""INSERT INTO public.cliente_sessao (id, user_id, superficie, inicio, ultima_em)
            SELECT gen_random_uuid(), '{ALUNO}', 'app', now(), now() FROM generate_series(1, 200)"""
    )
    como(c, ALUNO)
    registrar(c, sessao())
    voltar(c)
    assert c.execute("SELECT count(*) FROM public.cliente_sessao").fetchone()[0] == 200


@exige_docker
def test_painel_so_para_o_dono_e_sem_identificador(c) -> None:
    import psycopg

    como(c, ALUNO)
    registrar(c, sessao(criticas=4, criticas_falha=1, lcp_ms=2000, formato="celular", erros=1), [erro()])
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("SELECT public.painel_clientes(24)")
    voltar(c)
    como(c, DONO, EMAIL_DONO)
    registrar(c, sessao(superficie="console", chamadas=5))
    painel = c.execute("SELECT public.painel_clientes(24)").fetchone()[0]
    voltar(c)
    bruto = json.dumps(painel)
    assert ALUNO not in bruto and DONO not in bruto
    app = next(s for s in painel["superficies"] if s["superficie"] == "app")
    assert (app["sessoes"], app["sessoes_com_erro"], app["sessoes_sem_falha"]) == (1, 1, 0)
    assert app["vitais"][0]["lcp_p75_ms"] == 2000
    assert painel["erros"][0]["pessoas"] == 1 and painel["erros"][0]["nova"] is True
    assert painel["console"]["ativos_7d"] == 1 and painel["console"]["professores"] == 1


@exige_docker
def test_avisa_com_duas_pessoas_e_uma_vez_so(c) -> None:
    como(c, ALUNO)
    registrar(c, sessao(), [erro()])
    voltar(c)
    assert c.execute("SELECT public.fn_cliente_saude_varrer()").fetchone()[0] == 0
    como(c, DONO, EMAIL_DONO)
    registrar(c, sessao(), [erro()])
    voltar(c)
    c.execute("SELECT public.fn_cliente_saude_varrer()")
    c.execute("SELECT public.fn_cliente_saude_varrer()")
    assert alertas(c) == ["[TrailUp] Erro derrubando tela em app"]


@exige_docker
def test_erro_comum_nao_avisa(c) -> None:
    como(c, ALUNO)
    registrar(c, sessao(), [erro(tipo="promessa")])
    voltar(c)
    como(c, DONO, EMAIL_DONO)
    registrar(c, sessao(), [erro(tipo="promessa")])
    voltar(c)
    c.execute("SELECT public.fn_cliente_saude_varrer()")
    assert alertas(c) == []


def test_nenhum_bloco_vira_parametro_de_bind() -> None:
    for bloco in (M.TABELAS, M.FUNCOES_SQL, M.AGENDAR, M.DESAGENDAR, V.FUNCAO, V._trocar(V.ANTES, V.DEPOIS), V.CORRIGIR):
        assert not text(bloco).compile().params
