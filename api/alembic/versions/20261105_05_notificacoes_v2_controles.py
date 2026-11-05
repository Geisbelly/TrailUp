"""Notificações v2, fase 2: o aluno escolhe os dias, até 3 horários e o próprio silêncio

Revision ID: 20261105_05
Revises: 20261105_04

Spec: `docs/superpowers/specs/2026-11-05-notificacoes-v2-design.md` (Controle do aluno).

## Dias e horários: na própria rotina

`notificacoes_agendamentos` ganha `dias_semana smallint[]` (ISO, 1 = segunda; nulo = todo dia) e
`horarios smallint[]` (minutos desde a meia-noite, até `rotina_max_horarios` = 3; nulo = o
`hora_local`/`minuto_local` de sempre). A spec falava em trocar a chave única para
`(aluno_id, tipo, hora_local, minuto_local)`, uma linha por horário. Ficou uma linha por tipo, com a
lista: a chave `(aluno_id, tipo)` está em três `ON CONFLICT` (`salvar_rotina`, `garantir_rotinas` e o
login), e a `recalcular_rotinas` decide a hora inferida por linha. Trocar a chave mexia em tudo isso
para guardar o que um array guarda.

`hora_local`/`minuto_local` continuam sendo o primeiro horário: quem só lê essas colunas (o app
1.0.7, a hora inferida) segue certo.

`notificacoes_proxima_ocorrencia` ganha `p_dias` e `p_horarios` (padrão nulo, então as chamadas de 5
argumentos não mudam de sentido): com eles, procura o próximo horário da lista num dia permitido, até
14 dias à frente. `notificacoes_processar_rotinas` passa as duas colunas, e o dedupe do dia leva o
horário quando há mais de um. Sem isso o segundo horário do dia batia no dedupe do primeiro e sumia.

`notificacoes_salvar_rotina` aceita `p_dias_semana` e `p_horarios`. Nulo quer dizer **manter**: o app
antigo, que não manda nenhum dos dois, não apaga o que o aluno escolheu em outro aparelho. Para voltar
a "todo dia", mande os 7 dias (vira nulo). Se o app antigo trocar a hora, a lista vira só aquela hora.
O que a RPC recusa (`22023`, `MESSAGE` com o código para o app traduzir):

- `dias_invalidos`: lista vazia ou dia fora de 1..7;
- `horarios_demais`: mais de `rotina_max_horarios`;
- `horario_invalido`: fora de 0..1439;
- `horarios_perto_demais`: dois horários mais perto que o `intervalo_min` do tipo em
  `notificacoes_tipos` (6 h na revisão diária), contando a volta da meia-noite. O motor adiaria o
  segundo de qualquer jeito; recusar na tela diz isso ao aluno em vez de deixá-lo esperando;
- `horario_no_silencio`: horário dentro do silêncio do próprio aluno.

## Silêncio do aluno

`alunos_notificacao_preferencias (aluno_id, silencio_inicio, silencio_fim)`, horas locais. Sem linha,
vale o silêncio de `notificacoes_config` (22h às 7h). `notificacoes_janela_silencio(aluno)` resolve
qual dos dois vale. `notificacoes_em_silencio` e `notificacoes_fora_do_silencio` ganham `p_aluno`
(padrão nulo = o silêncio global, como antes), e todo lugar que decide "agora é silêncio?" passa o
aluno: a fila (`enfileirar_evento`, `social_notificar_evento`, `ia_promover`), o adiamento por
intervalo (`entregar`), o push (`enviar_push`) e a hora inferida (`horario_preferido`).

`notificacoes_salvar_silencio(inicio, fim)` aceita de `silencio_duracao_min_h` (6) a
`silencio_duracao_max_h` (14) horas, para o aluno não zerar o silêncio por engano nem calar o dia.
Nulo nos dois volta ao padrão. Recusa (`horario_no_silencio`) se uma rotina de horário ativa cair
dentro: o aparelho dispara o lembrete local sem perguntar ao banco, então o silêncio não teria efeito
nele.

## Como as funções são remendadas

As que só mudam numa chamada (`enfileirar_evento`, `social_notificar_evento`, `enviar_push`,
`ia_promover`, `entregar`, `horario_preferido`, `processar_rotinas`, `recalcular_rotinas`) não são
copiadas: a migração lê o corpo vivo (`pg_get_functiondef`), troca o trecho e confere que ele
aparecia exatamente o número de vezes esperado. Se o corpo não for o que esta migração conhece, ela
para em vez de gravar meia troca. O downgrade faz a troca inversa.

## Tabela nova

`alunos_notificacao_preferencias`: RLS com policy de SELECT do próprio aluno. Escrita só pela RPC.
Retenção `vida_da_conta`, sai com a conta pela FK.
"""

from __future__ import annotations

from alembic import op

revision = "20261105_05"
down_revision = "20261105_04"
branch_labels = None
depends_on = None


def _sql_texto(valor: str) -> str:
    return "'" + valor.replace("'", "''") + "'"


CONFIG: list[tuple[str, str, str]] = [
    ("rotina_max_horarios", "3", "Horários por rotina que o aluno pode escolher."),
    ("silencio_duracao_min_h", "6", "Menor silêncio que o aluno pode escolher, em horas."),
    ("silencio_duracao_max_h", "14", "Maior silêncio que o aluno pode escolher, em horas."),
]

