"""`20261117_01`: o prêmio de missão grava a turma (e soma no rank), e só o banco grava prêmio.

Banco local com o esqueleto de produção e o caminho real do prêmio:

- o resolvedor de turma da `20261003_01` e o gatilho de valor da `20261021_06` (com `fn_pontos_do_evento`
  da `20260909_05`, os leitores da aposta e a policy de INSERT do aluno da `20260909_03`);
- as moedas: `fn_moedas_do_evento` da `20260912_02` e `fn_eventos_aluno_paga_moeda` da `20261020_05`;
- os quatro gravadores de prêmio como a cadeia os deixou: o gatilho de eventos (`20261021_20` + a troca
  da `20261103_07`), `trg_missao_item_concluido` (`20261103_05`), o de minutos (`20261021_20`) e
  `fn_missao_guilda_avaliar` (`20261105_13`).

Dublês, todos fora do que está em teste: o avaliador de métrica diz "cumpriu" sempre (quem decide se a
missão fecha não é esta migration), os agregados vêm vazios, o perfil da missão é nulo (as missões daqui
não têm perfil-alvo), as metas da economia não pagam nada, e `fn_fator_de_atraso` devolve 1, que é o que
a de produção devolve para referência que não seja `atividade:<id>` (medido em 17/11).
`fn_eventos_aluno_referencia_id` e o próprio gatilho AFTER de eventos não têm fonte no git: o dublê tira
os dígitos do fim, e o gatilho é criado aqui.

O aluno escreve como `authenticated` com as claims dele, como o PostgREST faria. Dados sintéticos.
"""

from __future__ import annotations

import json
import uuid

import psycopg
import pytest

from tests import _f5_banco as f5

pytestmark = f5.e2e

M = f5.modulo("20261117_01_premio_de_missao_na_turma.py")
M_REF = f5.modulo("20261003_01_referencia_de_item_personalizado.py")
M_VALOR = f5.modulo("20261021_06_aposta_e_pontuacao_ranqueada.py")
M_PONTUACAO = f5.modulo("20260909_05_pontuacao_decidida_pelo_banco.py")
M_CREDITADO = f5.modulo("20261025_01_pontos_do_evento_no_rank.py")
M_PRESENCA = f5.modulo("20260909_03_presenca_concedida.py")
M_POSSE = f5.modulo("20260826_09_rls_posse_por_tabela.py")
M_MOEDAS = f5.modulo("20260912_02_ganho_de_moedas.py")
M_MOEDAS_05 = f5.modulo("20261020_05_economia_conclusao_so_com_aprovacao.py")
M_SOMA = f5.modulo("20261021_15_missao_de_guilda_soma_os_membros.py")

TURMA = f5.TURMA
G = uuid.UUID(int=500)
CONTEUDO = 900
PONTOS_MISSAO = 10
PONTOS_DIARIA, MOEDAS_DIARIA = 10, 2  # como em produção (17/11)

GATILHO_VALOR_INS = """
CREATE TRIGGER trg_eventos_aluno_valor_ins
  BEFORE INSERT ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trg_eventos_aluno_valor_do_banco();
"""
# O gatilho AFTER é schema não versionado; a função é a da cadeia.
GATILHO_AFTER = """
CREATE TRIGGER trg_eventos_aluno_after_iud
  AFTER INSERT OR UPDATE OR DELETE ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trg_eventos_aluno_after_iud();
"""

DUBLES = """
CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_referencia_id(p text) RETURNS bigint
  LANGUAGE sql IMMUTABLE AS $$ SELECT NULLIF(substring(COALESCE(p, '') from '([0-9]+)$'), '')::bigint $$;
CREATE OR REPLACE FUNCTION public.fn_fator_de_atraso(p_aluno uuid, p_referencia text, p_quando timestamptz)
  RETURNS numeric LANGUAGE sql STABLE AS $$ SELECT 1::numeric $$;
CREATE OR REPLACE FUNCTION public.fn_agregados_do_aluno(p_aluno uuid, p_classe bigint)
  RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
CREATE OR REPLACE FUNCTION public.fn_avaliar_metrica(p_aluno uuid, p_agregados jsonb, p_criterio jsonb)
  RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.fn_perfil_da_missao(p_aluno uuid)
  RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;
CREATE OR REPLACE FUNCTION public.economia_avaliar_metas_de(p_aluno uuid, p_classe bigint)
  RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
CREATE UNIQUE INDEX IF NOT EXISTS moedas_ledger_ganho_unico
  ON public.moedas_ledger (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento';
"""

# O que o Supabase dá por padrão a quem é cliente (as tabelas aqui já existiam antes do GRANT).
GRANTS = """
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
"""


