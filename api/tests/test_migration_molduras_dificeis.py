"""Desafios de moldura (20261105_24): cada missão é medida de verdade, e só notificação e bug seguem fáceis.

A parte e2e roda em Postgres local. O esqueleto do schema é de 24/10, então as tabelas posteriores a ele
são criadas aqui com as colunas de produção. Cada desafio é provado no limite: quem fica um abaixo do
mínimo não ganha, e os atalhos que a missão proíbe não contam.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import text

from tests._f5_banco import afrouxa, banco, como, e2e, modulo, sql_de
from tests.test_migration_molduras import PRE

mod = modulo("20261105_24_molduras_tarefas_dificeis.py")
base = modulo("20261103_09_molduras_loja_conquistas_acoes.py")

A, B = uuid.UUID(int=41), uuid.UUID(int=42)
TURMA = 900

MINIMOS = {m[5]: m[6] for m in [*mod.ENDURECIDAS, *[c[2] for c in mod.CONVERTIDAS]]}


# --------------------------------------------------------------------------- estrutura


def test_notificacao_e_bug_ficam_e_as_outras_oito_saem():
    todas = {a[0] for a in base.ACOES}
    convertidas = {c[0] for c in mod.CONVERTIDAS}
    assert set(mod.ACOES_MANTIDAS) == {"ativar_notificacoes", "reportar_erro"}
    assert convertidas == todas - set(mod.ACOES_MANTIDAS)
    assert len(convertidas) == 8


def test_a_conquista_nova_cuida_da_moldura_que_a_acao_entregava():
    moldura_da_acao = {a[0]: a[3] for a in base.ACOES}
    for acao, _ordem, m in mod.CONVERTIDAS:
        assert m[0] == moldura_da_acao[acao]


def test_as_dezoito_missoes_sao_diferentes():
    assert len(mod.DESAFIOS) == 18
    assert len(set(mod.DESAFIOS)) == 18


def test_cada_desafio_tem_ramo_na_funcao():
    for desafio in mod.DESAFIOS:
        assert f"'{desafio}'" in mod.FUNCOES, desafio


def test_os_ajustes_pedidos_estao_nos_numeros():
    assert MINIMOS["serie_perfeita"] == 20
    assert MINIMOS["volta_por_cima"] == 10


def test_todas_as_conquistas_antigas_mudam():
    assert {m[0] for m in mod.ENDURECIDAS} == {c[0] for c in base.CONQUISTA}


def test_o_downgrade_guarda_o_que_a_semente_gravou():
    assert {c[0]: c[4] for c in mod.ANTERIORES} == {c[0]: c[5] for c in base.CONQUISTA}
    assert {c[0]: c[3] for c in mod.ANTERIORES} == {
        c[0]: c[3] for c in [(x[0], x[2], x[3], x[4]) for x in base.CONQUISTA]
    }


def test_ordem_antiga_bate_com_a_posicao_na_semente():
    posicao = {a[0]: i for i, a in enumerate(base.ACOES, start=1)}
    for acao, ordem, _m in mod.CONVERTIDAS:
        assert ordem == posicao[acao], acao


def test_nenhum_bloco_tem_bind_escondido():
    # `op.execute` passa por `text()`, que leria `:palavra` como parâmetro em tempo de migração.
    for bloco in [*mod.UPGRADE, *mod.DOWNGRADE]:
        assert text(bloco).compile().params == {}


def test_nenhuma_funcao_nova_fica_aberta_ao_cliente():
    for assinatura in (
        "fn_maior_sequencia_de_dias(date[])",
        "fn_turma_concluida_pelo_aluno(uuid, bigint)",
        "fn_desafio_moldura_valor(uuid, text)",
    ):
        assert f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon, authenticated" in mod.FUNCOES


# --------------------------------------------------------------------------- e2e

TABELAS_POSTERIORES = """
CREATE TABLE IF NOT EXISTS public.atividade_tentativas (
  id bigserial PRIMARY KEY, aluno_id uuid NOT NULL, atividade_id bigint NOT NULL, classe_id bigint,
  numero integer NOT NULL CHECK (numero > 0), iniciada_em timestamptz NOT NULL DEFAULT now(),
  respondida_em timestamptz, cronometrada boolean NOT NULL DEFAULT false, limite_seg integer,
  no_tempo boolean, acertos_percentual numeric, pontuacao_obtida numeric, pontuacao_maxima numeric,
  UNIQUE (aluno_id, atividade_id, numero));