TABELAS = """
CREATE TABLE IF NOT EXISTS public.alunos_notificacao_preferencias (
  aluno_id        uuid        PRIMARY KEY REFERENCES public.alunos(id) ON DELETE CASCADE,
  silencio_inicio smallint    NOT NULL CHECK (silencio_inicio BETWEEN 0 AND 23),
  silencio_fim    smallint    NOT NULL CHECK (silencio_fim BETWEEN 0 AND 23),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CHECK (silencio_inicio <> silencio_fim)
);
COMMENT ON TABLE public.alunos_notificacao_preferencias IS
  'Silêncio escolhido pelo aluno, em horas locais (20261105_05). Sem linha vale o de notificacoes_config. '
  'Escrita só por notificacoes_salvar_silencio.';
ALTER TABLE public.alunos_notificacao_preferencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alunos_notificacao_preferencias_sel ON public.alunos_notificacao_preferencias;
CREATE POLICY alunos_notificacao_preferencias_sel ON public.alunos_notificacao_preferencias
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());
REVOKE ALL ON TABLE public.alunos_notificacao_preferencias FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.alunos_notificacao_preferencias TO authenticated;

ALTER TABLE public.notificacoes_agendamentos
  ADD COLUMN IF NOT EXISTS dias_semana smallint[],
  ADD COLUMN IF NOT EXISTS horarios smallint[];
ALTER TABLE public.notificacoes_agendamentos
  DROP CONSTRAINT IF EXISTS notificacoes_agendamentos_dias_semana_check,
  ADD CONSTRAINT notificacoes_agendamentos_dias_semana_check CHECK (
    dias_semana IS NULL
    OR (cardinality(dias_semana) BETWEEN 1 AND 7 AND 1 <= ALL (dias_semana) AND 7 >= ALL (dias_semana))
  ),
  DROP CONSTRAINT IF EXISTS notificacoes_agendamentos_horarios_check,
  ADD CONSTRAINT notificacoes_agendamentos_horarios_check CHECK (
    horarios IS NULL
    OR (cardinality(horarios) BETWEEN 1 AND 3 AND 0 <= ALL (horarios) AND 1439 >= ALL (horarios))
  );
COMMENT ON COLUMN public.notificacoes_agendamentos.dias_semana IS
  'Dias ISO (1 = segunda) em que a rotina dispara; nulo = todo dia (20261105_05).';
COMMENT ON COLUMN public.notificacoes_agendamentos.horarios IS
  'Minutos desde a meia-noite local, em ordem; nulo = hora_local/minuto_local (20261105_05).';
"""

RETENCAO = """
INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo) VALUES
  ('alunos_notificacao_preferencias', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'silencio de notificacao escolhido pelo aluno; sai com a conta pela FK')
ON CONFLICT (tabela, acao) DO NOTHING;
"""


def config() -> str:
    linhas = ",\n".join(f"  ({_sql_texto(c)}, {_sql_texto(v)}, {_sql_texto(d)})" for c, v, d in CONFIG)
    return (
        "INSERT INTO public.notificacoes_config (chave, valor, descricao) VALUES\n"
        + linhas
        + "\nON CONFLICT (chave) DO NOTHING;\n"
    )


SILENCIO = r"""
-- {inicio, fim} do silêncio que vale para o aluno: o dele, ou o de notificacoes_config.
CREATE OR REPLACE FUNCTION public.notificacoes_janela_silencio(p_aluno uuid)
RETURNS smallint[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_ini smallint;
  v_fim smallint;
BEGIN
  IF p_aluno IS NOT NULL THEN
    SELECT p.silencio_inicio, p.silencio_fim INTO v_ini, v_fim
      FROM alunos_notificacao_preferencias p WHERE p.aluno_id = p_aluno;
    IF FOUND THEN
      RETURN ARRAY[v_ini, v_fim];
    END IF;
  END IF;
  RETURN ARRAY[
    mod(public.notificacoes_cfg_int('janela_silencio_inicio', 22), 24)::smallint,
    mod(public.notificacoes_cfg_int('janela_silencio_fim', 7), 24)::smallint
  ];
END;
$fn$;

DROP FUNCTION IF EXISTS public.notificacoes_em_silencio(text, timestamptz);
CREATE OR REPLACE FUNCTION public.notificacoes_em_silencio(
  p_timezone text, p_momento timestamptz DEFAULT now(), p_aluno uuid DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $fn$
DECLARE
  v_janela smallint[] := public.notificacoes_janela_silencio(p_aluno);
  v_ini    integer := v_janela[1];
  v_fim    integer := v_janela[2];
  v_hora   integer;
BEGIN
  IF v_ini = v_fim THEN
    RETURN FALSE;
  END IF;
  v_hora := EXTRACT(HOUR FROM (p_momento AT TIME ZONE public.notificacoes_tz(p_timezone)))::int;
  IF v_ini < v_fim THEN
    RETURN v_hora >= v_ini AND v_hora < v_fim;
  END IF;
  -- Janela que cruza a meia-noite (ex.: 22h -> 7h).
  RETURN v_hora >= v_ini OR v_hora < v_fim;
END;
$fn$;

DROP FUNCTION IF EXISTS public.notificacoes_fora_do_silencio(text, timestamptz);
CREATE OR REPLACE FUNCTION public.notificacoes_fora_do_silencio(
  p_timezone text, p_momento timestamptz, p_aluno uuid DEFAULT NULL
)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $fn$
DECLARE
  v_tz    text := public.notificacoes_tz(p_timezone);
  v_fim   integer := (public.notificacoes_janela_silencio(p_aluno))[2];
  v_local timestamp;
  v_alvo  timestamp;
BEGIN
  IF p_momento IS NULL OR NOT public.notificacoes_em_silencio(v_tz, p_momento, p_aluno) THEN
    RETURN p_momento;
  END IF;
  v_local := p_momento AT TIME ZONE v_tz;
  v_alvo  := date_trunc('day', v_local) + make_interval(hours => v_fim);
  IF v_alvo <= v_local THEN
    v_alvo := v_alvo + interval '1 day';
  END IF;
  RETURN v_alvo AT TIME ZONE v_tz;
END;
$fn$;

-- O silêncio de um aluno não é dado para outro: só o banco pergunta.
REVOKE ALL ON FUNCTION public.notificacoes_janela_silencio(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_em_silencio(text, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_fora_do_silencio(text, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
"""