def _policies_de_eventos_aluno() -> list[str]:
    sql = [s for s in f5.sql_de(M_POSSE) if 'ON "eventos_aluno"' in s]
    assert any("eventos_aluno_posse_sel" in s for s in sql)
    return sql


def _cadeia() -> list[str]:
    return [
        M_POSSE.HELPERS,
        M_CREDITADO.CREDITADO,
        DUBLES,
        *f5.sql_de(M_REF),
        M_PONTUACAO.FUNCAO,
        M_VALOR.LEITORES,
        M_VALOR.GATILHO,
        GATILHO_VALOR_INS,
        M_MOEDAS.GATILHO,
        M_MOEDAS_05.EVENTOS,
        M.M20.gatilho(),
        M.M07.gatilho(),
        GATILHO_AFTER,
        M.M20.MINUTOS,
        M.M05.GATILHO_ITEM,
        M_SOMA.PROGRESSO,
        M.M13.COLUNA,
        M.M13.avaliar_novo(),
        "ALTER TABLE public.eventos_aluno ENABLE ROW LEVEL SECURITY",
        *_policies_de_eventos_aluno(),
        M_PRESENCA.POLICY_INSERT,
        GRANTS,
    ]


def _banco(com_migration: bool = True):
    return f5.banco(*_cadeia(), *(f5.sql_de(M) if com_migration else []))


def _semear(c) -> None:
    f5.semear_turma(c)
    for tabela in ("missoes", "conteudos", "guildas"):
        f5.afrouxa(c, tabela)
    c.execute(
        "INSERT INTO public.eventos_pontuacao (tipo, pontos, moedas) VALUES"
        " ('missao_concluida', %s, 0), ('missao_diaria_concluida', %s, %s),"
        " ('atividade_concluida', 15, 0), ('conteudo_concluido', 10, 0)",
        (PONTOS_MISSAO, PONTOS_DIARIA, MOEDAS_DIARIA),
    )
    c.execute(
        "INSERT INTO public.conteudos (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES (%s, 10, 'C')",
        (CONTEUDO,),
    )


def _missao(c, criterio: dict, recompensa: str, escopo: str = "aluno") -> int:
    return c.execute(
        "INSERT INTO public.missoes (classe_id, origem, escopo, titulo, criterio, recompensa_tipo, janela_inicio)"
        " VALUES (%s, 'professor', %s, 'Missão', %s, %s, now() - interval '1 day') RETURNING id",
        (TURMA, escopo, json.dumps(criterio), recompensa),
    ).fetchone()[0]


def _premios(c, missao: int) -> list[tuple]:
    return c.execute(
        "SELECT aluno_id, classe_id, valor FROM public.eventos_aluno WHERE referencia = %s ORDER BY aluno_id",
        (f"missao:{missao}",),
    ).fetchall()


def _moedas(c, missao: int) -> list[tuple]:
    return c.execute(
        "SELECT aluno_id, classe_id, delta FROM public.moedas_ledger WHERE referencia = %s ORDER BY aluno_id",
        (f"missao:{missao}",),
    ).fetchall()


def _como_cliente(c, uid: uuid.UUID, papel: str = "authenticated") -> None:
    c.execute(f"SET LOCAL ROLE {papel}")
    c.execute("SELECT set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": str(uid), "role": papel}),))
    c.execute("SELECT set_config('request.jwt.claim.sub', %s, true)", (str(uid),))


def _cliente_insere(c, uid: uuid.UUID, tipo: str, referencia: str | None) -> int:
    with c.transaction():
        _como_cliente(c, uid)
        return c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor) VALUES (%s, %s, %s, 999) RETURNING id",
            (uid, tipo, referencia),
        ).fetchone()[0]


def _estudo_do_servidor(c, aluno=f5.A) -> None:
    c.execute(
        "INSERT INTO public.eventos_aluno (aluno_id, tipo, criado_em) VALUES (%s, 'topico_iniciado', now() AT TIME ZONE 'UTC')",
        (aluno,),
    )


# ---------------------------------------------------------------------------------------- controle


def test_controle_sem_a_migration_o_premio_sai_sem_turma_e_vale_zero() -> None:
    """O defeito medido em produção (67 prêmios, todos sem turma e somando 0) existe neste banco."""
    with _banco(com_migration=False) as c:
        _semear(c)
        m = _missao(c, {"metrica": "atividades_concluidas", "minimo": 1}, "missao_concluida")
        _estudo_do_servidor(c)
        assert _premios(c, m) == [(f5.A, None, 0)]


# ---------------------------------------------------------------------------------- a turma no prêmio


