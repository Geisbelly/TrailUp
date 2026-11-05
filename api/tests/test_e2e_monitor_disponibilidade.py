"""Ponta a ponta da `20261105_09` e `_10` num Postgres descartável: máquina de estados, e-mail e posse.

Só com `TRAILUP_TEST_DOCKER=1`. Roda o SQL das migrations de verdade, incluindo `fn_email_apps_script` e
`fn_professor_notificar`. O que é esqueleto: `auth`, `vault` e `net`. O `net` imita o que o `pg_net` grava em
`net._http_response`; o pedido real ao `pg_net` só se confere em produção.
"""

from __future__ import annotations

import importlib.util
import json
import os
import secrets
import subprocess
import time
import uuid
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("TRAILUP_TEST_DOCKER") != "1", reason="requer TRAILUP_TEST_DOCKER=1 e Docker"
)

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
DONO = str(uuid.uuid4())
ALUNO = str(uuid.uuid4())
EMAIL_DONO = "dono@example.test"


def _modulo(nome: str):
    caminho = VERSOES / nome
    spec = importlib.util.spec_from_file_location(f"_m_{caminho.stem}", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


ESQUELETO = f"""
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{{}}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt() ->> 'sub')::uuid $$;
CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets (name text PRIMARY KEY, decrypted_secret text);
INSERT INTO vault.decrypted_secrets VALUES
  ('apps_script_email_url', 'https://script.google.com/macros/s/x/exec'), ('apps_script_email_segredo', 's');
CREATE SCHEMA net;
CREATE SEQUENCE net.pedido;
CREATE TABLE net.pedidos (id bigint PRIMARY KEY, url text, corpo jsonb);
CREATE TABLE net._http_response (
  id bigint, status_code integer, content_type text, headers jsonb, content text,
  timed_out boolean, error_msg text, created timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION net.http_get(url text, params jsonb DEFAULT '{{}}', headers jsonb DEFAULT '{{}}',
                             timeout_milliseconds integer DEFAULT 5000)
RETURNS bigint LANGUAGE sql AS
  $$ INSERT INTO net.pedidos (id, url) VALUES (nextval('net.pedido'), url) RETURNING id $$;
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{{}}', params jsonb DEFAULT '{{}}',
                              headers jsonb DEFAULT '{{}}', timeout_milliseconds integer DEFAULT 5000)
RETURNS bigint LANGUAGE sql AS
  $$ INSERT INTO net.pedidos (id, url, corpo) VALUES (nextval('net.pedido'), url, body) RETURNING id $$;

CREATE TABLE public.app_config (chave text PRIMARY KEY, valor text, publico boolean NOT NULL DEFAULT false);
INSERT INTO public.app_config VALUES ('dono_email', '{EMAIL_DONO}', false);
CREATE FUNCTION public.app_e_dono() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = lower((SELECT valor FROM public.app_config WHERE chave = 'dono_email'))
$$;
CREATE TABLE public.retencao_politica (tabela text, acao text, PRIMARY KEY (tabela, acao), coluna_aluno text, coluna_tempo text, dias integer, ordem integer, categoria text, motivo text);
CREATE TABLE public.professor (id uuid PRIMARY KEY);
CREATE TABLE public.classe (id bigint PRIMARY KEY);
INSERT INTO auth.users VALUES ('{DONO}', '{EMAIL_DONO}');
INSERT INTO public.professor VALUES ('{DONO}');
CREATE TABLE public.alunos (id uuid PRIMARY KEY, nome text);
INSERT INTO public.alunos VALUES ('{ALUNO}', 'Fulana');
CREATE TABLE public.classe_aluno (classe_id bigint, aluno_id uuid);
INSERT INTO public.classe_aluno VALUES (1, '{ALUNO}');
CREATE TABLE public.aluno_sessoes_app (
  id bigserial PRIMARY KEY, aluno_id uuid, plataforma text NOT NULL DEFAULT 'android',
  iniciada_em timestamptz NOT NULL DEFAULT now(), encerrada_em timestamptz);
CREATE TABLE public.aluno_atividade_diaria (
  aluno_id uuid, dia date, tempo_uso_seg integer NOT NULL DEFAULT 0, ultimo_acesso_em timestamptz);
CREATE TABLE public.telemetria_lotes (
  id bigserial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), via text, fallback_motivo text,
  payload jsonb NOT NULL DEFAULT '{{}}');
CREATE TABLE public.ia_uso_llm (
  id bigserial PRIMARY KEY, criado_em timestamptz NOT NULL DEFAULT now(), prompt text, fim text,
  latencia_ms integer, tokens_entrada integer, tokens_saida integer);
"""


@pytest.fixture
def banco():
    import psycopg

    nome = f"trailup-monitor-test-{secrets.token_hex(5)}"
    senha = secrets.token_hex(16)
    try:
        subprocess.run(
            ["docker", "run", "--detach", "--name", nome, "--tmpfs", "/var/lib/postgresql/data",
             "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD", "postgres:17.6-alpine"],
            env={**os.environ, "POSTGRES_PASSWORD": senha}, check=True, capture_output=True,
        )
        porta = subprocess.check_output(["docker", "port", nome, "5432/tcp"], text=True).strip().rsplit(":", 1)[1]
        dsn = f"postgresql://postgres:{senha}@127.0.0.1:{porta}/postgres"
        for tentativa in range(100):
            try:
                conexao = psycopg.connect(dsn, autocommit=True, connect_timeout=2)
                break
            except psycopg.OperationalError:
                if tentativa == 99:
                    raise
                time.sleep(0.2)
        n17 = _modulo("20261102_17_professor_notificacoes.py")
        n23 = _modulo("20261102_23_alerta_do_dono_do_painel.py")
        email = _modulo("20261101_14_email_pelo_apps_script.py")
        m09 = _modulo("20261105_09_monitor_de_disponibilidade.py")
        m10 = _modulo("20261105_10_painel_disponibilidade.py")
        conexao.execute(ESQUELETO)
        conexao.execute(n17.TABELA)
        conexao.execute(n17.NOTIFICAR)
        conexao.execute(n23.TIPOS)
        conexao.execute(email.ENVIO_SQL)
        cfg = m09._config()
        conexao.execute(m09.TABELAS)
        conexao.execute(m09.ALVOS)
        conexao.execute(m09.CONFIG_SEED.replace("__CONFIG__", cfg))
        conexao.execute(m09.PURAS)
        conexao.execute(m09.NUCLEO.replace("__CONFIG__", cfg))
        conexao.execute(m10.TABELA)
        conexao.execute(m10.PAINEL)
        yield conexao
        conexao.close()
    finally:
        subprocess.run(["docker", "rm", "--force", nome], capture_output=True, check=False)


def sonda(c, alvo="api", status=200, conteudo='{"status":"ok"}', timed_out=False, ha_min=0, latencia_ms=200, em_aula=False):
    """Uma sonda já respondida, com o que o `pg_net` deixaria em `net._http_response`."""
    pedido = c.execute("SELECT nextval('net.pedido')").fetchone()[0]
    c.execute(
        "INSERT INTO public.monitor_sonda (alvo_id, pedido_id, enviada_em, em_aula) VALUES (%s, %s, now() - make_interval(mins => %s), %s)",
        (alvo, pedido, ha_min, em_aula),
    )
    c.execute(
        """INSERT INTO net._http_response (id, status_code, content, timed_out, created)
           VALUES (%s, %s, %s, %s, now() - make_interval(mins => %s) + make_interval(secs => %s))""",
        (pedido, None if timed_out else status, conteudo, timed_out, ha_min, latencia_ms / 1000),
    )
    return pedido


def colher(c):
    return c.execute("SELECT public.fn_monitor_colher()").fetchone()[0]


def alvo(c, id_="api"):
    return c.execute(
        "SELECT estado, falhas_seguidas, ultima_versao FROM public.monitor_alvo WHERE id = %s", (id_,)
    ).fetchone()


def incidentes(c, tipo="queda"):
    return c.execute(
        "SELECT alvo_id, inicio, fim, motivo, avisado FROM public.monitor_incidente WHERE tipo = %s ORDER BY id", (tipo,)
    ).fetchall()


def alertas(c):
    return [r[0] for r in c.execute("SELECT assunto FROM public.monitor_alerta ORDER BY id").fetchall()]


def derrubar(c, ha_min=10):
    for i in range(3):
        sonda(c, status=None, timed_out=True, ha_min=ha_min - i)
    colher(c)


def test_tres_falhas_abrem_queda_na_primeira_sonda_ruim_e_avisam_email_e_sino(banco):
    c = banco
    sonda(c, ha_min=11)
    colher(c)
    derrubar(c)
    assert alvo(c)[0] == "queda"
    (inc,) = incidentes(c)
    primeira = c.execute("SELECT min(enviada_em) FROM public.monitor_sonda WHERE ok IS FALSE").fetchone()[0]
    assert inc[1] == primeira and inc[2] is None and inc[3] == "timeout"
    assert alertas(c) == ["[TrailUp] API fora do ar"]
    assert c.execute(
        "SELECT count(*) FROM public.professor_notificacoes WHERE dedupe_key LIKE 'mon:%'"
    ).fetchone()[0] == 1


def test_falha_solta_nao_abre_e_um_ok_no_meio_da_queda_nao_fecha(banco):
    c = banco
    sonda(c, status=500, ha_min=20)
    sonda(c, status=500, ha_min=19)
    sonda(c, ha_min=18)
    colher(c)
    assert incidentes(c) == []
    derrubar(c)
    sonda(c, ha_min=6)
    sonda(c, status=502, ha_min=5)
    colher(c)
    assert incidentes(c)[0][2] is None
    sonda(c, ha_min=4)
    sonda(c, ha_min=3)
    colher(c)
    assert alvo(c)[0] == "ok"
    fim = incidentes(c)[0][2]
    primeiro_ok = c.execute(
        "SELECT enviada_em FROM public.monitor_sonda WHERE ok ORDER BY enviada_em DESC OFFSET 1 LIMIT 1"
    ).fetchone()[0]
    assert fim == primeiro_ok
    assert alertas(c)[-1] == "[TrailUp] API voltou"


def test_sonda_sem_resposta_nao_e_falha(banco):
    c = banco
    for ha_min in (9, 8, 7, 6):
        c.execute(
            "INSERT INTO public.monitor_sonda (alvo_id, pedido_id, enviada_em) VALUES ('api', 999, now() - make_interval(mins => %s))",
            (ha_min,),
        )
    colher(c)
    assert alvo(c)[:2] == ("sem_dado", 0)
    assert c.execute(
        "SELECT count(*) FROM public.monitor_sonda WHERE ok IS NULL AND motivo = 'sem_resposta'"
    ).fetchone()[0] == 4


def test_corpo_errado_com_200_e_falha_e_a_versao_e_lida(banco):
    c = banco
    assert c.execute("SELECT public.fn_monitor_classificar(200, false, 'pagina de erro', 'build_commit')").fetchone()[0] == "corpo"
    sonda(c, conteudo='{"status":"ok","details":{"build_commit":"abcdef1234567890"}}')
    colher(c)
    assert alvo(c) == ("ok", 0, "abcdef123456")


def test_instabilidade_abre_com_falhas_soltas_e_silencia_as_quedas(banco):
    c = banco
    for i, status in enumerate([500, 200, 500, 200, 500, 200]):
        sonda(c, status=status, conteudo='{"status":"ok"}', ha_min=20 - i)
    colher(c)
    c.execute("SELECT public.fn_monitor_varrer_alvos()")
    assert len(incidentes(c, "instabilidade")) == 1
    derrubar(c, ha_min=5)
    assert incidentes(c)[0][4] is False
    assert alertas(c) == ["[TrailUp] API instável"]


def test_lentidao_precisa_de_minimo_de_sondas(banco):
    c = banco
    for i in range(5):
        sonda(c, ha_min=i, latencia_ms=9000)
    colher(c)
    c.execute("SELECT public.fn_monitor_varrer_alvos()")
    assert incidentes(c, "lentidao") == []
    for i in range(5, 10):
        sonda(c, ha_min=i, latencia_ms=9000)
    colher(c)
    c.execute("SELECT public.fn_monitor_varrer_alvos()")
    assert len(incidentes(c, "lentidao")) == 1


def test_email_so_conta_com_ok_true_e_tenta_de_novo(banco):
    c = banco
    derrubar(c)
    assert c.execute("SELECT public.fn_monitor_enviar_alertas()").fetchone()[0] == 1
    pedido, = c.execute("SELECT pedido_id FROM public.monitor_alerta").fetchone()
    corpo = c.execute("SELECT corpo FROM net.pedidos WHERE id = %s", (pedido,)).fetchone()[0]
    assert corpo["para"] == EMAIL_DONO and "fora do ar" in corpo["assunto"]
    # Script que levantou: 200 com a página de erro.
    c.execute("INSERT INTO net._http_response (id, status_code, content, timed_out) VALUES (%s, 200, '<html>Error</html>', false)", (pedido,))
    c.execute("SELECT public.fn_monitor_enviar_alertas()")
    enviado, erro, proxima = c.execute(
        "SELECT enviado_em, erro, proxima_tentativa > now() FROM public.monitor_alerta"
    ).fetchone()
    assert enviado is None and erro == "HTTP 200" and proxima
    c.execute("UPDATE public.monitor_alerta SET proxima_tentativa = now()")
    assert c.execute("SELECT public.fn_monitor_enviar_alertas()").fetchone()[0] == 1
    pedido, = c.execute("SELECT pedido_id FROM public.monitor_alerta").fetchone()
    c.execute("""INSERT INTO net._http_response (id, status_code, content, timed_out) VALUES (%s, 200, '{"ok":true}', false)""", (pedido,))
    c.execute("SELECT public.fn_monitor_enviar_alertas()")
    assert c.execute("SELECT enviado_em IS NOT NULL, erro FROM public.monitor_alerta").fetchone() == (True, None)


def test_teto_diario_segura_o_envio(banco):
    c = banco
    c.execute("""UPDATE public.app_config SET valor = '{"emails_por_dia": 2}' WHERE chave = 'monitor_config'""")
    for i in range(4):
        c.execute("SELECT public.fn_monitor_alertar(%s, 'a', 'b')", (f"k{i}",))
    assert c.execute("SELECT public.fn_monitor_enviar_alertas()").fetchone()[0] == 2
    assert c.execute("SELECT public.fn_monitor_enviar_alertas()").fetchone()[0] == 0


def test_app_que_nao_alcanca_a_api_abre_degradacao_e_pouco_lote_e_sem_dado(banco):
    c = banco
    for _ in range(4):
        c.execute("INSERT INTO public.telemetria_lotes (via, fallback_motivo) VALUES ('direta', 'timeout')")
    c.execute("SELECT public.fn_monitor_varrer_sinais(false)")
    assert incidentes(c, "degradacao") == []
    for _ in range(8):
        c.execute("INSERT INTO public.telemetria_lotes (via, fallback_motivo) VALUES ('direta', 'rede')")
    c.execute("SELECT public.fn_monitor_varrer_sinais(false)")
    assert [i[0] for i in incidentes(c, "degradacao")] == ["app_api"]
    c.execute("DELETE FROM public.telemetria_lotes")
    c.execute("SELECT public.fn_monitor_varrer_sinais(false)")
    assert incidentes(c, "degradacao")[0][2] is None  # sem dado não fecha
    for _ in range(12):
        c.execute("INSERT INTO public.telemetria_lotes (via) VALUES ('api')")
    c.execute("SELECT public.fn_monitor_varrer_sinais(true)")
    assert incidentes(c, "degradacao")[0][2] is not None


def test_gatilho_do_sino_vira_email_sem_duplicar_o_do_monitor(banco):
    c = banco
    cod = _modulo("20261105_09_monitor_de_disponibilidade.py").NUCLEO
    assert "trg_monitor_gatilho_para_email" in cod
    c.execute(
        "SELECT public.fn_professor_notificar(%s, NULL, 'gatilho_tecnico', 'Fila parada', 'detalhe', 'tecnico', 'tec:fila:2026-11-05')",
        (DONO,),
    )
    assert alertas(c) == ["[TrailUp] Fila parada"]
    derrubar(c)
    assert alertas(c) == ["[TrailUp] Fila parada", "[TrailUp] API fora do ar"]


SEMPRE_AULA = '{"aula": {"dias": [1,2,3,4,5,6,7], "inicio": "00:00", "fim": "23:59", "sem_aula": []}}'
NUNCA_AULA = '{"aula": {"dias": [], "inicio": "00:00", "fim": "23:59", "sem_aula": []}}'


def configurar(c, valor):
    c.execute("UPDATE public.app_config SET valor = %s WHERE chave = 'monitor_config'", (valor,))


def test_em_aula_toda_sonda_roda_a_cada_minuto_e_fora_dela_a_cada_cinco(banco):
    c = banco
    configurar(c, SEMPRE_AULA)
    assert c.execute("SELECT public.fn_monitor_tick()").fetchone()[0]["disparadas"] == 3
    assert c.execute("SELECT public.fn_monitor_tick()").fetchone()[0]["disparadas"] == 0
    assert c.execute("SELECT bool_and(em_aula) FROM public.monitor_sonda").fetchone()[0] is True
    c.execute("UPDATE public.monitor_alvo SET ultima_sonda_em = now() - interval '2 minutes'")
    assert c.execute("SELECT public.fn_monitor_disparar()").fetchone()[0] == 3
    configurar(c, NUNCA_AULA)
    c.execute("UPDATE public.monitor_alvo SET ultima_sonda_em = now() - interval '2 minutes'")
    assert c.execute("SELECT public.fn_monitor_disparar()").fetchone()[0] == 1  # só a API
    assert c.execute(
        "SELECT em_aula FROM public.monitor_sonda ORDER BY id DESC LIMIT 1"
    ).fetchone()[0] is False


def test_janela_de_aula_respeita_fuso_dia_e_periodo_sem_aula(banco):
    c = banco
    aula = json.dumps({"dias": [1, 2, 3, 4, 5], "inicio": "07:00", "fim": "22:00", "sem_aula": [{"de": "2026-11-16", "ate": "2026-11-20"}]})

    def em(iso):
        return c.execute("SELECT public.fn_monitor_em_aula(%s::timestamptz, %s::jsonb)", (iso, aula)).fetchone()[0]

    assert em("2026-11-05T10:00:00Z") is True  # quinta, 07:00 em Brasília
    assert em("2026-11-05T09:59:00Z") is False
    assert em("2026-11-06T01:00:00Z") is False  # quinta, 22:00 em Brasília: o fim não entra
    assert em("2026-11-07T15:00:00Z") is False  # sábado
    assert em("2026-11-17T15:00:00Z") is False  # período sem aula
    assert c.execute("SELECT public.fn_monitor_em_aula(now(), '{\"inicio\": \"x\", \"dias\": [1,2,3,4,5,6,7]}')").fetchone()[0] is False


def test_minutos_de_aula_cortam_nas_pontas_e_pulam_o_fim_de_semana(banco):
    c = banco
    aula = json.dumps({"dias": [1, 2, 3, 4, 5], "inicio": "07:00", "fim": "22:00", "sem_aula": []})
    # Da sexta 21:00 à segunda 08:00 em Brasília: 60 min na sexta e 60 na segunda.
    assert c.execute(
        "SELECT public.fn_monitor_minutos_aula('2026-11-07T00:00:00Z', '2026-11-09T11:00:00Z', %s::jsonb)", (aula,)
    ).fetchone()[0] == 120


def _como(c, claims):
    c.execute("BEGIN")
    c.execute("SET LOCAL ROLE authenticated")
    c.execute("SELECT set_config('request.jwt.claims', %s, true)", (json.dumps(claims),))


def test_so_o_dono_le_e_cliente_nao_toca_as_tabelas(banco):
    import psycopg

    c = banco
    for sql in (
        "SELECT public.painel_disponibilidade(24)",
        "SELECT public.painel_acessos_alunos(30, true)",
        "SELECT * FROM public.monitor_alerta",
        "SELECT * FROM public.monitor_sonda",
        "SELECT public.fn_monitor_tick()",
    ):
        _como(c, {"sub": ALUNO, "email": "aluno@example.test", "role": "authenticated"})
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute(sql)
        c.execute("ROLLBACK")


def test_painel_mostra_sem_dado_sem_sonda_e_nao_expoe_aluno(banco):
    c = banco
    c.execute("INSERT INTO public.aluno_sessoes_app (aluno_id, iniciada_em, encerrada_em) VALUES (%s, now() - interval '3 hours', now() - interval '170 minutes')", (ALUNO,))
    c.execute("INSERT INTO public.aluno_sessoes_app (aluno_id, iniciada_em) VALUES (%s, now() - interval '160 minutes')", (ALUNO,))
    c.execute("INSERT INTO public.aluno_sessoes_app (aluno_id, iniciada_em) VALUES (%s, now() - interval '30 minutes')", (ALUNO,))
    c.execute("INSERT INTO public.aluno_atividade_diaria VALUES (%s, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 600, now())", (ALUNO,))
    _como(c, {"sub": DONO, "email": EMAIL_DONO, "role": "authenticated"})
    painel = c.execute("SELECT public.painel_disponibilidade(24)").fetchone()[0]
    fechado = c.execute("SELECT public.painel_acessos_alunos(30, false)").fetchone()[0]
    aberto = c.execute("SELECT public.painel_acessos_alunos(30, true)").fetchone()[0]
    c.execute("COMMIT")
    assert {a["estado"] for a in painel["alvos"]} == {"sem_dado"}
    assert all(a["disponibilidade_pct"] is None for a in painel["alvos"])
    assert painel["acessos"]["acessos_30d"] == 2  # as duas primeiras, a 10 min, são um acesso só
    assert painel["acessos"]["ativos_hoje"] == 1 and painel["acessos"]["matriculados"] == 1
    assert ALUNO not in json.dumps(painel)
    linha = fechado["alunos"][0]
    assert "nome" not in linha and ALUNO not in json.dumps(fechado)
    assert linha["acessos"] == 2 and linha["dias_com_acesso"] == 1 and linha["minutos"] == 10
    assert aberto["alunos"][0]["nome"] == "Fulana"
    assert c.execute("SELECT count(*) FROM public.monitor_consulta").fetchone()[0] == 1


def test_meta_conta_so_a_aula_e_o_orcamento_sai_dos_minutos_de_aula(banco):
    c = banco
    configurar(c, SEMPRE_AULA)
    for i in range(9):
        sonda(c, ha_min=i + 1, em_aula=True)
    sonda(c, status=500, ha_min=1000, em_aula=True)
    sonda(c, status=500, ha_min=20)  # fora de aula: só o 24x7 sente
    colher(c)
    c.execute("UPDATE public.monitor_alvo SET ultima_sonda_em = now() WHERE id = 'api'")
    _como(c, {"sub": DONO, "email": EMAIL_DONO, "role": "authenticated"})
    painel = c.execute("SELECT public.painel_disponibilidade(24)").fetchone()[0]
    c.execute("COMMIT")
    api = next(a for a in painel["alvos"] if a["id"] == "api")
    assert api["medidas_aula"] == 10 and api["disponibilidade_aula_pct"] == 90 and api["minutos_fora_aula"] == 1
    assert 990 <= api["minutos_aula"] <= 1000
    assert api["orcamento_aula_min"] == 5  # 0,5% de ~1.000 min
    assert api["medidas_30d"] == 11 and api["estado"] == "ok"
    assert painel["aula"]["agora"] is True and painel["aula"]["slo_janela_dias"] == 28


def test_sem_sonda_em_aula_nao_vira_cem_por_cento(banco):
    c = banco
    sonda(c, ha_min=5)
    colher(c)
    _como(c, {"sub": DONO, "email": EMAIL_DONO, "role": "authenticated"})
    painel = c.execute("SELECT public.painel_disponibilidade(24)").fetchone()[0]
    c.execute("COMMIT")
    api = next(a for a in painel["alvos"] if a["id"] == "api")
    assert api["disponibilidade_aula_pct"] is None and api["medidas_aula"] == 0