PROXIMA = r"""
DROP FUNCTION IF EXISTS public.notificacoes_proxima_ocorrencia(text, timestamptz, smallint, smallint, text);
CREATE OR REPLACE FUNCTION public.notificacoes_proxima_ocorrencia(
  p_recorrencia text,
  p_agora timestamptz,
  p_hora smallint,
  p_minuto smallint,
  p_timezone text,
  p_dias smallint[] DEFAULT NULL,
  p_horarios smallint[] DEFAULT NULL
)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $fn$
DECLARE
  v_rec   text := lower(trim(COALESCE(p_recorrencia, 'diaria')));
  v_tz    text := public.notificacoes_tz(p_timezone);
  v_local timestamp;
  v_alvo  timestamp;
  v_passo interval;
  v_n     integer;
  v_dias  smallint[] := p_dias;
  v_slots integer[];
  v_dia   date;
  v_s     integer;
BEGIN
  -- Rotina por EVENTO nao tem relogio: e avaliada no momento do login ou do
  -- heartbeat, entao nao tem proxima ocorrencia agendavel.
  IF v_rec IN ('unica', 'login', 'tempo_uso_diario') THEN
    RETURN NULL;
  END IF;

  IF v_rec ~ '^horas:[0-9]+$' THEN
    v_n := GREATEST(1, split_part(v_rec, ':', 2)::integer);
    RETURN p_agora + make_interval(hours => v_n);
  END IF;

  IF v_rec ~ '^minutos:[0-9]+$' THEN
    v_n := GREATEST(1, split_part(v_rec, ':', 2)::integer);
    RETURN p_agora + make_interval(mins => v_n);
  END IF;

  v_local := p_agora AT TIME ZONE v_tz;

  IF v_dias IS NULL AND p_horarios IS NULL THEN
    -- Como na 20260826_04: um horário, todo dia (ou a cada 7 dias).
    v_passo := CASE WHEN v_rec = 'semanal' THEN interval '7 days' ELSE interval '1 day' END;
    v_alvo  := date_trunc('day', v_local)
               + make_interval(hours => COALESCE(p_hora, EXTRACT(HOUR FROM v_local)::int),
                               mins  => COALESCE(p_minuto, 0));
    -- LOOP e nao um unico `+ passo`: se o banco/app ficou dias sem rodar, o alvo
    -- pode estar varios ciclos atras, e agendar no passado faria a rotina
    -- disparar em rajada na volta.
    WHILE v_alvo <= v_local LOOP
      v_alvo := v_alvo + v_passo;
    END LOOP;
    RETURN v_alvo AT TIME ZONE v_tz;
  END IF;

  -- Semanal sem dias: o dia da semana de hoje, como o passo de 7 dias fazia.
  IF v_dias IS NULL AND v_rec = 'semanal' THEN
    v_dias := ARRAY[EXTRACT(ISODOW FROM v_local)::smallint];
  END IF;

  IF p_horarios IS NOT NULL AND cardinality(p_horarios) > 0 THEN
    SELECT array_agg(DISTINCT h ORDER BY h) INTO v_slots FROM unnest(p_horarios) h;
  ELSE
    v_slots := ARRAY[COALESCE(p_hora, EXTRACT(HOUR FROM v_local)::int) * 60 + COALESCE(p_minuto, 0)];
  END IF;

  -- 14 dias cobrem qualquer lista de dias da semana com folga.
  FOR v_n IN 0..14 LOOP
    v_dia := v_local::date + v_n;
    CONTINUE WHEN v_dias IS NOT NULL AND NOT (EXTRACT(ISODOW FROM v_dia)::smallint = ANY (v_dias));
    FOREACH v_s IN ARRAY v_slots LOOP
      v_alvo := v_dia::timestamp + make_interval(mins => v_s);
      IF v_alvo > v_local THEN
        RETURN v_alvo AT TIME ZONE v_tz;
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END;
$fn$;
"""

