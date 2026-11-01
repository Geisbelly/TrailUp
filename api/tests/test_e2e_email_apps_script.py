"""Ponta a ponta da `20261101_14` (e-mail pelo Apps Script) num Postgres LOCAL.

Mesmo esqueleto e mesmos dubles de `net` e `vault` da
`test_e2e_exclusao_professor_aviso.py` (nada sai da maquina), com a `20261024_06`
(contato do site) e a `20261101_14` por cima. O que importa aqui e o que o
teste estatico nao ve: a regra de aceite aplicada as respostas que o pg_net
guardou em producao (envio e falha sao os dois 200), o aviso de conta inativa
so contando prazo a partir dela, e os dois contatos chegando ao script com o
corpo certo.
"""

from __future__ import annotations

import json
import uuid
from contextlib import contextmanager

import pytest

from tests.test_e2e_exclusao_professor_aviso import (
    DONO_EMAIL,
    DUBLES,
    INATIVO,
    M07,
    _seed,
)
from tests.test_e2e_retencao_expurgo import (
    CARIMBO,
    DSN,
    ESQUELETO,
    M02,
    M03,
    PAPEIS,
    _dsn_para,
    _modulo,
    _sql_de,
)

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

M06 = _modulo("20261024_06_contato_publico_brevo.py")
M14 = _modulo("20261101_14_email_pelo_apps_script.py")

URL = "https://script.google.com/macros/s/AKfy-teste/exec"
ECO = "https://script.googleusercontent.com/macros/echo?user_content_key=teste"
EXTENSOES = "CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;"


@contextmanager
def _banco():
    nome = f"tu14e_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(_dsn_para(nome), autocommit=True) as c:
            c.execute(PAPEIS)
            c.execute(ESQUELETO.read_text(encoding="utf-8"))
            c.execute(CARIMBO)
            c.execute(DUBLES)
            c.execute(EXTENSOES)
            for modulo in (M02, M03, M07, M06, M14):
                for sql in _sql_de(modulo, "upgrade"):
                    c.execute(sql)
            c.execute(_seed())
            yield c
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _um(c, sql: str, *args):
    return c.execute(sql, args or None).fetchone()[0]


def _segredos(c, url: str = URL) -> None:
    c.execute(
        "INSERT INTO vault.decrypted_secrets VALUES ('apps_script_email_url', %s), "
        "('apps_script_email_segredo', 'segredo-de-teste')",
        (url,),
    )


def _aceito(c, status: int, headers: dict | None = None, conteudo: str | None = None, timeout=False) -> bool:
    return _um(
        c,
        "SELECT public.fn_email_apps_script_aceito(%s, %s::jsonb, %s, %s)",
        status,
        json.dumps(headers or {}),
        conteudo,
        timeout,
    )


def _aviso(c, coluna: str):
    return c.execute(
        f"SELECT {coluna} FROM public.retencao_avisos_inatividade WHERE aluno_id = '{INATIVO}'"
    ).fetchone()


def _responder(c, req: int, status: int, headers: dict | None = None, conteudo: str | None = None) -> None:
    c.execute(
        "INSERT INTO net._http_response (id, status_code, headers, content) VALUES (%s, %s, %s::jsonb, %s)",
        (req, status, json.dumps(headers or {}), conteudo),
    )


# As duas respostas medidas em producao em 01/11 (pedido 62 do pg_net e `curl`
# contra o script publicado). O pg_net 0.20 segue o redirecionamento, entao o
# envio que deu certo chega como 200 com o JSON do script; o script que levantou
# chega como 200 com a pagina de erro do Google. Mesmo codigo HTTP.
ENVIADO = (200, {"location": ECO, "content-type": "application/json; charset=utf-8"}, '{"ok":true,"cota_restante":99}')
LEVANTOU = (
    200,
    {"content-type": "text/html; charset=utf-8"},
    '<html><body><div>Error: segredo invalido (linha 80, arquivo &quot;C\u00f3digo&quot;)</div></body></html>',
)


