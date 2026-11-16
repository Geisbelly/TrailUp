"""`20261116_02`: a coleta das respostas do pg_net passa pelo índice de `created`.

A parte sem banco confere a cadeia, os binds e que o trecho trocado existe nas migrations que definem
as três funções. A parte com Docker (`TRAILUP_TEST_DOCKER=1`) roda a troca de verdade sobre as
funções criadas pelas migrations reais, no mesmo esqueleto do e2e do monitor.
"""

from __future__ import annotations

import os

import pytest
from alembic.script import ScriptDirectory
from sqlalchemy import text

from tests.test_e2e_monitor_disponibilidade import VERSOES, _modulo, banco  # noqa: F401 (fixture)
from tests.test_migrations import _offline_alembic_config

M = _modulo("20261116_02_coleta_do_pg_net_por_created.py")

# Onde cada função é definida no repo (a mais recente que contém a junção).
DEFINIDA_EM = {
    "fn_monitor_colher": "20261105_09_monitor_de_disponibilidade.py",
    "fn_monitor_enviar_alertas": "20261105_09_monitor_de_disponibilidade.py",
    "retencao_avisos_email": "20261101_14_email_pelo_apps_script.py",
}


def test_vem_depois_da_20261115_06_e_e_a_unica_cabeca() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())
    assert scripts.get_revision("20261116_02").down_revision == "20261115_06"
    assert len(scripts.get_heads()) == 1


def test_nenhum_bloco_vira_parametro_de_bind() -> None:
    blocos = [M.AGENDAR, M.DESAGENDAR]
    for funcao, de, para in M.TROCAS:
        blocos += [M._troca(funcao, de, para), M._troca(funcao, para, de, desfazer=True)]
    for bloco in blocos:
        assert text(bloco).compile().params == {}


@pytest.mark.parametrize("funcao,de,para", M.TROCAS)
def test_trecho_de_hoje_existe_uma_vez_e_o_novo_so_acrescenta(funcao: str, de: str, para: str) -> None:
    fonte = (VERSOES / DEFINIDA_EM[funcao]).read_text(encoding="utf-8")
    assert fonte.count(de) == 1
    # O trecho novo começa pelo de hoje: só acrescenta o limite, não muda a junção.
    assert para.startswith(de) and "created >=" in para[len(de):]


def test_expurgo_do_cron_guarda_mais_do_que_quem_le_o_historico() -> None:
    # O painel olha 24 h e o monitor, 60 min.
    assert M.DIAS_DE_HISTORICO >= 2
    assert f"interval '{M.DIAS_DE_HISTORICO} days'" in M.AGENDAR


docker = pytest.mark.skipif(
    os.environ.get("TRAILUP_TEST_DOCKER") != "1", reason="requer TRAILUP_TEST_DOCKER=1 e Docker"
)


@pytest.fixture
def banco_com_retencao(request):
    # O `banco` do e2e do monitor: as funções saem das migrations reais.
    c = request.getfixturevalue("banco")
    c.execute("ALTER TABLE public.alunos ADD COLUMN email text")
    c.execute(
        """CREATE FUNCTION public.retencao_config_int(p_chave text, p_padrao integer) RETURNS integer
           LANGUAGE sql STABLE AS $$ SELECT p_padrao $$"""
    )
    c.execute(
        """CREATE TABLE public.retencao_avisos_inatividade (
             aluno_id uuid PRIMARY KEY, avisado_em timestamptz NOT NULL DEFAULT now(),
             exclusao_enfileirada_em timestamptz, email_enviado_em timestamptz, email_request_id bigint,
             email_solicitado_em timestamptz, email_ultimo_erro text, email_tentativas integer NOT NULL DEFAULT 0,
             email_proxima_tentativa_em timestamptz NOT NULL DEFAULT now())"""
    )
    c.execute(_modulo("20261101_14_email_pelo_apps_script.py").AVISO_SQL)
    c.execute("CREATE INDEX _http_response_created_idx ON net._http_response (created)")
    return c


def _definicoes(c) -> dict[str, str]:
    return {
        funcao: c.execute(
            "SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname = %s AND p.pronamespace = 'public'::regnamespace",
            (funcao,),
        ).fetchone()[0]
        for funcao, _, _ in M.TROCAS
    }