PROXIMA_ANTES = r"""
DROP FUNCTION IF EXISTS public.notificacoes_proxima_ocorrencia(text, timestamptz, smallint, smallint, text, smallint[], smallint[]);
CREATE OR REPLACE FUNCTION public.notificacoes_proxima_ocorrencia(
  p_recorrencia text,
  p_agora timestamptz,
  p_hora smallint,
  p_minuto smallint,
  p_timezone text
)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $fn$
DECLARE
  v_rec   text := lower(trim(COALESCE(p_recorrencia, 'diaria')));
  v_tz    text := public.notificacoes_tz(p_timezone);
  v_local timestamp;
  v_alvo  timestamp;
  v_passo interval;
  v_n     integer;
BEGIN
  -- Rotina por EVENTO nao tem relogio: e avaliada no momento do login ou do
  -- heartbeat, entao nao tem proxima ocorrencia agendavel.
  IF v_rec IN ('unica', 'login', 'tempo_uso_diario') THEN
    RETURN NULL;
  END IF;

  IF v_rec ~ '^horas:[0-9]+$' THEN
    v_n := GREATEST(1, split_part(v_rec, ':', 2)::integer);
    RETURN p_agora + make_interval(hours => v_n);
  END IF;

  IF v_rec ~ '^minutos:[0-9]+$' THEN
    v_n := GREATEST(1, split_part(v_rec, ':', 2)::integer);
    RETURN p_agora + make_interval(mins => v_n);
  END IF;

  v_passo := CASE WHEN v_rec = 'semanal' THEN interval '7 days' ELSE interval '1 day' END;
  v_local := p_agora AT TIME ZONE v_tz;
  v_alvo  := date_trunc('day', v_local)
             + make_interval(hours => COALESCE(p_hora, EXTRACT(HOUR FROM v_local)::int),
                             mins  => COALESCE(p_minuto, 0));

  -- LOOP e nao um unico `+ passo`: se o banco/app ficou dias sem rodar, o alvo
  -- pode estar varios ciclos atras, e agendar no passado faria a rotina
  -- disparar em rajada na volta.
  WHILE v_alvo <= v_local LOOP
    v_alvo := v_alvo + v_passo;
  END LOOP;

  RETURN v_alvo AT TIME ZONE v_tz;
END;
$fn$;
"""

SILENCIO_ANTES = r"""
DROP FUNCTION IF EXISTS public.notificacoes_fora_do_silencio(text, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.notificacoes_em_silencio(text, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.notificacoes_janela_silencio(uuid);

CREATE OR REPLACE FUNCTION public.notificacoes_em_silencio(p_timezone text, p_momento timestamptz DEFAULT now())
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $fn$
DECLARE
  v_ini  integer := public.notificacoes_cfg_int('janela_silencio_inicio', 22) % 24;
  v_fim  integer := public.notificacoes_cfg_int('janela_silencio_fim', 7) % 24;
  v_hora integer;
BEGIN
  IF v_ini = v_fim THEN
    RETURN FALSE;
  END IF;
  v_hora := EXTRACT(HOUR FROM (p_momento AT TIME ZONE public.notificacoes_tz(p_timezone)))::int;
  IF v_ini < v_fim THEN
    RETURN v_hora >= v_ini AND v_hora < v_fim;
  END IF;
  -- Janela que cruza a meia-noite (ex.: 22h -> 7h).
  RETURN v_hora >= v_ini OR v_hora < v_fim;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notificacoes_fora_do_silencio(p_timezone text, p_momento timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $fn$
DECLARE
  v_tz    text := public.notificacoes_tz(p_timezone);
  v_fim   integer := mod(public.notificacoes_cfg_int('janela_silencio_fim', 7), 24);
  v_local timestamp;
  v_alvo  timestamp;
BEGIN
  IF p_momento IS NULL OR NOT public.notificacoes_em_silencio(v_tz, p_momento) THEN
    RETURN p_momento;
  END IF;
  v_local := p_momento AT TIME ZONE v_tz;
  v_alvo  := date_trunc('day', v_local) + make_interval(hours => v_fim);
  IF v_alvo <= v_local THEN
    v_alvo := v_alvo + interval '1 day';
  END IF;
  RETURN v_alvo AT TIME ZONE v_tz;
END;
$fn$;
REVOKE ALL ON FUNCTION public.notificacoes_fora_do_silencio(text, timestamptz) FROM PUBLIC, anon, authenticated;
"""

# (função, [(trecho de antes, trecho de depois, vezes)])
TROCAS: list[tuple[str, list[tuple[str, str, int]]]] = [
    (
        "public.notificacoes_enfileirar_evento(uuid, text, text, text, text, jsonb, integer, integer)",
        [("public.notificacoes_fora_do_silencio(v_tz, now())",
          "public.notificacoes_fora_do_silencio(v_tz, now(), p_aluno)", 1)],
    ),
    (
        "public.social_notificar_evento(uuid, text, text, text, text, jsonb)",
        [("public.notificacoes_fora_do_silencio(v_tz, now())",
          "public.notificacoes_fora_do_silencio(v_tz, now(), p_aluno_id)", 1)],
    ),
    (
        "public.notificacoes_enviar_push(uuid, bigint, text, text, jsonb, integer)",
        [("public.notificacoes_em_silencio(d.timezone)",
          "public.notificacoes_em_silencio(d.timezone, now(), p_aluno)", 1)],
    ),
    (
        "public.notificacoes_ia_promover()",
        [("public.notificacoes_fora_do_silencio(v_tz, COALESCE(v_hor, now()))",
          "public.notificacoes_fora_do_silencio(v_tz, COALESCE(v_hor, now()), NEW.aluno_id)", 1)],
    ),
    (
        "public.notificacoes_entregar(uuid, text[])",
        [("public.notificacoes_fora_do_silencio(v_tz, v_adiar)",
          "public.notificacoes_fora_do_silencio(v_tz, v_adiar, p_aluno)", 1)],
    ),
    (
        "public.notificacoes_horario_preferido(uuid)",
        [
            ("mod(public.notificacoes_cfg_int('janela_silencio_fim', 7), 24)",
             "(public.notificacoes_janela_silencio(p_aluno))[2]", 1),
            ("public.notificacoes_em_silencio(s.timezone, s.iniciada_em)",
             "public.notificacoes_em_silencio(s.timezone, s.iniciada_em, p_aluno)", 1),
            ("mod(v_envio, 60), 0, 'UTC')",
             "mod(v_envio, 60), 0, 'UTC'), p_aluno", 1),
        ],
    ),
    (
        "public.notificacoes_processar_rotinas(uuid, text, integer)",
        [
            ("v_reg.recorrencia, now(), v_reg.hora_local, v_reg.minuto_local, v_reg.timezone",
             "v_reg.recorrencia, now(), v_reg.hora_local, v_reg.minuto_local, v_reg.timezone,"
             " v_reg.dias_semana, v_reg.horarios", 3),
            # Mais de um horário por dia: o dedupe do dia leva o horário, senão o segundo some.
            ("public.notificacoes_dedupe_key(v_reg.tipo, v_ctx->>'motivo', v_dia)",
             "public.notificacoes_dedupe_key(v_reg.tipo, concat_ws('@', v_ctx->>'motivo',"
             " CASE WHEN cardinality(v_reg.horarios) > 1 THEN to_char(v_reg.proxima_execucao"
             " AT TIME ZONE public.notificacoes_tz(v_reg.timezone), 'HH24MI') END), v_dia)", 1),
        ],
    ),
    (
        "public.notificacoes_recalcular_rotinas(integer)",
        [("v_reg.recorrencia, now(), v_hora, v_minuto, v_reg.timezone",
          "v_reg.recorrencia, now(), v_hora, v_minuto, v_reg.timezone, v_reg.dias_semana", 1)],
    ),
]