def test_missao_concluida_soma_no_rank() -> None:
    with _banco() as c:
        _semear(c)
        m = _missao(c, {"metrica": "atividades_concluidas", "minimo": 1}, "missao_concluida")
        _estudo_do_servidor(c)
        assert _premios(c, m) == [(f5.A, TURMA, PONTOS_MISSAO)]


def test_diaria_de_item_paga_pontos_e_moedas_na_turma() -> None:
    with _banco() as c:
        _semear(c)
        m = _missao(
            c,
            {"metrica": "item_no_dia", "item": "conteudo", "item_id": CONTEUDO, "dia": "2026-11-17"},
            "missao_diaria_concluida",
        )
        c.execute(
            "INSERT INTO public.conteudo_aluno (aluno_id, conteudo_id, status) VALUES (%s, %s, 'concluido')",
            (f5.A, CONTEUDO),
        )
        assert _premios(c, m) == [(f5.A, TURMA, PONTOS_DIARIA)]
        assert _moedas(c, m) == [(f5.A, TURMA, MOEDAS_DIARIA)]


def test_diaria_de_minutos_paga_na_turma() -> None:
    with _banco() as c:
        _semear(c)
        m = _missao(c, {"metrica": "minutos_no_dia", "minutos": 1, "dia": "2026-11-17"}, "missao_diaria_concluida")
        c.execute(
            "INSERT INTO public.aluno_atividade_diaria (aluno_id, dia, tempo_uso_seg) VALUES (%s, current_date, 120)",
            (f5.A,),
        )
        assert _premios(c, m) == [(f5.A, TURMA, PONTOS_DIARIA)]
        assert _moedas(c, m) == [(f5.A, TURMA, MOEDAS_DIARIA)]


def test_missao_de_guilda_paga_cada_membro_na_turma() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.guildas (id, classe_id, nome, criado_por) VALUES (%s, %s, 'G', %s)", (G, TURMA, f5.A)
        )
        for aluno in (f5.A, f5.B):
            c.execute(
                "INSERT INTO public.guilda_membros (guilda_id, classe_id, aluno_id, joined_at)"
                " VALUES (%s, %s, %s, now() - interval '10 days')",
                (G, TURMA, aluno),
            )
        # Alvo por membro (padrão das missões novas, `20261105_13`): 1 x 2 membros = 2 conclusões.
        m = _missao(c, {"metrica": "atividades_concluidas", "minimo": 1}, "missao_diaria_concluida", escopo="guilda")
        for aluno in (f5.A, f5.B):
            c.execute(
                "INSERT INTO public.eventos_aluno (aluno_id, tipo, criado_em)"
                " VALUES (%s, 'atividade_concluida', now() AT TIME ZONE 'UTC')",
                (aluno,),
            )
        # O laço de guilda do gatilho de eventos já pagou; chamar de novo não paga outra vez.
        assert c.execute("SELECT public.fn_missao_guilda_avaliar(%s, %s)", (m, G)).fetchone()[0] is False
        esperado = sorted([(f5.A, TURMA, PONTOS_DIARIA), (f5.B, TURMA, PONTOS_DIARIA)])
        assert _premios(c, m) == esperado
        assert _moedas(c, m) == sorted([(f5.A, TURMA, MOEDAS_DIARIA), (f5.B, TURMA, MOEDAS_DIARIA)])


def test_nenhum_premio_sem_turma_sobra_no_banco() -> None:
    with _banco() as c:
        sobras = c.execute(
            r"""
            SELECT proname FROM pg_proc
             WHERE pronamespace = 'public'::regnamespace
               AND prosrc ~ 'INSERT INTO public\.eventos_aluno \(aluno_id, tipo, referencia, valor, criado_em\)\s*VALUES \([^;]*''missao:'''
            """
        ).fetchall()
        assert sobras == []


def test_resolvedor_le_a_turma_da_missao() -> None:
    with _banco() as c:
        _semear(c)
        m = _missao(c, {"metrica": "atividades_concluidas", "minimo": 1}, "missao_concluida")
        resolve = "SELECT public.fn_eventos_aluno_resolve_classe_id(%s, %s)"
        assert c.execute(resolve, ("missao_concluida", f"missao:{m}")).fetchone()[0] == TURMA
        assert c.execute(resolve, ("missao_concluida", "missao:999999")).fetchone()[0] is None
        # O que já resolvia continua igual.
        assert c.execute(resolve, ("topico_iniciado", "topico:10")).fetchone()[0] == TURMA
        assert c.execute(resolve, ("presenca_aula", "classe:1:aula:2")).fetchone()[0] == TURMA


# --------------------------------------------------------------------------- só o banco grava prêmio