CREATE TABLE IF NOT EXISTS public.ranqueada_elo_partida (
  desafio_id uuid NOT NULL, aluno_id uuid NOT NULL, classe_id bigint, equipe integer NOT NULL,
  resultado text NOT NULL CHECK (resultado IN ('vitoria', 'empate', 'derrota')),
  rating_antes integer NOT NULL, k integer, delta integer NOT NULL DEFAULT 0, rating_depois integer,
  criado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (desafio_id, aluno_id));
CREATE TABLE IF NOT EXISTS public.eventos_classe_resultado (
  evento_id uuid NOT NULL, aluno_id uuid NOT NULL, pontos integer, participou boolean NOT NULL DEFAULT false,
  posicao integer, destaque boolean, apurado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (evento_id, aluno_id));
CREATE TABLE IF NOT EXISTS public.eventos_classe_resultado_guilda (
  evento_id uuid NOT NULL, guilda_id uuid NOT NULL, pontos integer, membros integer, posicao integer,
  apurado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (evento_id, guilda_id));
CREATE TABLE IF NOT EXISTS public.rank_podio_congelado (
  rank_id bigint NOT NULL, classe_id bigint, aluno_id uuid NOT NULL, posicao integer, nome_aluno text,
  pontuacao numeric, percentual_do_lider numeric, medalha text, congelado_em timestamptz DEFAULT now(),
  PRIMARY KEY (rank_id, aluno_id));
"""


@pytest.fixture
def c():
    validador = modulo("20261031_01_conquista_valida_limiar_e_aparencia.py")
    historico = modulo("20261026_02_conquistas_sem_cascade_e_historico_de_criterio.py")
    avaliador = modulo("20261021_03_avaliador_de_metrica_compartilhado.py")
    with banco(
        PRE,
        TABELAS_POSTERIORES,
        # O esqueleto de 24/10 não traz os helpers que a policy do histórico consulta.
        "CREATE OR REPLACE FUNCTION public.app_classes_do_professor() RETURNS SETOF bigint"
        " LANGUAGE sql STABLE AS $$ SELECT NULL::bigint WHERE false $$;"
        "CREATE OR REPLACE FUNCTION public.app_e_dono() RETURNS boolean"
        " LANGUAGE sql STABLE AS $$ SELECT false $$;",
        *sql_de(avaliador),
        validador.VALIDADOR,
        validador.CHECK_SQL,
        historico.HISTORICO,
        *sql_de(base),
        *sql_de(mod),
    ) as conn:
        for tabela in (
            "guilda_membros",
            "topicos",
            "atividades",
            "classe_aluno",
            "topico_aluno",
            "atividade_aluno",
            "eventos_aluno",
            "telemetria_time_metric_entries",
            "guildas",
        ):
            afrouxa(conn, tabela)
        # Estas têm a chave primária nas colunas sem default, que `afrouxa` não pode tocar.
        conn.execute(
            """
DO $n$ DECLARE r record; BEGIN
  FOR r IN SELECT c.table_name, c.column_name FROM information_schema.columns c
            WHERE c.table_schema = 'public' AND c.is_nullable = 'NO' AND c.column_default IS NULL
              AND c.table_name IN ('atividade_tentativas', 'ranqueada_elo_partida', 'eventos_classe_resultado',
                                   'eventos_classe_resultado_guilda', 'rank_podio_congelado')
              AND NOT EXISTS (
                SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
                 WHERE i.indisprimary AND i.indrelid = format('public.%I', c.table_name)::regclass
                   AND a.attname = c.column_name)
  LOOP EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name); END LOOP;
END $n$;
"""
        )
        # O esqueleto traz FKs que exigiriam semear a árvore toda (professor, matéria, lote...).
        conn.execute(
            """