def _dolar(texto: str) -> str:
    assert "$t$" not in texto
    return f"$t${texto}$t$"


def remendo(assinatura: str, trocas: list[tuple[str, str, int]]) -> str:
    """Troca trechos do corpo vivo da função, conferindo quantas vezes cada um aparece."""
    passos = []
    for antes, depois, vezes in trocas:
        a, d = _dolar(antes), _dolar(depois)
        passos.append(
            f"""
  v_n := (length(v_def) - length(replace(v_def, {a}, ''))) / length({a});
  IF v_n <> {vezes} THEN
    RAISE EXCEPTION '20261105_05: % tem % vez(es) de %, esperava {vezes}', {_dolar(assinatura)}, v_n, {a};
  END IF;
  v_def := replace(v_def, {a}, {d});"""
        )
    return f"""
DO $remendo$
DECLARE
  v_def text := pg_get_functiondef({_dolar(assinatura)}::regprocedure);
  v_n   integer;
BEGIN{''.join(passos)}
  EXECUTE v_def;
END $remendo$;
"""


def remendos(*, desfazer: bool = False) -> list[str]:
    if not desfazer:
        return [remendo(f, t) for f, t in TROCAS]
    return [remendo(f, [(d, a, n) for a, d, n in t]) for f, t in reversed(TROCAS)]