@pytest.mark.parametrize("tipo", ["missao_concluida", "missao_diaria_concluida", "desafio_logica", "desafio_cruzadinha"])
def test_aluno_nao_grava_premio(tipo: str) -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="premio de missao"):
            _cliente_insere(c, f5.A, tipo, "missao:1")
        assert c.execute("SELECT count(*) FROM public.eventos_aluno WHERE tipo = %s", (tipo,)).fetchone()[0] == 0


def test_recompensa_de_estudo_nao_bloqueia_o_aluno() -> None:
    """A recusa é a lista fixa. Uma missão que use um tipo de estudo como recompensa não pode fazer o
    aluno levar 42501 ao gravar estudo (quem fecha `recompensa_tipo` é a guarda de `missoes`)."""
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.missoes (classe_id, origem, escopo, titulo, criterio, recompensa_tipo, ativa)"
            " VALUES (%s, 'professor', 'aluno', 'Missão', %s, 'conteudo_concluido', false)",
            (TURMA, json.dumps({"metrica": "atividades_concluidas", "minimo": 1})),
        )
        eid = _cliente_insere(c, f5.A, "conteudo_concluido", f"conteudo:{CONTEUDO}")
        assert c.execute("SELECT tipo FROM public.eventos_aluno WHERE id = %s", (eid,)).fetchone()[0] == "conteudo_concluido"


def test_aluno_conclui_conteudo_e_a_diaria_de_item_entra() -> None:
    """O cliente grava `conteudo_aluno` direto; `trg_missao_item_concluido` (dono) paga o prêmio."""
    with _banco() as c:
        _semear(c)
        m = _missao(
            c,
            {"metrica": "item_no_dia", "item": "conteudo", "item_id": CONTEUDO, "dia": "2026-11-17"},
            "missao_diaria_concluida",
        )
        with c.transaction():
            _como_cliente(c, f5.A)
            c.execute(
                "INSERT INTO public.conteudo_aluno (aluno_id, conteudo_id, status) VALUES (%s, %s, 'concluido')",
                (f5.A, CONTEUDO),
            )
        assert _premios(c, m) == [(f5.A, TURMA, PONTOS_DIARIA)]
        assert _moedas(c, m) == [(f5.A, TURMA, MOEDAS_DIARIA)]


def test_aluno_continua_gravando_estudo() -> None:
    """Foco da revisão 1: o evento do aluno passa, e o prêmio que ele dispara (como dono) entra."""
    with _banco() as c:
        _semear(c)
        m = _missao(c, {"metrica": "atividades_concluidas", "minimo": 1}, "missao_concluida")
        eid = _cliente_insere(c, f5.A, "atividade_concluida", "atividade:1")
        assert c.execute("SELECT tipo FROM public.eventos_aluno WHERE id = %s", (eid,)).fetchone()[0] == "atividade_concluida"
        assert _premios(c, m) == [(f5.A, TURMA, PONTOS_MISSAO)]


def test_service_role_grava_premio() -> None:
    with _banco() as c:
        _semear(c)
        # Sem `como`: o dono (a migration, a API pelo pooler como `postgres`).
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia) VALUES (%s, 'missao_concluida', 'missao:1')",
            (f5.A,),
        )
        with c.transaction():
            c.execute("SET LOCAL ROLE service_role")
            c.execute(
                "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia) VALUES (%s, 'missao_concluida', 'missao:2')",
                (f5.B,),
            )
        assert c.execute("SELECT count(*) FROM public.eventos_aluno WHERE tipo = 'missao_concluida'").fetchone()[0] == 2


# ------------------------------------------------------------------------------- upgrade e downgrade

FUNCOES = (
    "fn_eventos_aluno_resolve_classe_id",
    "trg_eventos_aluno_after_iud",
    "trg_missao_item_concluido",
    "trg_aluno_atividade_diaria_missao_minutos",
    "fn_missao_guilda_avaliar",
)


def _corpos(c) -> dict:
    return dict(
        c.execute(
            "SELECT proname, prosrc FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY(%s)",
            (list(FUNCOES),),
        ).fetchall()
    )


def test_upgrade_repete_sem_erro() -> None:
    with _banco() as c:
        antes = _corpos(c)
        for sql in f5.sql_de(M):
            c.execute(sql)
        assert _corpos(c) == antes


def test_downgrade_restaura() -> None:
    with _banco(com_migration=False) as c:
        antes = _corpos(c)
        assert set(antes) == set(FUNCOES)
        for sql in f5.sql_de(M):
            c.execute(sql)
        assert all(_corpos(c)[f] != antes[f] for f in FUNCOES)
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert _corpos(c) == antes
        assert c.execute(
            "SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_eventos_aluno_premio_so_do_banco'"
        ).fetchone()[0] == 0
        assert c.execute(
            "SELECT to_regprocedure('public.fn_eventos_aluno_premio_so_do_banco()')"
        ).fetchone()[0] is None
