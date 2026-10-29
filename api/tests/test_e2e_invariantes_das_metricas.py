"""Ponta a ponta da `20261029_03` (invariantes I01…I20, o executor e o `pg_cron`).

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. Cada teste cria um
banco descartável com o ESQUELETO do schema public da produção, reproduz os privilégios que o Supabase
dá por padrão (em tabela E em função: toda função nova de `public` nasce com EXECUTE para
`anon`/`authenticated`, e sem isso o teste de permissão passaria por acidente) e aplica, em ordem, o
`upgrade()` da `20261029_01` (`via`/`fallback_motivo`, que a I18 lê), da `20261029_02` (catálogo,
resultado, amostra) e da `20261029_03`.

O esqueleto **não** tem `trailup_progresso_percurso`, `trailup_tempo_sessao_min`, `fn_app_config_int`
nem as `vw_metricas_*` (schema não versionado). É de propósito: I05, I06, I10 e I16 estouram aqui, e
é isso que prova que invariante que estoura vira `erro` sem parar a rodada.

Local não tem `pg_cron`: o executor é chamado direto, e a migration tem de passar sem a extensão.
O papel de cliente é de verdade (`SET LOCAL ROLE authenticated` + claims).

Dados sintéticos. Recusa banco hospedado.
"""

from __future__ import annotations

import json
import os
import uuid
from contextlib import contextmanager

import pytest

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e das invariantes recusa banco hospedado: use um Postgres local")

from tests import test_e2e_guilda_mantem_quem_saiu_da_turma as base  # noqa: E402

M_VIA = base._modulo("20261029_01_lote_diz_por_onde_chegou.py")
M_CATALOGO = base._modulo("20261029_02_catalogo_de_metricas.py")
M_INV = base._modulo("20261029_03_invariantes_das_metricas.py")

ALUNO = uuid.UUID(int=21)
CLASSE, TOPICO, CONTEUDO, ATIVIDADE, QUESTAO, CONQUISTA = 1, 10, 100, 200, 300, 5
S_FECHADA, S_ABERTA = uuid.UUID(int=501), uuid.UUID(int=502)
TODAS = [f"I{n:02d}" for n in range(1, 21)]

# O que passa num banco semeado coerente, mesmo sem as funções/views não versionadas.
PASSAM_NO_LIMPO = ["I01", "I02", "I03", "I04", "I07", "I08", "I12", "I13", "I17", "I18", "I19", "I20"]

GRANTS_SUPABASE = """
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
"""