ROTINAS = r"""
DROP FUNCTION IF EXISTS public.notificacoes_salvar_rotina(
  text, text, text, text, text, smallint, smallint, text, integer, jsonb, boolean
);
CREATE OR REPLACE FUNCTION public.notificacoes_salvar_rotina(
  p_tipo text,
  p_recorrencia text DEFAULT 'diaria',
  p_gatilho text DEFAULT 'horario',
  p_titulo text DEFAULT NULL,
  p_corpo text DEFAULT NULL,
  p_hora_local smallint DEFAULT NULL,
  p_minuto_local smallint DEFAULT 0,
  p_timezone text DEFAULT 'UTC',
  p_prioridade integer DEFAULT 0,
  p_contexto jsonb DEFAULT '{}'::jsonb,
  p_ativo boolean DEFAULT true,
  p_dias_semana smallint[] DEFAULT NULL,
  p_horarios smallint[] DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_aluno    uuid := auth.uid();
  v_tz       text := public.notificacoes_tz(p_timezone);
  v_atual    notificacoes_agendamentos%ROWTYPE;
  v_dias     smallint[];
  v_horarios smallint[];
  v_hora     smallint := p_hora_local;
  v_minuto   smallint := COALESCE(p_minuto_local, 0);
  v_max      integer := public.notificacoes_cfg_int('rotina_max_horarios', 3);
  v_interv   integer;
  v_janela   smallint[];
  v_slots    integer[];
  v_i        integer;
  v_prox     timestamptz;
  v_id       bigint;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  IF p_gatilho NOT IN ('horario', 'login', 'tempo_uso') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'gatilho invalido: ' || COALESCE(p_gatilho, '');
  END IF;

  SELECT * INTO v_atual FROM notificacoes_agendamentos a
   WHERE a.aluno_id = v_aluno AND a.tipo = p_tipo;

  -- Dias: nulo mantém o que está; os 7 dias voltam a "todo dia" (nulo).
  IF p_dias_semana IS NULL THEN
    v_dias := v_atual.dias_semana;
  ELSE
    IF cardinality(p_dias_semana) = 0 OR NOT (1 <= ALL (p_dias_semana) AND 7 >= ALL (p_dias_semana)) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'dias_invalidos';
    END IF;
    SELECT array_agg(DISTINCT d ORDER BY d) INTO v_dias FROM unnest(p_dias_semana) d;
    IF cardinality(v_dias) = 7 THEN
      v_dias := NULL;
    END IF;
  END IF;

  -- Horários: nulo mantém a lista, a não ser que o app antigo tenha trocado a hora.
  IF p_horarios IS NOT NULL THEN
    IF cardinality(p_horarios) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'horario_invalido';
    END IF;
    IF NOT (0 <= ALL (p_horarios) AND 1439 >= ALL (p_horarios)) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'horario_invalido';
    END IF;
    SELECT array_agg(DISTINCT h ORDER BY h) INTO v_horarios FROM unnest(p_horarios) h;
    IF cardinality(v_horarios) > v_max THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'horarios_demais',
        DETAIL = 'no máximo ' || v_max || ' horários';
    END IF;
    v_hora   := (v_horarios[1] / 60)::smallint;
    v_minuto := (v_horarios[1] % 60)::smallint;
    IF cardinality(v_horarios) = 1 THEN
      v_horarios := NULL;  -- um horário só: hora_local/minuto_local bastam
    END IF;
  ELSIF v_atual.horarios IS NOT NULL
        AND v_hora IS NOT DISTINCT FROM v_atual.hora_local
        AND v_minuto IS NOT DISTINCT FROM v_atual.minuto_local THEN
    v_horarios := v_atual.horarios;
  END IF;

  IF p_gatilho = 'horario' AND v_hora IS NOT NULL THEN
    v_slots := COALESCE(v_horarios::integer[], ARRAY[v_hora * 60 + v_minuto]);

    SELECT t.intervalo_min INTO v_interv FROM notificacoes_tipos t WHERE t.tipo = p_tipo;
    IF COALESCE(v_interv, 0) > 0 AND cardinality(v_slots) > 1 THEN
      FOR v_i IN 1..cardinality(v_slots) LOOP
        -- Em ordem; o último conta com o primeiro do dia seguinte.
        IF COALESCE(v_slots[v_i + 1], v_slots[1] + 1440) - v_slots[v_i] < v_interv THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'horarios_perto_demais',
            DETAIL = 'intervalo mínimo de ' || v_interv || ' min entre horários';
        END IF;
      END LOOP;
    END IF;

    IF COALESCE(p_ativo, TRUE) THEN
      v_janela := public.notificacoes_janela_silencio(v_aluno);
      FOR v_i IN 1..cardinality(v_slots) LOOP
        -- Sem CASE aqui: o IF do plpgsql corta a condição no primeiro THEN.
        IF (v_janela[1] < v_janela[2] AND v_slots[v_i] / 60 >= v_janela[1] AND v_slots[v_i] / 60 < v_janela[2])
           OR (v_janela[1] > v_janela[2] AND (v_slots[v_i] / 60 >= v_janela[1] OR v_slots[v_i] / 60 < v_janela[2])) THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'horario_no_silencio',
            DETAIL = 'silêncio das ' || v_janela[1] || 'h às ' || v_janela[2] || 'h';
        END IF;
      END LOOP;
    END IF;
  END IF;

  v_prox := public.notificacoes_proxima_ocorrencia(
    p_recorrencia, now(), v_hora, v_minuto, v_tz, v_dias, v_horarios
  );

  INSERT INTO notificacoes_agendamentos (
    aluno_id, tipo, recorrencia, gatilho, titulo, corpo, hora_local, minuto_local,
    timezone, prioridade, contexto, proxima_execucao, horario, ativo, hora_origem,
    dias_semana, horarios
  )
  VALUES (
    v_aluno, p_tipo, p_recorrencia, p_gatilho, p_titulo, p_corpo, v_hora,
    v_minuto, v_tz, COALESCE(p_prioridade, 0),
    COALESCE(p_contexto, '{}'::jsonb), v_prox, v_prox, COALESCE(p_ativo, TRUE), 'aluno',
    v_dias, v_horarios
  )
  ON CONFLICT (aluno_id, tipo) WHERE aluno_id IS NOT NULL DO UPDATE
    SET recorrencia = EXCLUDED.recorrencia, gatilho = EXCLUDED.gatilho,
        titulo = COALESCE(EXCLUDED.titulo, notificacoes_agendamentos.titulo),
        corpo = COALESCE(EXCLUDED.corpo, notificacoes_agendamentos.corpo),
        -- A tela manda a hora atual também no liga/desliga: só hora, minuto ou lista
        -- DIFERENTES são escolha. Sem isso, desligar e religar congelaria a
        -- hora inferida como se o aluno a tivesse escolhido.
        hora_origem = CASE
          WHEN EXCLUDED.hora_local IS DISTINCT FROM notificacoes_agendamentos.hora_local
            OR EXCLUDED.minuto_local IS DISTINCT FROM notificacoes_agendamentos.minuto_local
            OR EXCLUDED.horarios IS DISTINCT FROM notificacoes_agendamentos.horarios
          THEN 'aluno'
          ELSE notificacoes_agendamentos.hora_origem
        END,
        hora_local = EXCLUDED.hora_local, minuto_local = EXCLUDED.minuto_local,
        timezone = EXCLUDED.timezone, prioridade = EXCLUDED.prioridade,
        contexto = EXCLUDED.contexto,
        proxima_execucao = EXCLUDED.proxima_execucao,
        horario = EXCLUDED.horario,
        dias_semana = EXCLUDED.dias_semana, horarios = EXCLUDED.horarios,
        ativo = EXCLUDED.ativo, atualizado_em = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'proxima_execucao', v_prox,
                            'dias_semana', v_dias, 'horarios', v_horarios);
END;
$fn$;
REVOKE ALL ON FUNCTION public.notificacoes_salvar_rotina(
  text, text, text, text, text, smallint, smallint, text, integer, jsonb, boolean, smallint[], smallint[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificacoes_salvar_rotina(
  text, text, text, text, text, smallint, smallint, text, integer, jsonb, boolean, smallint[], smallint[]
) TO authenticated;

DROP FUNCTION IF EXISTS public.notificacoes_minhas_rotinas();
CREATE OR REPLACE FUNCTION public.notificacoes_minhas_rotinas()
RETURNS TABLE(id bigint, tipo text, recorrencia text, gatilho text, titulo text, corpo text,
              hora_local smallint, minuto_local smallint, timezone text, prioridade integer,
              contexto jsonb, ativo boolean, proxima_execucao timestamptz,
              dias_semana smallint[], horarios smallint[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT a.id, a.tipo, a.recorrencia, a.gatilho, a.titulo, a.corpo,
         a.hora_local, a.minuto_local, a.timezone, a.prioridade,
         a.contexto, a.ativo, a.proxima_execucao, a.dias_semana, a.horarios
    FROM notificacoes_agendamentos a
   WHERE a.aluno_id = auth.uid()
   ORDER BY a.tipo
$fn$;
REVOKE ALL ON FUNCTION public.notificacoes_minhas_rotinas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificacoes_minhas_rotinas() TO authenticated;

-- RPC do app: o silêncio que vale para o próprio aluno, e os limites da escolha.
CREATE OR REPLACE FUNCTION public.notificacoes_meu_silencio()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_aluno  uuid := auth.uid();
  v_janela smallint[];
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  v_janela := public.notificacoes_janela_silencio(v_aluno);
  RETURN jsonb_build_object(
    'inicio', v_janela[1], 'fim', v_janela[2],
    'proprio', EXISTS (SELECT 1 FROM alunos_notificacao_preferencias p WHERE p.aluno_id = v_aluno),
    'padrao_inicio', mod(public.notificacoes_cfg_int('janela_silencio_inicio', 22), 24),
    'padrao_fim', mod(public.notificacoes_cfg_int('janela_silencio_fim', 7), 24),
    'duracao_min_h', public.notificacoes_cfg_int('silencio_duracao_min_h', 6),
    'duracao_max_h', public.notificacoes_cfg_int('silencio_duracao_max_h', 14)
  );
END;
$fn$;

-- RPC do app: grava o silêncio do aluno. Nulo nos dois volta ao padrão.
CREATE OR REPLACE FUNCTION public.notificacoes_salvar_silencio(p_inicio smallint, p_fim smallint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_aluno   uuid := auth.uid();
  v_min     integer := public.notificacoes_cfg_int('silencio_duracao_min_h', 6);
  v_max     integer := public.notificacoes_cfg_int('silencio_duracao_max_h', 14);
  v_duracao integer;
  v_conflito text;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;

  IF p_inicio IS NULL AND p_fim IS NULL THEN
    DELETE FROM alunos_notificacao_preferencias WHERE aluno_id = v_aluno;
  ELSE
    IF p_inicio IS NULL OR p_fim IS NULL OR p_inicio NOT BETWEEN 0 AND 23 OR p_fim NOT BETWEEN 0 AND 23 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'silencio_invalido';
    END IF;
    v_duracao := mod(p_fim - p_inicio + 24, 24);
    IF v_duracao < v_min OR v_duracao > v_max THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'silencio_duracao',
        DETAIL = 'de ' || v_min || ' a ' || v_max || ' horas';
    END IF;

    -- O aparelho dispara o lembrete local sem perguntar ao banco: rotina dentro do silêncio
    -- tocaria mesmo assim.
    SELECT a.tipo INTO v_conflito
      FROM notificacoes_agendamentos a,
           LATERAL unnest(COALESCE(a.horarios::integer[], ARRAY[a.hora_local * 60 + a.minuto_local])) s
     WHERE a.aluno_id = v_aluno AND a.ativo AND a.gatilho = 'horario' AND a.hora_local IS NOT NULL
       AND CASE WHEN p_inicio < p_fim THEN s / 60 >= p_inicio AND s / 60 < p_fim
                ELSE s / 60 >= p_inicio OR s / 60 < p_fim END
     LIMIT 1;
    IF v_conflito IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'horario_no_silencio', DETAIL = v_conflito;
    END IF;

    INSERT INTO alunos_notificacao_preferencias (aluno_id, silencio_inicio, silencio_fim)
    VALUES (v_aluno, p_inicio, p_fim)
    ON CONFLICT (aluno_id) DO UPDATE
      SET silencio_inicio = EXCLUDED.silencio_inicio, silencio_fim = EXCLUDED.silencio_fim,
          atualizado_em = now();
  END IF;

  RETURN public.notificacoes_meu_silencio();
END;
$fn$;
REVOKE ALL ON FUNCTION public.notificacoes_meu_silencio() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notificacoes_salvar_silencio(smallint, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificacoes_meu_silencio() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notificacoes_salvar_silencio(smallint, smallint) TO authenticated;
"""

