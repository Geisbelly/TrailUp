"""`20261108_02` num Postgres de verdade: o push lê os recibos da Expo.

`net.http_post` é um dublê que só registra o pedido, e a resposta da Expo é escrita à mão em
`net._http_response`, como o pg_net faria. O cron não roda: cada teste chama
`notificacoes_conciliar_push()`, que é o que o `pg_cron` chama a cada 5 minutos.
"""

from __future__ import annotations

import json
import uuid

import pytest

from tests import _f5_banco as f5

pytestmark = f5.e2e

M = f5.modulo("20261108_02_push_le_os_recibos_da_expo.py")

ALUNO = uuid.UUID(int=21)
TOKEN = "ExponentPushToken[morto]"
OUTRO = "ExponentPushToken[vivo]"

DUBLES = """
CREATE SCHEMA net;
CREATE TABLE net.pedidos (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, url text, body jsonb, headers jsonb);
CREATE TABLE net._http_response (id bigint PRIMARY KEY, status_code integer, content_type text,
  headers jsonb, content text, timed_out boolean, error_msg text, created timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}',
  headers jsonb DEFAULT '{}', timeout_milliseconds integer DEFAULT 5000) RETURNS bigint
LANGUAGE sql AS $$ INSERT INTO net.pedidos (url, body, headers) VALUES (url, body, headers) RETURNING id $$;
CREATE FUNCTION public.notificacoes_cfg_txt(p_chave text, p_default text) RETURNS text
LANGUAGE sql AS $$ SELECT p_default $$;
CREATE FUNCTION public.notificacoes_cfg_int(p_chave text, p_default integer) RETURNS integer
LANGUAGE sql AS $$ SELECT p_default $$;
"""


def _banco(fn: str = "upgrade"):
    sqls = [DUBLES, *f5.sql_de(M)]
    if fn == "downgrade":
        sqls += f5.sql_de(M, "downgrade")
    return f5.banco(*sqls)


def _um(c, sql: str, *args):
    return c.execute(sql, args).fetchone()[0]


def _semear(c) -> int:
    f5.afrouxa(c, "alunos")
    c.execute(f"INSERT INTO auth.users (id, email) VALUES ('{ALUNO}', 'a@teste.invalid')")
    c.execute(f"INSERT INTO public.alunos (id, nome, email) VALUES ('{ALUNO}', 'A', 'a@teste.invalid')")
    for token in (TOKEN, OUTRO):
        c.execute(
            "INSERT INTO public.expo_tokens (aluno_id, token, ultima_atividade_em)"
            " VALUES (%s, %s, now() - interval '30 days')",
            (ALUNO, token),
        )
    return _um(
        c, "INSERT INTO public.notificacoes (aluno_id, titulo, corpo) VALUES (%s, 'T', 'C') RETURNING id", ALUNO
    )


def _envio(c, notificacao: int, tickets: list[dict], ha: str = "1 minute", tokens=(TOKEN, OUTRO)) -> int:
    """Um envio de push já respondido pela Expo, como o pg_net deixaria."""
    request = _um(c, "SELECT net.http_post('https://exp.host/--/api/v2/push/send', '[]'::jsonb)")
    c.execute(
        "INSERT INTO public.notificacoes_push_envios (request_id, notificacao_id, aluno_id, tokens, criado_em)"
        " VALUES (%s, %s, %s, %s, now() - %s::interval)",
        (request, notificacao, ALUNO, list(tokens), ha),
    )
    c.execute(
        "INSERT INTO net._http_response (id, status_code, content) VALUES (%s, 200, %s)",
        (request, json.dumps({"data": tickets})),
    )
    return request


def _envelhecer(c, intervalo: str) -> None:
    c.execute("UPDATE public.notificacoes_push_tickets SET criado_em = now() - %s::interval", (intervalo,))


def _responder_recibos(c, recibos: dict, status: int = 200) -> None:
    pedido = _um(c, "SELECT max(id) FROM net.pedidos WHERE strpos(url, 'getReceipts') > 0")
    c.execute(
        "INSERT INTO net._http_response (id, status_code, content) VALUES (%s, %s, %s)",
        (pedido, status, json.dumps({"data": recibos})),
    )


def _ativo(c, token: str) -> tuple:
    return c.execute(
        "SELECT ativo, desativado_motivo FROM public.expo_tokens WHERE token = %s", (token,)
    ).fetchone()


def _conciliar(c) -> dict:
    return _um(c, "SELECT public.notificacoes_conciliar_push()")


OK = {"status": "ok"}
MORTO = {"status": "error", "message": "x", "details": {"error": "DeviceNotRegistered"}}