@contextmanager
def _banco():
    nome = f"tu_inv_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(base.DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(base._dsn_para(nome), autocommit=True) as c:
            c.execute(base.PAPEIS)
            c.execute(GRANTS_SUPABASE)
            c.execute(base.ESQUELETO.read_text(encoding="utf-8"))
            for modulo in (M_VIA, M_CATALOGO, M_INV):
                for sql in base._sql_de(modulo, "upgrade"):
                    c.execute(sql)
            yield c
    finally:
        with psycopg.connect(base.DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


@contextmanager
def _sem_fk(c):
    """Grava linha que a FK do esqueleto recusaria (o estado que a produção tem e a invariante caça)."""
    c.execute("SET session_replication_role = replica")
    try:
        yield
    finally:
        c.execute("SET session_replication_role = DEFAULT")


def _semeia_coerente(c) -> None:
    """Um aluno, uma turma, um tópico com conteúdo/atividade/questão, telemetria e pontos coerentes."""
    c.execute(
        f"""
        INSERT INTO auth.users (id, email) VALUES ('{ALUNO}', 'a@exemplo.test');
        INSERT INTO public.alunos (id, nome, email) VALUES ('{ALUNO}', 'Aluno', 'a@exemplo.test');
        INSERT INTO public.classe (id, descricao) VALUES ({CLASSE}, 'Turma');
        INSERT INTO public.topicos (id, classe_id, nome) VALUES ({TOPICO}, {CLASSE}, 'Tópico');
        INSERT INTO public.conteudos (id, topico_id, titulo, tipo) VALUES ({CONTEUDO}, {TOPICO}, 'C', 'texto');
        INSERT INTO public.atividades (id, topico_id, titulo) VALUES ({ATIVIDADE}, {TOPICO}, 'A');
        INSERT INTO public.questoes (id, atividade_id, enunciado) VALUES ({QUESTAO}, {ATIVIDADE}, 'Q?');
        INSERT INTO public.classe_aluno (classe_id, aluno_id, "tempoGastoMin") VALUES ({CLASSE}, '{ALUNO}', 12.5);
        INSERT INTO public.topico_aluno (aluno_id, topico_id, status, percentual_concluido, tempo_gasto_min)
          VALUES ('{ALUNO}', {TOPICO}, 'em andamento', 50, 12.5);
        INSERT INTO public.questao_aluno (aluno_id, questao_id, atividade_id, resposta)
          VALUES ('{ALUNO}', {QUESTAO}, {ATIVIDADE}, 'a');
        INSERT INTO public.conquistas (id, nome) VALUES ({CONQUISTA}, 'Primeira');
        INSERT INTO public.conquistas_aluno (aluno_id, conquista_id) VALUES ('{ALUNO}', {CONQUISTA});
        INSERT INTO public.eventos_aluno (tipo, referencia, valor, aluno_id, classe_id) VALUES
          ('conteudo_concluido', 'conteudo:{CONTEUDO}', 10, '{ALUNO}', {CLASSE}),
          ('conquista_desbloqueada', 'conquista:{CONQUISTA}', 5, '{ALUNO}', {CLASSE});
        INSERT INTO public.telemetria_sessoes (id, aluno_id, classe_id, started_at, ended_at) VALUES
          ('{S_FECHADA}', '{ALUNO}', {CLASSE}, now() - interval '2 hours', now() - interval '90 minutes'),
          ('{S_ABERTA}', '{ALUNO}', {CLASSE}, now() - interval '10 minutes', NULL);
        """
    )
    # sessão fechada: intervalo e depois o fim; sessão aberta: só intervalo (ainda em uso)
    _lote(c, uuid.UUID(int=601), S_FECHADA, "interval", minutos=110)
    _lote(c, uuid.UUID(int=602), S_FECHADA, "session_end", minutos=90)
    _lote(c, uuid.UUID(int=603), S_ABERTA, "interval", minutos=5)
    # via direta com motivo: build novo, o que a I18 aceita
    _lote(c, uuid.UUID(int=604), S_ABERTA, "interval", minutos=4, via="direta", motivo="rede")
    c.execute(
        f"""
        INSERT INTO public.telemetria_time_metric_entries
          (lote_id, sessao_id, aluno_id, classe_id, topico_id, conteudo_id, scope, entry_key,
           dwell_sec, active_sec, idle_sec, captured_at)
        VALUES
          ('{uuid.UUID(int=601)}', '{S_FECHADA}', '{ALUNO}', {CLASSE}, {TOPICO}, NULL, 'topic', 't', 40, 30, 10, now()),
          ('{uuid.UUID(int=601)}', '{S_FECHADA}', '{ALUNO}', {CLASSE}, {TOPICO}, {CONTEUDO}, 'content', 'c', 25, 20, 5, now());
        """
    )


def _lote(c, lote: uuid.UUID, sessao: uuid.UUID, flush: str, *, minutos: float, analisado: bool = True,
          via: str | None = None, motivo: str | None = None) -> None:
    c.execute(
        """
        INSERT INTO public.telemetria_lotes
          (id, sessao_id, aluno_id, classe_id, screen_name, route_name, flush_reason, captured_at,
           study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count, scroll_distance_px,
           max_depth_px, analysis_ciclo_id, payload, created_at, via, fallback_motivo)
        VALUES (%s, %s, %s, %s, 'Topico', 'topico', %s, now() - make_interval(secs => %s),
                60, 60, 50, 10, 3, 0, 0, %s, '{}'::jsonb, now() - make_interval(secs => %s), %s, %s)
        """,
        (lote, sessao, ALUNO, CLASSE, flush, minutos * 60, "ciclo" if analisado else None, minutos * 60, via, motivo),
    )


def _rodar(c) -> dict:
    return c.execute("SELECT public.fn_auditoria_metricas_rodar()").fetchone()[0]


def _resultado(c) -> dict[str, tuple[bool, int | None, str | None]]:
    """A última rodada de cada invariante: (ok, linhas, erro)."""
    return {
        inv: (ok, linhas, erro)
        for inv, ok, linhas, erro in c.execute(
            """
            SELECT DISTINCT ON (invariante) invariante, ok, linhas, erro
              FROM public.metricas_invariante_resultado
             ORDER BY invariante, rodado_em DESC, id DESC
            """
        ).fetchall()
    }


def _amostra(c, inv: str) -> list[str] | None:
    row = c.execute(
        "SELECT ids FROM public.metricas_invariante_amostra WHERE invariante = %s ORDER BY rodado_em DESC LIMIT 1",
        (inv,),
    ).fetchone()
    return row[0] if row else None


def _como_cliente(c, papel: str = "authenticated") -> None:
    c.execute(f"SET LOCAL ROLE {papel}")
    claims = json.dumps({"sub": str(ALUNO), "role": papel})
    c.execute("SELECT set_config('request.jwt.claims', %s, true)", (claims,))


def test_banco_limpo_passa_tudo_que_tem_dependencia():
    with _banco() as c:
        _semeia_coerente(c)
        resumo = _rodar(c)
        res = _resultado(c)

        assert resumo["rodadas"] == 20
        assert sorted(res) == TODAS  # uma linha para cada uma, inclusive as que estouraram
        for inv in PASSAM_NO_LIMPO:
            assert res[inv] == (True, 0, None), (inv, res[inv])
            assert inv not in resumo["falharam"] and inv not in resumo["erros"]
            assert _amostra(c, inv) is None  # passou: nada para investigar
        # controle de que a semente exercita as regras: as linhas existem e a I18 viu a via direta
        assert c.execute("SELECT count(*) FROM public.telemetria_lotes WHERE via = 'direta'").fetchone()[0] == 1
        assert c.execute("SELECT count(*) FROM public.telemetria_lotes WHERE via = 'api'").fetchone()[0] == 3
        # todas as linhas da rodada levam o mesmo instante
        assert c.execute("SELECT count(DISTINCT rodado_em) FROM public.metricas_invariante_resultado").fetchone()[0] == 1


def test_violacao_semeada_reprova_e_amostra():
    with _banco() as c:
        _semeia_coerente(c)
        with _sem_fk(c):
            evento = c.execute(
                "INSERT INTO public.eventos_aluno (tipo, referencia, valor, aluno_id, classe_id) "
                "VALUES ('conteudo_concluido', 'conteudo:1', 10, %s, 999) RETURNING id",
                (ALUNO,),
            ).fetchone()[0]
        resumo = _rodar(c)

        assert _resultado(c)["I08"] == (False, 1, None)
        assert _amostra(c, "I08") == [str(evento)]
        assert "I08" in resumo["falharam"]
        assert "I08" not in resumo["erros"]
        # a disponibilidade enxerga: métrica que depende da I08 fica em revisão
        motivo = c.execute(
            "SELECT motivo FROM public.vw_metricas_disponibilidade WHERE chave = 'aluno.sequencia'"
        ).fetchone()[0]
        assert motivo == "invariante_falhou:I08"


def test_amostra_guarda_ate_20_ids_mas_conta_todas():
    with _banco() as c:
        _semeia_coerente(c)
        with _sem_fk(c):
            for _ in range(25):
                c.execute(
                    "INSERT INTO public.eventos_aluno (tipo, valor, aluno_id, classe_id) VALUES ('x', 1, %s, 999)",
                    (ALUNO,),
                )
        _rodar(c)

        assert _resultado(c)["I08"] == (False, 25, None)
        ids = _amostra(c, "I08")
        assert len(ids) == 20
        assert ids == sorted(ids)  # ordem estável entre rodadas


def test_funcao_ausente_vira_erro_e_nao_para_a_rodada():
    with _banco() as c:
        _semeia_coerente(c)
        assert c.execute(
            "SELECT count(*) FROM pg_proc WHERE proname = 'trailup_progresso_percurso'"
        ).fetchone()[0] == 0
        resumo = _rodar(c)
        res = _resultado(c)

        ok, linhas, erro = res["I05"]
        assert ok is False and linhas is None
        assert erro.startswith("42883: ")  # undefined_function
        assert "trailup_progresso_percurso" in erro
        # o erro fica enxuto (authenticated nem o lê, R10): não leva id de aluno nem passa do limite
        assert str(ALUNO) not in erro
        assert len(erro) <= len("42883: ") + 200
        assert "I05" in resumo["erros"] and "I05" not in resumo["falharam"]
        # as que dependem de objeto não versionado também estouram, sem levar a rodada junto
        for inv in ("I06", "I16"):
            assert res[inv][0] is False and res[inv][1] is None and res[inv][2], inv
        assert res["I16"][2].startswith("42P01: ")  # view ausente
        # e as que vêm depois foram gravadas normalmente
        assert len(res) == 20
        for inv in ("I07", "I08", "I17", "I20"):
            assert res[inv] == (True, 0, None), inv
        # nada da subtransação que estourou sobrou na amostra
        assert _amostra(c, "I05") is None


def test_retencao_apaga_mais_de_30_dias():
    with _banco() as c:
        c.execute(
            """
            INSERT INTO public.metricas_invariante_resultado (invariante, rodado_em, ok, linhas) VALUES
              ('I01', now() - interval '31 days', true, 0),
              ('I01', now() - interval '29 days', true, 0);
            INSERT INTO public.metricas_invariante_amostra (invariante, rodado_em, ids) VALUES
              ('I08', now() - interval '31 days', '{velho}'),
              ('I08', now() - interval '29 days', '{recente}');
            """
        )
        _rodar(c)

        velhos = c.execute(
            "SELECT count(*) FROM public.metricas_invariante_resultado WHERE rodado_em < now() - interval '30 days'"
        ).fetchone()[0]
        assert velhos == 0
        assert c.execute(
            "SELECT count(*) FROM public.metricas_invariante_resultado WHERE rodado_em < now() - interval '28 days'"
        ).fetchone()[0] == 1
        assert c.execute(
            "SELECT array_agg(ids[1]) FROM public.metricas_invariante_amostra WHERE rodado_em < now() - interval '1 day'"
        ).fetchone()[0] == ["recente"]


def test_cliente_nao_executa_o_executor():
    with _banco() as c:
        # controle: função criada agora ganha EXECUTE para authenticated, como no Supabase. Se isto
        # falhar, o 42501 abaixo viria da falta de GRANT, não do REVOKE da migration.
        c.execute("CREATE FUNCTION public.controle_exec() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$")
        assert c.execute("SELECT has_function_privilege('authenticated', 'public.controle_exec()', 'EXECUTE')").fetchone()[0]

        for papel in ("authenticated", "anon"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with c.transaction():
                    _como_cliente(c, papel)
                    c.execute("SELECT public.fn_auditoria_metricas_rodar()")
            for n in range(1, 21):
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    with c.transaction():
                        _como_cliente(c, papel)
                        c.execute(f"SELECT * FROM public.fn_inv_i{n:02d}()").fetchall()
        # nada foi gravado pelas tentativas
        assert c.execute("SELECT count(*) FROM public.metricas_invariante_resultado").fetchone()[0] == 0

        # o service_role (dev investigando) roda
        with c.transaction():
            _como_cliente(c, "service_role")
            assert c.execute("SELECT public.fn_auditoria_metricas_rodar()").fetchone()[0]["rodadas"] == 20


def test_i17_a_i20_reprovam_o_que_a_spec_diz():
    with _banco() as c:
        _semeia_coerente(c)
        # I17: sessão aberta cujo último lote é terminal
        _lote(c, uuid.UUID(int=605), S_ABERTA, "screen_blur", minutos=1)
        # I18: build antigo gravando pela via direta (sem motivo), como o mobile: authenticated sem `via`
        with c.transaction():
            c.execute("SELECT set_config('request.jwt.claims', %s, true)", (json.dumps({"role": "authenticated"}),))
            _lote(c, uuid.UUID(int=606), S_FECHADA, "interval", minutos=100)
        # I19: resposta para questão que não existe
        with _sem_fk(c):
            resposta = c.execute(
                "INSERT INTO public.questao_aluno (aluno_id, questao_id, atividade_id, resposta) "
                "VALUES (%s, 9999, %s, 'b') RETURNING id",
                (ALUNO, ATIVIDADE),
            ).fetchone()[0]
        # I20: 7 lotes na semana, 1 sem análise -> 6/7 < 0,95 (recente: não dispara a I15)
        _lote(c, uuid.UUID(int=607), S_FECHADA, "interval", minutos=2, analisado=False)
        resumo = _rodar(c)
        res = _resultado(c)

        assert res["I17"] == (False, 1, None) and _amostra(c, "I17") == [str(S_ABERTA)]
        assert res["I18"] == (False, 1, None) and _amostra(c, "I18") == [str(uuid.UUID(int=606))]
        assert res["I19"] == (False, 1, None) and _amostra(c, "I19") == [str(resposta)]
        assert res["I20"] == (False, 1, None) and _amostra(c, "I20") == ["cobertura"]
        assert {"I17", "I18", "I19", "I20"} <= set(resumo["falharam"])


def test_i20_sem_lote_na_semana_nao_e_falha():
    with _banco() as c:
        _rodar(c)
        assert _resultado(c)["I20"] == (True, 0, None)


def test_i19_questao_de_atividade_apagada_reprova():
    with _banco() as c:
        _semeia_coerente(c)
        with _sem_fk(c):
            c.execute("DELETE FROM public.atividades WHERE id = %s", (ATIVIDADE,))
        _rodar(c)
        assert _resultado(c)["I19"] == (False, 1, None)


def test_aplicar_de_novo_e_o_downgrade():
    with _banco() as c:
        for sql in base._sql_de(M_INV, "upgrade"):
            c.execute(sql)
        assert _rodar(c)["rodadas"] == 20

        for sql in base._sql_de(M_INV, "downgrade"):
            c.execute(sql)
        assert c.execute(
            "SELECT count(*) FROM pg_proc WHERE proname LIKE 'fn\\_inv\\_i%' OR proname = 'fn_auditoria_metricas_rodar'"
        ).fetchone()[0] == 0
        # as tabelas da 20261029_02 ficam
        assert c.execute("SELECT count(*) FROM public.metricas_invariante_resultado").fetchone()[0] == 20


# Dublês com a assinatura de produção dos objetos não versionados (`docs/mobile/sql/20260920_04`,
# `20260921_01`, `20261021_05`). Sem eles o SQL de I05/I06/I10/I16 só é provado "estourando"; com eles
# ele roda de verdade e mede.
DEPENDENCIAS = f"""
CREATE FUNCTION public.trailup_progresso_percurso(p_aluno uuid, p_classe bigint)
RETURNS TABLE(topico_id bigint, total bigint, feitos bigint)
LANGUAGE sql STABLE AS $$ SELECT {TOPICO}::bigint, 2::bigint, 1::bigint WHERE p_classe = {CLASSE} $$;
CREATE FUNCTION public.trailup_tempo_sessao_min(
  p_aluno uuid, p_scope text, p_topico bigint, p_conteudo bigint, p_atividade bigint)
RETURNS numeric LANGUAGE sql STABLE AS $$ SELECT 12.5::numeric $$;
CREATE FUNCTION public.fn_app_config_int(p_chave text, p_padrao integer)
RETURNS integer LANGUAGE sql STABLE AS $$ SELECT p_padrao $$;
CREATE VIEW public.vw_metricas_sessoes_aluno_dia WITH (security_invoker = on) AS
  SELECT '{ALUNO}'::uuid AS aluno_id, {CLASSE}::bigint AS classe_id, d AS dia, 300::numeric AS tempo_sessao_seg
    FROM (VALUES (current_date), (current_date - 1)) v(d);
-- fan-out da produção: a view de engajamento conta cada sessão duas vezes (2x a soma direta)
CREATE VIEW public.vw_metricas_engajamento_aluno_classe WITH (security_invoker = on) AS
  SELECT '{ALUNO}'::uuid AS aluno_id, {CLASSE}::bigint AS classe_id, 1200::numeric AS tempo_total_uso_seg;
-- a da allowlist e uma vazada: as duas sem invoker e com o GRANT padrão do Supabase
CREATE VIEW public.vw_rank_posicoes_por_classe AS SELECT 1 AS posicao;
CREATE VIEW public.vw_vazada AS SELECT 1 AS x;
"""


def test_com_as_dependencias_presentes_as_que_estouravam_medem():
    with _banco() as c:
        _semeia_coerente(c)
        c.execute(DEPENDENCIAS)
        resumo = _rodar(c)
        res = _resultado(c)

        assert resumo["erros"] == []
        # I05: 1 de 2 itens do percurso feitos = 50, o que o tópico tem gravado
        assert res["I05"] == (True, 0, None)
        # I06: 0 direto + 12,5 da sessão = 12,5 gravado
        assert res["I06"] == (True, 0, None)
        # I10: o dublê nasceu com o EXECUTE padrão do Supabase para authenticated
        assert res["I10"] == (True, 0, None)
        # I11: só a vazada; a da allowlist e as com invoker passam
        assert res["I11"] == (False, 1, None) and _amostra(c, "I11") == ["vw_vazada"]
        # I16: 1200 / (300 + 300) = 2,00, o fan-out que a spec mediu
        assert res["I16"] == (False, 1, None) and _amostra(c, "I16") == [f"{ALUNO}:{CLASSE}"]

        # o estado da produção para a I10: REVOKE da 20261021_05 sem GRANT de volta
        c.execute("REVOKE ALL ON FUNCTION public.fn_app_config_int(text, integer) FROM PUBLIC, anon, authenticated")
        # e a view de engajamento corrigida (F5): soma igual à das sessões
        c.execute(
            "CREATE OR REPLACE VIEW public.vw_metricas_engajamento_aluno_classe WITH (security_invoker = on) AS "
            f"SELECT '{ALUNO}'::uuid AS aluno_id, {CLASSE}::bigint AS classe_id, 600::numeric AS tempo_total_uso_seg"
        )
        _rodar(c)
        res = _resultado(c)
        assert res["I10"] == (False, 1, None) and _amostra(c, "I10") == ["fn_app_config_int"]
        assert res["I16"] == (True, 0, None)