ROTINAS_ANTES = r"""
DROP FUNCTION IF EXISTS public.notificacoes_salvar_silencio(smallint, smallint);
DROP FUNCTION IF EXISTS public.notificacoes_meu_silencio();
DROP FUNCTION IF EXISTS public.notificacoes_salvar_rotina(
  text, text, text, text, text, smallint, smallint, text, integer, jsonb, boolean, smallint[], smallint[]
);
CREATE OR REPLACE FUNCTION public.notificacoes_salvar_rotina(
  p_tipo text,
  p_recorrencia text DEFAULT 'diaria',
  p_gatilho text DEFAULT 'horario',
  p_titulo text DEFAULT NULL,
  p_corpo text DEFAULT NULL,
  p_hora_local smallint DEFAULT NULL,
  p_minuto_local smallint DEFAULT 0,
  p_timezone text DEFAULT 'UTC',
  p_prioridade integer DEFAULT 0,
  p_contexto jsonb DEFAULT '{}'::jsonb,
  p_ativo boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_aluno uuid := auth.uid();
  v_tz    text := public.notificacoes_tz(p_timezone);
  v_prox  timestamptz;
  v_id    bigint;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  IF p_gatilho NOT IN ('horario', 'login', 'tempo_uso') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'gatilho invalido: ' || COALESCE(p_gatilho, '');
  END IF;

  v_prox := public.notificacoes_proxima_ocorrencia(
    p_recorrencia, now(), p_hora_local, p_minuto_local, v_tz
  );

  INSERT INTO notificacoes_agendamentos (
    aluno_id, tipo, recorrencia, gatilho, titulo, corpo, hora_local, minuto_local,
    timezone, prioridade, contexto, proxima_execucao, horario, ativo, hora_origem
  )
  VALUES (
    v_aluno, p_tipo, p_recorrencia, p_gatilho, p_titulo, p_corpo, p_hora_local,
    COALESCE(p_minuto_local, 0), v_tz, COALESCE(p_prioridade, 0),
    COALESCE(p_contexto, '{}'::jsonb), v_prox, v_prox, COALESCE(p_ativo, TRUE), 'aluno'
  )
  ON CONFLICT (aluno_id, tipo) WHERE aluno_id IS NOT NULL DO UPDATE
    SET recorrencia = EXCLUDED.recorrencia, gatilho = EXCLUDED.gatilho,
        titulo = COALESCE(EXCLUDED.titulo, notificacoes_agendamentos.titulo),
        corpo = COALESCE(EXCLUDED.corpo, notificacoes_agendamentos.corpo),
        -- A tela manda a hora atual também no liga/desliga: só hora ou minuto
        -- DIFERENTES são escolha. Sem isso, desligar e religar congelaria a
        -- hora inferida como se o aluno a tivesse escolhido.
        hora_origem = CASE
          WHEN EXCLUDED.hora_local IS DISTINCT FROM notificacoes_agendamentos.hora_local
            OR EXCLUDED.minuto_local IS DISTINCT FROM notificacoes_agendamentos.minuto_local
          THEN 'aluno'
          ELSE notificacoes_agendamentos.hora_origem
        END,
        hora_local = EXCLUDED.hora_local, minuto_local = EXCLUDED.minuto_local,
        timezone = EXCLUDED.timezone, prioridade = EXCLUDED.prioridade,
        contexto = EXCLUDED.contexto,
        proxima_execucao = EXCLUDED.proxima_execucao,
        horario = EXCLUDED.horario,
        ativo = EXCLUDED.ativo, atualizado_em = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'proxima_execucao', v_prox);
END;
$fn$;
REVOKE ALL ON FUNCTION public.notificacoes_salvar_rotina(
  text, text, text, text, text, smallint, smallint, text, integer, jsonb, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificacoes_salvar_rotina(
  text, text, text, text, text, smallint, smallint, text, integer, jsonb, boolean
) TO authenticated;

DROP FUNCTION IF EXISTS public.notificacoes_minhas_rotinas();
CREATE OR REPLACE FUNCTION public.notificacoes_minhas_rotinas()
RETURNS TABLE(id bigint, tipo text, recorrencia text, gatilho text, titulo text, corpo text,
              hora_local smallint, minuto_local smallint, timezone text, prioridade integer,
              contexto jsonb, ativo boolean, proxima_execucao timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT a.id, a.tipo, a.recorrencia, a.gatilho, a.titulo, a.corpo,
         a.hora_local, a.minuto_local, a.timezone, a.prioridade,
         a.contexto, a.ativo, a.proxima_execucao
    FROM notificacoes_agendamentos a
   WHERE a.aluno_id = auth.uid()
   ORDER BY a.tipo
$fn$;
REVOKE ALL ON FUNCTION public.notificacoes_minhas_rotinas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificacoes_minhas_rotinas() TO authenticated;
"""