def test_recibo_device_not_registered_desativa_o_token() -> None:
    with _banco() as c:
        notificacao = _semear(c)
        _envio(c, notificacao, [{"status": "ok", "id": "t1"}, {"status": "ok", "id": "t2"}])

        # Volta 1: os tickets dizem ok. Antes desta migration, a história acabava aqui.
        r = _conciliar(c)
        assert r["entregues"] == 2 and r["tokens_desativados"] == 0
        assert _um(c, "SELECT resultado FROM public.notificacoes_push_envios") == "2 ok, 0 recusados"
        assert _um(c, "SELECT count(*) FROM public.notificacoes_push_tickets") == 2
        # Recibo ainda não saiu (menos de 15 minutos): nada é pedido.
        assert r["recibos"]["pedidos"] == 0

        # Volta 2, 20 minutos depois: pede os dois recibos num pedido só.
        _envelhecer(c, "20 minutes")
        assert _conciliar(c)["recibos"]["pedidos"] == 2
        corpo = _um(c, "SELECT body FROM net.pedidos WHERE strpos(url, 'getReceipts') > 0")
        assert sorted(corpo["ids"]) == ["t1", "t2"]

        # Volta 3: a Expo diz que o primeiro aparelho desinstalou.
        _responder_recibos(c, {"t1": MORTO, "t2": OK})
        recibos = _conciliar(c)["recibos"]
        assert recibos["tokens_desativados"] == 1 and recibos["entregues"] == 1
        assert _ativo(c, TOKEN) == (False, "DeviceNotRegistered")
        assert _ativo(c, OUTRO) == (True, None)
        assert _um(c, "SELECT push_erro FROM public.notificacoes") == "recibo: DeviceNotRegistered"

        # O próximo envio já não inclui o token morto.
        tokens = c.execute(
            f"SELECT token FROM public.expo_tokens WHERE aluno_id = '{ALUNO}' AND ativo"
        ).fetchall()
        assert tokens == [(OUTRO,)]


def test_abrir_o_app_depois_do_envio_protege_o_token() -> None:
    with _banco() as c:
        notificacao = _semear(c)
        _envio(c, notificacao, [{"status": "ok", "id": "t1"}], tokens=(TOKEN,))
        _conciliar(c)
        _envelhecer(c, "20 minutes")
        _conciliar(c)
        # O aluno reinstalou e logou depois do envio: o login reativou o mesmo token.
        c.execute("UPDATE public.expo_tokens SET ultima_atividade_em = now() WHERE token = %s", (TOKEN,))
        _responder_recibos(c, {"t1": MORTO})
        assert _conciliar(c)["recibos"]["tokens_desativados"] == 0
        assert _ativo(c, TOKEN) == (True, None)


def test_credencial_invalida_registra_o_erro_e_nao_mata_o_aparelho() -> None:
    with _banco() as c:
        notificacao = _semear(c)
        # No ticket: era o que derrubava o token iOS em produção.
        _envio(
            c,
            notificacao,
            [{"status": "error", "details": {"error": "InvalidCredentials"}}, {"status": "ok", "id": "t2"}],
        )
        _conciliar(c)
        assert _ativo(c, TOKEN) == (True, None)

        # No recibo.
        _envelhecer(c, "20 minutes")
        _conciliar(c)
        _responder_recibos(c, {"t2": {"status": "error", "details": {"error": "InvalidCredentials"}}})
        assert _conciliar(c)["recibos"]["erros"] == 1
        assert _ativo(c, OUTRO) == (True, None)
        assert _um(c, "SELECT push_erro FROM public.notificacoes") == "recibo: InvalidCredentials"


def test_ticket_device_not_registered_continua_desativando() -> None:
    with _banco() as c:
        notificacao = _semear(c)
        _envio(c, notificacao, [{"status": "error", "details": {"error": "DeviceNotRegistered"}}, OK | {"id": "t2"}])
        assert _conciliar(c)["tokens_desativados"] == 1
        assert _ativo(c, TOKEN) == (False, "DeviceNotRegistered")
        assert _um(c, "SELECT resultado FROM public.notificacoes_push_envios") == "1 ok, 1 recusados"