def test_regra_de_aceite() -> None:
    with _banco() as c:
        assert _aceito(c, *ENVIADO)
        assert not _aceito(c, *LEVANTOU)
        # Se o pg_net deixar de seguir o redirecionamento.
        assert _aceito(c, 302, {"Location": ECO})
        assert _aceito(c, 302, {"location": ECO})
        # Implantacao sem acesso publico: 302 para o login, o script nem rodou.
        assert not _aceito(c, 302, {"Location": "https://accounts.google.com/ServiceLogin?continue=x"})
        assert not _aceito(c, 302, {})
        assert not _aceito(c, 500, conteudo='{"ok": true}')
        assert not _aceito(c, *ENVIADO, timeout=True)


def test_aviso_so_conta_prazo_com_ok_do_script() -> None:
    with _banco() as c:
        c.execute("UPDATE public.app_config SET valor = 'aplicar' WHERE chave = 'retencao_modo'")
        _segredos(c)
        r = _um(c, "SELECT public.trailup_retencao()")
        assert r["contas_inativas"]["email"]["enviados"] == 1

        url, corpo, headers = c.execute("SELECT url, body, headers FROM net.pedidos").fetchone()
        assert url == URL
        assert corpo["segredo"] == "segredo-de-teste"
        assert corpo["para"] == "inativo@teste.invalid"
        assert corpo["nome_remetente"] == "TrailUp"
        assert "menos de 18 anos" in corpo["texto"] and "<p>" in corpo["html"]
        assert "responder_para" not in corpo
        assert "api-key" not in headers

        # O script levantou e respondeu 200 com a pagina de erro: falha, volta
        # para a fila, nada de prazo. A regra antiga (so 2xx) daria isto por enviado.
        req = _aviso(c, "email_request_id")[0]
        _responder(c, req, *LEVANTOU)
        r = _um(c, "SELECT public.retencao_avisos_email()")
        assert r["confirmados"] == 0 and r["falhas"] == 1
        assert _aviso(c, "email_enviado_em IS NULL, email_ultimo_erro")[0:2] == (True, "HTTP 200")

        # 302 para o login tambem e falha.
        c.execute("UPDATE public.retencao_avisos_inatividade SET email_proxima_tentativa_em = now()")
        assert _um(c, "SELECT public.retencao_avisos_email()")["enviados"] == 1
        req = _aviso(c, "email_request_id")[0]
        _responder(c, req, 302, {"Location": "https://accounts.google.com/ServiceLogin"})
        assert _um(c, "SELECT public.retencao_avisos_email()")["falhas"] == 1
        assert _aviso(c, "email_enviado_em IS NULL")[0]

        # Agora o envio de verdade: confirmado, e o prazo conta dali.
        c.execute("UPDATE public.retencao_avisos_inatividade SET email_proxima_tentativa_em = now()")
        assert _um(c, "SELECT public.retencao_avisos_email()")["enviados"] == 1
        req = _aviso(c, "email_request_id")[0]
        _responder(c, req, *ENVIADO)
        assert _um(c, "SELECT public.retencao_avisos_email()")["confirmados"] == 1
        assert _aviso(c, "email_enviado_em IS NOT NULL")[0]

        c.execute("UPDATE public.retencao_avisos_inatividade SET email_enviado_em = now() - interval '31 days'")
        assert _um(c, "SELECT public.trailup_retencao()")["contas_inativas"]["exclusoes"] == 1
        assert _um(c, "SELECT count(*) FROM net.pedidos") == 3


def test_aviso_sem_segredo_nao_envia() -> None:
    with _banco() as c:
        c.execute("UPDATE public.app_config SET valor = 'aplicar' WHERE chave = 'retencao_modo'")
        c.execute("SELECT public.trailup_retencao()")
        assert _aviso(c, "email_ultimo_erro")[0] == "segredo apps_script_email_url ausente ou invalido no Vault"
        assert _um(c, "SELECT count(*) FROM net.pedidos") == 0