def _subir(c) -> None:
    for funcao, de, para in M.TROCAS:
        c.execute(M._troca(funcao, de, para))


def _descer(c) -> None:
    for funcao, de, para in M.TROCAS:
        c.execute(M._troca(funcao, para, de, desfazer=True))


@docker
def test_sobe_de_novo_sem_dobrar_e_desce_para_o_texto_de_antes(banco_com_retencao) -> None:
    c = banco_com_retencao
    antes = _definicoes(c)
    _subir(c)
    depois = _definicoes(c)
    for funcao, _, para in M.TROCAS:
        assert depois[funcao].count(para) == 1
    _subir(c)
    assert _definicoes(c) == depois
    _descer(c)
    assert _definicoes(c) == antes
    _descer(c)
    assert _definicoes(c) == antes


@docker
def test_sem_o_trecho_esperado_falha_alto(banco_com_retencao) -> None:
    import psycopg

    c = banco_com_retencao
    funcao, _, para = M.TROCAS[0]
    with pytest.raises(psycopg.errors.RaiseException, match="trecho esperado"):
        c.execute(M._troca(funcao, "JOIN que não existe", para))


@docker
def test_colhe_as_mesmas_sondas_e_le_as_respostas_pelo_indice(banco_com_retencao) -> None:
    from tests.test_e2e_monitor_disponibilidade import colher, sonda

    c = banco_com_retencao
    _subir(c)
    # Seis horas de respostas antigas, já colhidas: é o que o seq scan lia a cada minuto.
    c.execute(
        """INSERT INTO net._http_response (id, status_code, content, timed_out, created)
           SELECT -g, 200, repeat('x', 700), false, now() - interval '6 hours' + g * interval '1 second'
             FROM generate_series(1, 20000) g"""
    )
    c.execute("ANALYZE net._http_response")
    for ha_min in (2, 1, 0):
        sonda(c, ha_min=ha_min)
    plano = "\n".join(
        r[0]
        for r in c.execute(
            """EXPLAIN SELECT s.id FROM public.monitor_sonda s JOIN net._http_response h ON h.id = s.pedido_id
                 AND h.created >= (SELECT min(p.enviada_em) FROM public.monitor_sonda p WHERE p.colhida_em IS NULL)
                WHERE s.colhida_em IS NULL"""
        ).fetchall()
    )
    assert "_http_response_created_idx" in plano and "Seq Scan on _http_response" not in plano
    assert colher(c) == 3
    assert c.execute("SELECT count(*) FROM public.monitor_sonda WHERE colhida_em IS NULL").fetchone()[0] == 0
    # Sem pendente, o min é NULL e nada é colhido de novo.
    assert colher(c) == 0


@docker
def test_alerta_e_aviso_de_inatividade_continuam_confirmando_o_envio(banco_com_retencao) -> None:
    c = banco_com_retencao
    _subir(c)
    c.execute("SELECT public.fn_monitor_alertar('k', 'assunto', 'texto')")
    assert c.execute("SELECT public.fn_monitor_enviar_alertas()").fetchone()[0] == 1
    pedido, = c.execute("SELECT pedido_id FROM public.monitor_alerta").fetchone()
    c.execute(
        """INSERT INTO net._http_response (id, status_code, content, timed_out) VALUES (%s, 200, '{"ok":true}', false)""",
        (pedido,),
    )
    c.execute("SELECT public.fn_monitor_enviar_alertas()")
    assert c.execute("SELECT enviado_em IS NOT NULL, erro FROM public.monitor_alerta").fetchone() == (True, None)

    aluno = "00000000-0000-0000-0000-000000000001"
    c.execute(
        """INSERT INTO public.retencao_avisos_inatividade (aluno_id, email_request_id, email_solicitado_em)
           VALUES (%s, 4242, now() - interval '1 minute')""",
        (aluno,),
    )
    c.execute(
        """INSERT INTO net._http_response (id, status_code, content, timed_out) VALUES (4242, 200, '{"ok":true}', false)"""
    )
    c.execute("SELECT public.retencao_avisos_email(true)")
    assert c.execute(
        "SELECT email_enviado_em IS NOT NULL, email_request_id FROM public.retencao_avisos_inatividade"
    ).fetchone() == (True, None)