RELOAD = "NOTIFY pgrst, 'reload schema';"


def upgrade() -> None:
    op.execute(TABELAS)
    op.execute(RETENCAO)
    op.execute(config())
    op.execute(SILENCIO)
    op.execute(PROXIMA)
    for sql in remendos():
        op.execute(sql)
    op.execute(ROTINAS)
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(ROTINAS_ANTES)
    for sql in remendos(desfazer=True):
        op.execute(sql)
    op.execute(PROXIMA_ANTES)
    op.execute(SILENCIO_ANTES)
    chaves = ", ".join(_sql_texto(c) for c, _, _ in CONFIG)
    op.execute(f"DELETE FROM public.notificacoes_config WHERE chave IN ({chaves})")
    op.execute("DELETE FROM public.retencao_politica WHERE tabela = 'alunos_notificacao_preferencias'")
    op.execute(
        "ALTER TABLE public.notificacoes_agendamentos\n"
        "  DROP CONSTRAINT IF EXISTS notificacoes_agendamentos_horarios_check,\n"
        "  DROP CONSTRAINT IF EXISTS notificacoes_agendamentos_dias_semana_check,\n"
        "  DROP COLUMN IF EXISTS horarios,\n"
        "  DROP COLUMN IF EXISTS dias_semana;\n"
        "DROP TABLE IF EXISTS public.alunos_notificacao_preferencias;"
    )
    op.execute(RELOAD)