def test_url_que_nao_e_do_google_e_recusada() -> None:
    with _banco() as c:
        _segredos(c, "https://exemplo.invalid/exec")
        assert _um(c, "SELECT public.fn_email_apps_script_erro_config()") == (
            "segredo apps_script_email_url ausente ou invalido no Vault"
        )
        c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(INATIVO),))
        with pytest.raises(psycopg.errors.RaiseException, match="apps_script_email_url"):
            c.execute("SELECT public.fn_enviar_contato('Nome', 'a@b.co', 'Assunto', 'Mensagem longa')")
        assert _um(c, "SELECT count(*) FROM net.pedidos") == 0


def test_contato_do_app_vai_para_o_dono_com_responder_para() -> None:
    with _banco() as c:
        _segredos(c)
        c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(INATIVO),))
        c.execute("SELECT public.fn_enviar_contato('Fulana', 'fulana@teste.invalid', 'Excluir conta', 'Quero excluir')")
        url, corpo = c.execute("SELECT url, body FROM net.pedidos").fetchone()
        assert url == URL
        assert corpo["para"] == DONO_EMAIL
        assert corpo["responder_para"] == "fulana@teste.invalid"
        assert corpo["assunto"] == "Excluir conta"
        assert "Nome: Fulana" in corpo["texto"]
        assert _um(c, "SELECT count(*) FROM public.contato_envios") == 1

        # E-mail malformado nao derruba o envio: so perde o responder-para.
        c.execute("SELECT public.fn_enviar_contato('Fulana', 'sem-arroba', 'Outro', 'Mensagem')")
        corpo = c.execute("SELECT body FROM net.pedidos ORDER BY id DESC LIMIT 1").fetchone()[0]
        assert "responder_para" not in corpo


def test_contato_do_site_vai_pelo_script_e_mantem_a_armadilha() -> None:
    with _banco() as c:
        _segredos(c)
        args = ("Fulana", "fulana@teste.invalid", "Duvida", "Uma mensagem com mais de dez letras")
        c.execute("SELECT public.fn_enviar_contato_publico(%s, %s, %s, %s, 'robo')", args)
        assert _um(c, "SELECT count(*) FROM net.pedidos") == 0

        c.execute("SELECT public.fn_enviar_contato_publico(%s, %s, %s, %s, NULL)", args)
        url, corpo = c.execute("SELECT url, body FROM net.pedidos").fetchone()
        assert url == URL
        assert corpo["para"] == DONO_EMAIL
        assert corpo["assunto"] == "[Site] Duvida"
        assert corpo["responder_para"] == "fulana@teste.invalid"
        assert corpo["nome_remetente"] == "TrailUp Contato (site)"
        assert _um(c, "SELECT count(*) FROM public.contato_publico_envios") == 1


def test_envio_central_fechado_para_cliente() -> None:
    with _banco() as c:
        for papel in ("anon", "authenticated"):
            assert not _um(
                c,
                "SELECT has_function_privilege(%s, 'public.fn_email_apps_script(text,text,text,text,text,text)', 'EXECUTE')",
                papel,
            )
        assert _um(c, "SELECT has_function_privilege('anon', 'public.fn_enviar_contato_publico(text,text,text,text,text)', 'EXECUTE')")
        assert not _um(c, "SELECT has_function_privilege('anon', 'public.fn_enviar_contato(text,text,text,text)', 'EXECUTE')")


def test_downgrade_volta_para_a_brevo() -> None:
    with _banco() as c:
        for sql in _sql_de(M14, "downgrade"):
            c.execute(sql)
        assert _um(c, "SELECT to_regprocedure('public.fn_email_apps_script(text,text,text,text,text,text)')") is None
        assert _um(c, "SELECT to_regprocedure('public.fn_email_apps_script_aceito(integer,jsonb,text,boolean)')") is None
        for fn in ("fn_enviar_contato", "fn_enviar_contato_publico", "retencao_avisos_email"):
            assert "api.brevo.com" in _um(c, "SELECT prosrc FROM pg_proc WHERE proname = %s", fn), fn