def test_recibo_que_nao_saiu_volta_para_a_fila_e_expira_em_23_horas() -> None:
    with _banco() as c:
        notificacao = _semear(c)
        _envio(c, notificacao, [{"status": "ok", "id": "t1"}], tokens=(TOKEN,))
        _conciliar(c)
        _envelhecer(c, "20 minutes")
        _conciliar(c)
        _responder_recibos(c, {})  # a Expo omite o id cujo recibo não saiu
        assert _conciliar(c)["recibos"]["esperando"] == 1
        # Volta para a fila e é pedido de novo na mesma volta.
        assert _um(c, "SELECT count(*) FROM net.pedidos WHERE strpos(url, 'getReceipts') > 0") == 2

        _envelhecer(c, "24 hours")
        c.execute("UPDATE public.notificacoes_push_tickets SET recibo_request_id = NULL")
        assert _conciliar(c)["recibos"]["expirados"] == 1
        assert _um(c, "SELECT resultado FROM public.notificacoes_push_tickets") == "recibo expirado"
        assert _ativo(c, TOKEN) == (True, None)


def test_resposta_com_erro_http_pede_de_novo() -> None:
    with _banco() as c:
        notificacao = _semear(c)
        _envio(c, notificacao, [{"status": "ok", "id": "t1"}], tokens=(TOKEN,))
        _conciliar(c)
        _envelhecer(c, "20 minutes")
        _conciliar(c)
        _responder_recibos(c, {}, status=500)
        _conciliar(c)
        assert _um(c, "SELECT count(*) FROM net.pedidos WHERE strpos(url, 'getReceipts') > 0") == 2
        assert _um(c, "SELECT conciliado_em FROM public.notificacoes_push_tickets") is None


def test_falha_nos_recibos_nao_desfaz_a_conciliacao_dos_tickets() -> None:
    with _banco() as c:
        notificacao = _semear(c)
        c.execute("DROP FUNCTION public.notificacoes_conciliar_recibos_push(integer)")
        _envio(c, notificacao, [{"status": "ok", "id": "t1"}], tokens=(TOKEN,))
        r = _conciliar(c)
        assert "erro" in r["recibos"]
        assert _um(c, "SELECT resultado FROM public.notificacoes_push_envios") == "1 ok, 0 recusados"


def test_ticket_apaga_junto_com_o_token() -> None:
    with _banco() as c:
        notificacao = _semear(c)
        _envio(c, notificacao, [{"status": "ok", "id": "t1"}], tokens=(TOKEN,))
        _conciliar(c)
        c.execute("DELETE FROM public.expo_tokens WHERE token = %s", (TOKEN,))
        assert _um(c, "SELECT count(*) FROM public.notificacoes_push_tickets") == 0


def test_cliente_nao_le_os_tickets() -> None:
    with _banco() as c:
        notificacao = _semear(c)
        _envio(c, notificacao, [{"status": "ok", "id": "t1"}], tokens=(TOKEN,))
        _conciliar(c)
        c.execute("BEGIN")
        f5.como(c, ALUNO)
        c.execute("SET LOCAL ROLE authenticated")
        with pytest.raises(Exception, match="permission denied"):
            c.execute("SELECT count(*) FROM public.notificacoes_push_tickets")
        c.execute("ROLLBACK")


def test_token_android_do_expo_go_sai_e_o_resto_fica() -> None:
    # Os tokens existem ANTES da migração, como em produção.
    with f5.banco(DUBLES) as c:
        f5.afrouxa(c, "alunos")
        c.execute(f"INSERT INTO auth.users (id, email) VALUES ('{ALUNO}', 'a@teste.invalid')")
        c.execute(f"INSERT INTO public.alunos (id, nome, email) VALUES ('{ALUNO}', 'A', 'a@teste.invalid')")
        for token, plataforma, criado in (
            ("ExponentPushToken[expo-go]", "android", "2026-08-26T15:00:00-03:00"),
            ("ExponentPushToken[build-novo]", "android", "2026-11-10T10:00:00-03:00"),
            ("ExponentPushToken[ios-antigo]", "ios", "2026-08-01T10:00:00-03:00"),
        ):
            c.execute(
                "INSERT INTO public.expo_tokens (aluno_id, token, plataforma, created_at) VALUES (%s, %s, %s, %s)",
                (ALUNO, token, plataforma, criado),
            )
        for sql in f5.sql_de(M):
            c.execute(sql)

        assert _ativo(c, "ExponentPushToken[expo-go]") == (False, "expo_go")
        assert _ativo(c, "ExponentPushToken[build-novo]") == (True, None)
        assert _ativo(c, "ExponentPushToken[ios-antigo]") == (True, None)


def test_downgrade_volta_a_conciliar_so_os_tickets() -> None:
    with _banco("downgrade") as c:
        notificacao = _semear(c)
        assert _um(c, "SELECT to_regclass('public.notificacoes_push_tickets')") is None
        _envio(c, notificacao, [{"status": "error", "details": {"error": "InvalidCredentials"}}, OK | {"id": "t2"}])
        r = _conciliar(c)
        assert "recibos" not in r
        assert _ativo(c, TOKEN) == (False, "InvalidCredentials")