DO $f$ DECLARE r record; BEGIN
  FOR r IN SELECT conrelid::regclass AS t, conname FROM pg_constraint
            WHERE contype = 'f' AND conrelid = ANY (ARRAY[
              'public.guilda_membros', 'public.topicos', 'public.atividades', 'public.classe_aluno',
              'public.topico_aluno', 'public.atividade_aluno', 'public.eventos_aluno',
              'public.telemetria_time_metric_entries', 'public.atividade_tentativas',
              'public.ranqueada_elo_partida', 'public.eventos_classe_resultado',
              'public.eventos_classe_resultado_guilda', 'public.rank_podio_congelado']::regclass[])
  LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.t, r.conname); END LOOP;
END $f$;
"""
        )
        conn.execute(
            f"""
INSERT INTO auth.users (id, email) VALUES ('{A}', 'a@teste.invalid'), ('{B}', 'b@teste.invalid');
INSERT INTO public.alunos (id, nome, email) VALUES ('{A}', 'A', 'a@teste.invalid'), ('{B}', 'B', 'b@teste.invalid');
"""
        )
        yield conn


def _valor(c, desafio: str, quem=A) -> int:
    return c.execute("SELECT public.fn_desafio_moldura_valor(%s, %s)", (quem, desafio)).fetchone()[0]


def _rpc(c, quem, sql, *args):
    como(c, quem)
    try:
        return c.execute(sql, args).fetchone()[0]
    finally:
        como(c, None)


def _tentativa(c, atividade, numero=1, acertos=100, momento=None, cronometrada=False, no_tempo=None, respondida=True):
    momento = momento or datetime(2026, 11, 1, 12) + timedelta(minutes=atividade * 10 + numero)
    c.execute(
        "INSERT INTO public.atividade_tentativas"
        " (aluno_id, atividade_id, numero, respondida_em, cronometrada, no_tempo, acertos_percentual)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (A, atividade, numero, momento if respondida else None, cronometrada, no_tempo, acertos),
    )


def _evento(c, tipo: str, quando: datetime, referencia: str | None = None) -> None:
    """`quando` em UTC, como `criado_em` é gravado."""
    c.execute("ALTER TABLE public.eventos_aluno DISABLE TRIGGER USER;")
    c.execute(
        "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em) VALUES (%s, %s, %s, 0, %s)",
        (A, tipo, referencia, quando),
    )


def _dias(inicio: date, n: int) -> list[date]:
    return [inicio + timedelta(days=i) for i in range(n)]


def _meio_dia_sp(dia: date) -> datetime:
    return datetime(dia.year, dia.month, dia.day, 15)  # 12h em São Paulo


@e2e
def test_catalogo_fica_com_dezoito_de_conquista_e_duas_raras(c):
    linhas = dict(c.execute("SELECT origem, count(*) FROM public.molduras GROUP BY origem").fetchall())
    assert linhas == {"loja": 20, "conquista": 18, "acao": 2}
    assert (
        c.execute(
            "SELECT count(*) FROM public.molduras m JOIN public.conquistas q ON q.id = m.conquista_id"
            " WHERE q.tipo = 'moldura_' || m.codigo AND q.classe_id IS NULL AND q.pontos_recompensa = 0"
            " AND q.criterio->>'metrica' = 'desafio_moldura'"
        ).fetchone()[0]
        == 18
    )


@e2e
def test_as_acoes_mantidas_entregam_e_as_outras_so_registram(c):
    assert _rpc(c, A, "SELECT public.moldura_registrar_acao(%s)", "reportar_erro")["moldura"] == "bussola"
    assert _rpc(c, A, "SELECT public.moldura_registrar_acao(%s)", "ativar_notificacoes")["moldura"] == "chama_rara"
    # Build antigo continua chamando: grava a métrica e não entrega.
    assert _rpc(c, A, "SELECT public.moldura_registrar_acao(%s)", "ver_novidades") == {"ok": True, "nova": False}
    assert c.execute("SELECT count(*) FROM public.moldura_acao_aluno WHERE aluno_id = %s", (A,)).fetchone()[0] == 3
    posse = c.execute("SELECT moldura_codigo FROM public.moldura_aluno WHERE aluno_id = %s ORDER BY 1", (A,)).fetchall()
    assert posse == [("bussola",), ("chama_rara",)]


@e2e
def test_a_tela_diz_o_que_fazer(c):
    como(c, A)
    try:
        linhas = c.execute("SELECT codigo, origem, como_ganhar FROM public.molduras_catalogo()").fetchall()
    finally:
        como(c, None)
    por = {codigo: (origem, como_ganhar) for codigo, origem, como_ganhar in linhas}
    assert len(por) == 40
    assert por["sol_dourado"] == (
        "conquista",
        "Série perfeita: Tire 100% em 20 atividades seguidas, sem nenhuma nota menor no meio.",
    )
    assert por["estrela_guia"][1].startswith("Azarão: Vença 5 duelos")
    assert por["bussola"][0] == "acao"


@e2e
def test_banco_recusa_desafio_fora_da_lista(c):
    with pytest.raises(Exception, match="conquistas_criterio_valido"):
        c.execute(
            "UPDATE public.conquistas SET criterio = %s::jsonb WHERE tipo = 'moldura_geada'",
            (json.dumps({"metrica": "desafio_moldura", "desafio": "inventado", "minimo": 1}),),
        )


@e2e
def test_o_avaliador_compara_com_o_minimo(c):
    for n in range(1, 11):
        _tentativa(c, n)

    def avaliar(minimo):
        criterio = json.dumps({"metrica": "desafio_moldura", "desafio": "de_primeira", "minimo": minimo})
        return c.execute("SELECT public.fn_avaliar_metrica(%s, '{}'::jsonb, %s::jsonb)", (A, criterio)).fetchone()[0]

    assert avaliar(10) is True
    assert avaliar(11) is False


@e2e
def test_todas_as_conquistas_gravadas_passam_pelo_avaliador_sem_erro(c):
    criterios = c.execute(
        "SELECT criterio FROM public.conquistas WHERE criterio->>'metrica' = 'desafio_moldura'"
    ).fetchall()
    assert len(criterios) == 18
    for (criterio,) in criterios:
        assert (
            c.execute(
                "SELECT public.fn_avaliar_metrica(%s, '{}'::jsonb, %s::jsonb)", (A, json.dumps(criterio))
            ).fetchone()[0]
            is False
        ), criterio


@e2e
def test_conquista_concluida_entrega_a_moldura(c):
    conquista = c.execute("SELECT conquista_id FROM public.molduras WHERE codigo = 'nebulosa'").fetchone()[0]
    c.execute(
        "INSERT INTO public.conquistas_aluno (aluno_id, conquista_id, concluida, progresso) VALUES (%s, %s, true, 100)",
        (A, conquista),
    )
    assert c.execute(
        "SELECT origem FROM public.moldura_aluno WHERE aluno_id = %s AND moldura_codigo = 'nebulosa'", (A,)
    ).fetchone() == ("conquista",)


# --- precisão


@e2e
def test_de_primeira_ignora_refazer(c):
    _tentativa(c, 1)
    _tentativa(c, 2, numero=1, acertos=80)
    _tentativa(c, 2, numero=2, acertos=100)
    _tentativa(c, 3, respondida=False)
    assert _valor(c, "de_primeira") == 1


@e2e
def test_serie_perfeita_quebra_e_nao_aceita_repetir_a_mesma(c):
    for n in range(1, 4):
        _tentativa(c, n)
    _tentativa(c, 4, acertos=99)
    for n in range(5, 7):
        _tentativa(c, n)
    assert _valor(c, "serie_perfeita") == 3
    # Refazer a mesma atividade não aumenta a série de duas (5 e 6).
    for numero in range(2, 6):
        _tentativa(c, 6, numero=numero)
    assert _valor(c, "serie_perfeita") == 3


@e2e
def test_contra_o_relogio_exige_cronometro_no_tempo_e_100(c):
    _tentativa(c, 1, cronometrada=True, no_tempo=True)
    _tentativa(c, 2, cronometrada=True, no_tempo=False)
    _tentativa(c, 3, cronometrada=False)
    _tentativa(c, 4, cronometrada=True, no_tempo=True, acertos=90)
    assert _valor(c, "contra_o_relogio") == 1


@e2e
def test_volta_por_cima_exige_a_ordem_e_o_tombo(c):
    _tentativa(c, 1, numero=1, acertos=40)
    _tentativa(c, 1, numero=2, acertos=100)
    _tentativa(c, 2, numero=1, acertos=100)  # 100 antes do tombo não é volta por cima
    _tentativa(c, 2, numero=2, acertos=30)
    _tentativa(c, 3, numero=1, acertos=50)  # 50 não é "menos de 50"
    _tentativa(c, 3, numero=2, acertos=100)
    assert _valor(c, "volta_por_cima") == 1


# --- trilha


def _turma(c, topicos=5, concluidos=None, com_atividade=True, acertos=95):
    concluidos = topicos if concluidos is None else concluidos
    c.execute("INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (%s, %s)", (TURMA, A))
    for i in range(topicos):
        topico = 5000 + i
        c.execute("INSERT INTO public.topicos (id, classe_id, nome) VALUES (%s, %s, 't')", (topico, TURMA))
        if i < concluidos:
            c.execute(
                "INSERT INTO public.topico_aluno (aluno_id, topico_id, status, percentual_concluido)"
                " VALUES (%s, %s, 'concluido', 100)",
                (A, topico),
            )
    if com_atividade:
        c.execute("INSERT INTO public.atividades (id, topico_id, titulo) VALUES (7000, 5000, 'a')")
        c.execute(
            "INSERT INTO public.atividade_aluno (aluno_id, atividade_id, acertos_percentual) VALUES (%s, 7000, %s)",
            (A, acertos),
        )


@e2e
def test_turma_zerada_completa_vale(c):
    _turma(c)
    assert _valor(c, "turma_zerada") == 1


@e2e
def test_turma_zerada_recusa_turma_pequena(c):
    _turma(c, topicos=4)
    assert _valor(c, "turma_zerada") == 0


@e2e
def test_turma_zerada_recusa_topico_faltando(c):
    _turma(c, concluidos=4)
    assert _valor(c, "turma_zerada") == 0


@e2e
def test_turma_zerada_recusa_media_baixa(c):
    _turma(c, acertos=89)
    assert _valor(c, "turma_zerada") == 0


@e2e
def test_turma_zerada_recusa_turma_sem_atividade(c):
    _turma(c, com_atividade=False)
    assert _valor(c, "turma_zerada") == 0


@e2e
def test_sem_atalhos_cai_com_um_pulo(c):
    _turma(c, com_atividade=False)
    assert _valor(c, "sem_atalhos") == 1
    _evento(c, "topico_pular_conteudo", datetime(2026, 11, 1, 15), "topico:5003")
    assert _valor(c, "sem_atalhos") == 0


# --- constância


@e2e
def test_mes_de_verdade_so_conta_conclusao_e_buraco_quebra(c):
    for dia in _dias(date(2026, 9, 1), 5):
        _evento(c, "conteudo_concluido", _meio_dia_sp(dia))
    _evento(c, "atividade_concluida", _meio_dia_sp(date(2026, 9, 6)), "atividade:1")
    # Abrir um tópico não conta, e sem o dia 7 a sequência para no 6.
    _evento(c, "topico_aberto", _meio_dia_sp(date(2026, 9, 7)))
    _evento(c, "conteudo_concluido", _meio_dia_sp(date(2026, 9, 8)))
    assert _valor(c, "mes_de_verdade") == 6


@e2e
def test_o_dia_e_o_de_sao_paulo(c):
    # 01h UTC do dia 2 ainda é 22h do dia 1 em São Paulo.
    _evento(c, "conteudo_concluido", datetime(2026, 9, 2, 1))
    _evento(c, "conteudo_concluido", _meio_dia_sp(date(2026, 9, 1)))
    assert _valor(c, "mes_de_verdade") == 1
    assert _valor(c, "coruja") == 1


@e2e
def test_dia_completo_exige_tres_missoes_diferentes(c):
    for i, dia in enumerate(_dias(date(2026, 9, 1), 2)):
        for slot in range(3):
            _evento(c, "missao_diaria_concluida", _meio_dia_sp(dia), f"missao:{i}{slot}")
    # Terceiro dia com a mesma missão três vezes não conta.
    for _ in range(3):
        _evento(c, "missao_diaria_concluida", _meio_dia_sp(date(2026, 9, 3)), "missao:99")
    assert _valor(c, "dia_completo") == 2


@e2e
def test_sem_folga_exige_os_dois_dias_em_semanas_seguidas(c):
    # 2026-09-05 é sábado.
    for semana in range(3):
        sabado = date(2026, 9, 5) + timedelta(weeks=semana)
        _evento(c, "conteudo_concluido", _meio_dia_sp(sabado))
        _evento(c, "conteudo_concluido", _meio_dia_sp(sabado + timedelta(days=1)))
    # Semana 4 só com o sábado, semana 5 completa: a sequência fica em 3.
    _evento(c, "conteudo_concluido", _meio_dia_sp(date(2026, 9, 26)))
    _evento(c, "conteudo_concluido", _meio_dia_sp(date(2026, 10, 3)))
    _evento(c, "conteudo_concluido", _meio_dia_sp(date(2026, 10, 4)))
    assert _valor(c, "sem_folga") == 3


# --- rotina


@e2e
def test_madrugador_e_coruja_contam_dias_diferentes(c):
    # 10h UTC = 7h em São Paulo; duas no mesmo dia valem uma.
    _evento(c, "conteudo_concluido", datetime(2026, 9, 1, 10))
    _evento(c, "conteudo_concluido", datetime(2026, 9, 1, 10, 30))
    # 11h UTC = 8h em São Paulo: já não é antes das 8h.
    _evento(c, "conteudo_concluido", datetime(2026, 9, 2, 11))
    # Abrir o tópico cedo não conta.
    _evento(c, "topico_aberto", datetime(2026, 9, 3, 10))
    assert _valor(c, "madrugador") == 1
    assert _valor(c, "coruja") == 0


def _telemetria(c, quando: datetime, segundos: int, scope="topic") -> None:
    c.execute(
        "INSERT INTO public.telemetria_time_metric_entries"
        " (aluno_id, topico_id, scope, active_sec, captured_at, entry_key, lote_id)"
        " VALUES (%s, 1, %s, %s, %s, %s, %s)",
        (A, scope, segundos, quando, uuid.uuid4().hex, uuid.uuid4()),
    )


@e2e
def test_imersao_soma_lotes_e_nao_multiplica_escopos(c):
    _telemetria(c, datetime(2026, 9, 1, 15), 3600)
    _telemetria(c, datetime(2026, 9, 1, 16), 3600)
    # O escopo `content` repete o mesmo intervalo: somá-lo daria 2 h aqui.
    _telemetria(c, datetime(2026, 9, 2, 15), 3600)
    _telemetria(c, datetime(2026, 9, 2, 15), 3600, scope="content")
    assert _valor(c, "imersao") == 1


@e2e
def test_semana_completa_exige_as_quatro_coisas_no_dia(c):
    for dia in _dias(date(2026, 9, 1), 2):
        for tipo in ("conteudo_concluido", "atividade_concluida", "missao_diaria_concluida", "desafio_derrota"):
            _evento(c, tipo, _meio_dia_sp(dia))
    # Dia 3 sem duelo quebra.
    for tipo in ("conteudo_concluido", "atividade_concluida", "missao_diaria_concluida"):
        _evento(c, tipo, _meio_dia_sp(date(2026, 9, 3)))
    assert _valor(c, "semana_completa") == 2


# --- competição


def _partida(c, resultado, momento, minha=1000, dele=1000, quem=A):
    desafio = uuid.uuid4()
    c.execute(
        "INSERT INTO public.ranqueada_elo_partida (desafio_id, aluno_id, equipe, resultado, rating_antes, criado_em)"
        " VALUES (%s, %s, 1, %s, %s, %s), (%s, %s, 2, %s, %s, %s)",
        (desafio, quem, resultado, minha, momento, desafio, B, "derrota", dele, momento),
    )


@e2e
def test_invicto_quebra_com_derrota_e_empate(c):
    base_t = datetime(2026, 9, 1)
    for i, r in enumerate(["vitoria", "vitoria", "vitoria", "empate", "vitoria", "derrota", "vitoria", "vitoria"]):
        _partida(c, r, base_t + timedelta(hours=i))
    assert _valor(c, "invicto") == 3


@e2e
def test_azarao_exige_200_de_diferenca_e_vitoria(c):
    t = datetime(2026, 9, 1)
    _partida(c, "vitoria", t, minha=1000, dele=1200)
    _partida(c, "vitoria", t, minha=1000, dele=1199)
    _partida(c, "derrota", t, minha=1000, dele=1500)
    assert _valor(c, "azarao") == 1


@e2e
def test_campeao_exige_primeiro_lugar_e_participacao(c):
    for posicao, participou in ((1, True), (2, True), (1, False)):
        c.execute(
            "INSERT INTO public.eventos_classe_resultado (evento_id, aluno_id, participou, posicao) VALUES (%s, %s, %s, %s)",
            (uuid.uuid4(), A, participou, posicao),
        )
    assert _valor(c, "campeao") == 1


def _evento_de_guilda(c, guilda, posicao, participou, apurado):
    evento = uuid.uuid4()
    c.execute(
        "INSERT INTO public.eventos_classe_resultado_guilda (evento_id, guilda_id, posicao, apurado_em) VALUES (%s, %s, %s, %s)",
        (evento, guilda, posicao, apurado),
    )
    c.execute(
        "INSERT INTO public.eventos_classe_resultado (evento_id, aluno_id, participou, posicao) VALUES (%s, %s, %s, 5)",
        (evento, A, participou),
    )


@e2e
def test_guilda_lendaria_exige_ser_da_guilda_na_hora_e_participar(c):
    guilda = uuid.uuid4()
    c.execute(
        "INSERT INTO public.guilda_membros (guilda_id, classe_id, aluno_id, joined_at, left_at)"
        " VALUES (%s, %s, %s, %s, %s)",
        (guilda, TURMA, A, datetime(2026, 9, 10), datetime(2026, 9, 20)),
    )
    _evento_de_guilda(c, guilda, 1, True, datetime(2026, 9, 15))  # vale
    _evento_de_guilda(c, guilda, 2, True, datetime(2026, 9, 15))  # não venceu
    _evento_de_guilda(c, guilda, 1, False, datetime(2026, 9, 15))  # não participou
    _evento_de_guilda(c, guilda, 1, True, datetime(2026, 9, 5))  # ainda não era membro
    _evento_de_guilda(c, guilda, 1, True, datetime(2026, 9, 25))  # já tinha saído
    assert _valor(c, "guilda_lendaria") == 1


@e2e
def test_topo_do_podio_so_conta_o_primeiro(c):
    for rank, posicao in ((1, 1), (2, 2), (3, 1)):
        c.execute(
            "INSERT INTO public.rank_podio_congelado (rank_id, aluno_id, posicao) VALUES (%s, %s, %s)",
            (rank, A, posicao),
        )
    assert _valor(c, "topo_do_podio") == 2


# --- proteção e volta


@e2e
def test_quem_ja_tinha_nao_perde(c):
    c.execute("INSERT INTO public.moldura_aluno (aluno_id, moldura_codigo, origem) VALUES (%s, 'rosa', 'acao')", (B,))
    como(c, B)
    try:
        assert c.execute("SELECT tenho FROM public.molduras_catalogo() WHERE codigo = 'rosa'").fetchone()[0] is True
    finally:
        como(c, None)


@e2e
def test_trocar_o_criterio_passa_pelo_historico(c):
    assert c.execute("SELECT count(*) FROM public.conquistas_criterio_log WHERE classe_id IS NULL").fetchone()[0] == 10


@e2e
def test_downgrade_volta_ao_que_era(c):
    for sql in sql_de(mod, "downgrade"):
        c.execute(sql)
    linhas = dict(c.execute("SELECT origem, count(*) FROM public.molduras GROUP BY origem").fetchall())
    assert linhas == {"loja": 20, "conquista": 10, "acao": 10}
    assert (
        c.execute("SELECT count(*) FROM public.molduras_acoes WHERE ativa AND moldura_codigo IS NOT NULL").fetchone()[0]
        == 10
    )
    assert (
        c.execute("SELECT criterio->>'dias_seguidos' FROM public.conquistas WHERE tipo = 'moldura_geada'").fetchone()[0]
        == "7"
    )
    assert c.execute("SELECT count(*) FROM public.conquistas WHERE tipo = 'moldura_nebulosa'").fetchone()[0] == 0
    assert c.execute("SELECT public.fn_conquista_metrica_suportada('desafio_moldura')").fetchone()[0] is False
    corpo = c.execute(
        "SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.proname = 'molduras_catalogo'"
    ).fetchone()[0]
    assert re.search(r"'Conquista: ' \|\| c\.nome", corpo)
