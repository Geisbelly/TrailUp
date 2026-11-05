"""Notificações v2, fase 1: o motor ganha categorias, orçamento, intervalos e intensidade por aluno

Spec: `docs/superpowers/specs/2026-11-05-notificacoes-v2-design.md` (PR #962). Tudo no banco, pela
regra de fronteira: entregar notificação não tem modelo de linguagem no meio.

## Catálogo de tipos e categorias

`notificacoes_tipos` diz, para cada tipo, a categoria, o intervalo mínimo entre dois pushes daquele
tipo para o mesmo aluno, a prioridade base (0 a 3) e se ele fura o teto da categoria.
`notificacoes_categorias` dá o teto diário de pushes de cada categoria e o que fazer com o excedente:
`caixa` (entra na caixa de entrada, sem push) ou `suprime` (não entra). Os tipos das fases 3 e 4 já
vão no catálogo, para o motor saber tratá-los quando o produtor existir.

Tipo fora do catálogo cai na categoria `outros`: sem teto de categoria, sem intervalo do tipo, com o
excedente do teto global suprimido, que é o comportamento de antes.

O app lê o catálogo (para a tela de notificações da fase 2), então ele tem policy de SELECT para
`authenticated`. Só leitura: os números são decisão de produto, gravados por migração.

## O que `notificacoes_entregar` passa a fazer

Na ordem, para cada pendente pronta:

1. **Silenciado** e **texto fora da guarda**: como antes.
2. **Teto global** do dia, que agora vem da intensidade do aluno (abaixo) em vez de ser o mesmo
   para todos.
3. **Teto da categoria**, contado sobre os pushes do dia local. `prazo_2h` e `recado_professor`
   furam o teto da categoria, nunca o global.
4. **Intervalo do tipo** (ex.: `pausa_saudavel`, 3 h) e **intervalo global** entre dois pushes
   quaisquer (`intervalo_global_min`, 30 min; prioridade 3 não espera). Quem não pode sair agora é
   **adiado**: o `horario` vai para quando o intervalo vence (fora do silêncio), e a varredura de 5
   em 5 minutos entrega. Se o adiamento passar da expiração, vale o excedente da categoria.
5. **Excedente** (teto ou intervalo além da expiração): `caixa` grava na caixa com
   `contexto.sem_push` = motivo e não manda push; `suprime` marca a pendente como `suprimida`.
   Sugestão da IA nunca vai para a caixa sem push: é um empurrão com hora, e velho não serve.

**A ordem entre pendentes** é a prioridade efetiva:
`GREATEST(prioridade da pendente, prioridade base do tipo) + peso do perfil`, com o peso da matriz de
Monterrat lido pelo **perfil da tela** (`notificacoes_perfil_do_aluno`). Quem disputa a mesma vaga com
um tipo que combina mais com o perfil fica para depois.

**O perfil não corta mais** (decisão de 05/11: "despriorizar, não tirar"). `perfil_peso_minimo_pct`
vai a 0. `notificacoes_destino` continua igual e ainda corta quem silenciou; com o mínimo em 0, o
peso só ordena. Voltar a cortar é mudar um número em `notificacoes_config`.

Contadores: `aluno_atividade_diaria.notificacoes_dia` passa a contar só o que saiu com push. É o que o
teto global mede.

## Chat e convites pelo motor

`social_notificar_evento` gravava direto em `notificacoes` e mandava push, por fora de teto,
silêncio e foco. Agora ele enfileira (`dedupe_key` = `social:` + a chave de antes, então a mesma
mensagem continua avisando uma vez só) e chama `notificacoes_entregar` na hora. Sai na hora quando
pode; senão segue as mesmas regras de todo o resto. A linha da caixa continua com `origem = 'motor'`.

## Intensidade por aluno

`aluno_notificacao_intensidade` (só `SECURITY DEFINER`; o aluno não lê nem escreve, decisão de 05/11)
guarda o nível de cada aluno, recalculado todo dia pelo `pg_cron`
(`trailup_notificacoes_intensidade`, 06:10 UTC):

| Nível | Teto/dia | Regra (limiares em `notificacoes_config`) |
|---|---|---|
| `baixa` | 3 | empenho `quase_abandonando` ou `inativo`; ou 10+ pushes em 14 dias com abertura < 10%; ou 2+ tipos silenciados |
| `alta` | 8 | 10+ pushes em 14 dias, abertura >= 40% e uso em 4+ dos últimos 7 dias |
| `normal` | `max_por_dia` (6) | o resto, e quem ainda não tem linha |

O empenho vem de `vw_metricas_engajamento_aluno_classe` (modelo de evasão do core, `20261031_08`,
e os sinais de inativo, evadido e estagnado): na pior turma do aluno, `evadido` ou faixa `alto` é
`quase_abandonando`, inativo é `inativo`, estagnado é `estagnado`, `atencao` é `oscilando`, o resto é
`engajado`; sem dado, nulo. Ler a view nunca derruba o cálculo: falha vira empenho nulo. Quem está
saindo recebe menos, não mais (spec, "Estado alvo").

Cada troca de nível vai para `aluno_notificacao_intensidade_log`, append-only, com as entradas do
cálculo, para a análise. As duas tabelas entram em `retencao_politica` como `vida_da_conta`: saem com
o aluno pela FK.

Revision ID: 20261105_03
Revises: 20261105_02
Create Date: 2026-11-05
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261105_03"
down_revision = "20261105_02"
branch_labels = None
depends_on = None

JOB = "trailup_notificacoes_intensidade"
CRON = "10 6 * * *"

# (categoria, teto de pushes por dia, excedente)
CATEGORIAS: list[tuple[str, int, str]] = [
    ("estudo", 2, "suprime"),
    ("turma", 3, "caixa"),
    ("social", 3, "caixa"),
    ("competicao", 2, "suprime"),
    ("conquista", 2, "caixa"),
]

# (tipo, categoria, intervalo em minutos, prioridade base, fura o teto da categoria)
TIPOS: list[tuple[str, str, int, int, bool]] = [
    # estudo
    ("revisao_diaria", "estudo", 6 * 60, 1, False),  # 6 h: a fase 2 deixa ter até 3 horários por dia
    ("retomada_login", "estudo", 20 * 60, 1, False),
    ("pausa_saudavel", "estudo", 3 * 60, 1, False),
    ("lembrete", "estudo", 12 * 60, 2, False),
    ("suporte", "estudo", 12 * 60, 2, False),
    ("sequencia", "estudo", 20 * 60, 1, False),
    # turma
    ("novo_material", "turma", 6 * 60, 1, False),
    ("conteudo_novo", "turma", 6 * 60, 1, False),
    ("atividade_nova", "turma", 3 * 60, 2, False),
    ("missao_nova", "turma", 3 * 60, 2, False),
    ("prazo_24h", "turma", 6 * 60, 2, False),
    ("prazo_2h", "turma", 60, 3, True),
    ("evento_abrindo", "turma", 2 * 60, 2, False),
    ("evento_terminando", "turma", 2 * 60, 2, False),
    ("alteracao", "turma", 3 * 60, 2, False),
    ("recado_professor", "turma", 0, 3, True),
    # social
    ("chat_privado", "social", 10, 2, False),
    ("guilda_mensagem", "social", 30, 1, False),
    ("guilda_convite", "social", 60, 2, False),
    ("social_convite_recebido", "social", 60, 2, False),
    ("social_convite_aceito", "social", 60, 1, False),
    ("amigo_rank", "social", 12 * 60, 1, False),
    # competição
    ("rank", "competicao", 12 * 60, 1, False),  # vira rank_subiu na fase 4
    ("rank_subiu", "competicao", 12 * 60, 1, False),
    ("rank_caiu", "competicao", 24 * 60, 1, False),
    ("batalha_desafio", "competicao", 60, 2, False),
    ("batalha_resultado", "competicao", 3 * 60, 1, False),
    # conquista
    ("conquista", "conquista", 60, 1, False),
]

# (chave, valor, descrição)
CONFIG: list[tuple[str, str, str]] = [
    ("intervalo_global_min", "30", "Minutos mínimos entre dois pushes quaisquer. Prioridade 3 não espera."),
    ("intensidade_janela_dias", "14", "Dias de pushes lidos para a taxa de abertura da intensidade."),
    ("intensidade_min_pushes", "10", "Pushes na janela abaixo dos quais a abertura não decide o nível."),
    ("intensidade_abertura_baixa_pct", "10", "Abertura abaixo da qual o aluno vai para intensidade baixa."),
    ("intensidade_abertura_alta_pct", "40", "Abertura a partir da qual o aluno pode ir para intensidade alta."),
    ("intensidade_dias_uso_alta", "4", "Dias de uso nos últimos 7 para a intensidade alta."),
    ("intensidade_silenciados_baixa", "2", "Tipos silenciados a partir dos quais a intensidade é baixa."),
    ("intensidade_teto_baixa", "3", "Teto diário de pushes na intensidade baixa."),
    ("intensidade_teto_alta", "8", "Teto diário de pushes na intensidade alta. A normal usa max_por_dia."),
]

PESO_MINIMO_ANTES = "50"


def _sql_texto(valor: str) -> str:
    return "'" + valor.replace("'", "''") + "'"


def _valores(linhas: list[tuple]) -> str:
    def _v(x):
        if isinstance(x, bool):
            return "TRUE" if x else "FALSE"
        if isinstance(x, int):
            return str(x)
        return _sql_texto(x)

    return ",\n".join("  (" + ", ".join(_v(x) for x in linha) + ")" for linha in linhas)


TABELAS = f"""
CREATE TABLE IF NOT EXISTS public.notificacoes_categorias (
  categoria  text PRIMARY KEY,
  teto_dia   integer NOT NULL CHECK (teto_dia >= 0),
  excedente  text NOT NULL CHECK (excedente IN ('caixa', 'suprime'))
);
CREATE TABLE IF NOT EXISTS public.notificacoes_tipos (
  tipo                text PRIMARY KEY,
  categoria           text NOT NULL REFERENCES public.notificacoes_categorias (categoria),
  intervalo_min       integer NOT NULL DEFAULT 0 CHECK (intervalo_min >= 0),
  prioridade_base     smallint NOT NULL DEFAULT 0 CHECK (prioridade_base BETWEEN 0 AND 3),
  fura_teto_categoria boolean NOT NULL DEFAULT FALSE
);
COMMENT ON TABLE public.notificacoes_tipos IS
  'Catálogo do motor de notificações (20261105_03): categoria, intervalo mínimo entre pushes do tipo, prioridade base.';

ALTER TABLE public.notificacoes_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes_tipos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notificacoes_categorias, public.notificacoes_tipos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notificacoes_categorias, public.notificacoes_tipos TO authenticated;
DROP POLICY IF EXISTS notificacoes_categorias_sel ON public.notificacoes_categorias;
CREATE POLICY notificacoes_categorias_sel ON public.notificacoes_categorias FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS notificacoes_tipos_sel ON public.notificacoes_tipos;
CREATE POLICY notificacoes_tipos_sel ON public.notificacoes_tipos FOR SELECT TO authenticated USING (true);

INSERT INTO public.notificacoes_categorias (categoria, teto_dia, excedente) VALUES
{_valores(CATEGORIAS)}
ON CONFLICT (categoria) DO UPDATE SET teto_dia = EXCLUDED.teto_dia, excedente = EXCLUDED.excedente;

INSERT INTO public.notificacoes_tipos (tipo, categoria, intervalo_min, prioridade_base, fura_teto_categoria) VALUES
{_valores(TIPOS)}
ON CONFLICT (tipo) DO UPDATE SET categoria = EXCLUDED.categoria, intervalo_min = EXCLUDED.intervalo_min,
  prioridade_base = EXCLUDED.prioridade_base, fura_teto_categoria = EXCLUDED.fura_teto_categoria;

-- Intensidade: só SECURITY DEFINER lê e escreve. Sem policy de propósito: o aluno não vê o próprio
-- nível (decisão de 05/11) e o console lê por RPC quando a tela existir.
CREATE TABLE IF NOT EXISTS public.aluno_notificacao_intensidade (
  aluno_id       uuid PRIMARY KEY REFERENCES public.alunos (id) ON DELETE CASCADE,
  nivel          text NOT NULL CHECK (nivel IN ('baixa', 'normal', 'alta')),
  teto           integer NOT NULL CHECK (teto >= 0),
  empenho        text,
  pushes_janela  integer NOT NULL DEFAULT 0,
  abertas_janela integer NOT NULL DEFAULT 0,
  silenciados    integer NOT NULL DEFAULT 0,
  dias_uso_7     integer NOT NULL DEFAULT 0,
  calculado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.aluno_notificacao_intensidade_log (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aluno_id  uuid NOT NULL REFERENCES public.alunos (id) ON DELETE CASCADE,
  de        text,
  para      text NOT NULL,
  entradas  jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  em        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aluno_notificacao_intensidade_log_aluno_idx
  ON public.aluno_notificacao_intensidade_log (aluno_id, em DESC);
ALTER TABLE public.aluno_notificacao_intensidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aluno_notificacao_intensidade_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aluno_notificacao_intensidade, public.aluno_notificacao_intensidade_log
  FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.aluno_notificacao_intensidade IS
  'Nível de notificação por aluno, calculado pelo banco (20261105_03). Sem policy: só funções SECURITY DEFINER.';
"""


RETENCAO = """
INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo) VALUES
  ('aluno_notificacao_intensidade', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'nivel de notificacao calculado pelo banco; sai com a conta pela FK'),
  ('aluno_notificacao_intensidade_log', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'historico das trocas de nivel de notificacao; sai com a conta pela FK')
ON CONFLICT (tabela, acao) DO NOTHING;
"""


def config() -> str:
    linhas = ",\n".join(f"  ({_sql_texto(c)}, {_sql_texto(v)}, {_sql_texto(d)})" for c, v, d in CONFIG)
    return (
        "INSERT INTO public.notificacoes_config (chave, valor, descricao) VALUES\n"
        + linhas
        + "\nON CONFLICT (chave) DO NOTHING;\n"
        + "UPDATE public.notificacoes_config SET valor = '0' WHERE chave = 'perfil_peso_minimo_pct';\n"
    )


FUNCOES_AUXILIARES = r"""
-- Peso do perfil da tela para o tipo, de 0 a 1. Tipo fora da matriz: 0,5 (neutro).
CREATE OR REPLACE FUNCTION public.notificacoes_peso_perfil(p_aluno uuid, p_tipo text)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_pesos text := public.notificacoes_cfg_txt('perfil_pesos_' || COALESCE(p_tipo, ''), '');
BEGIN
  IF v_pesos = '' THEN
    RETURN 0.5;
  END IF;
  RETURN LEAST(1, GREATEST(0, COALESCE(
    (v_pesos::jsonb ->> public.notificacoes_perfil_do_aluno(p_aluno))::numeric, 0)));
EXCEPTION WHEN OTHERS THEN
  RETURN 0.5;  -- matriz ilegível não muda a ordem de ninguém
END;
$fn$;

-- Teto global de pushes do aluno hoje: o da intensidade, ou max_por_dia.
CREATE OR REPLACE FUNCTION public.notificacoes_teto_do_aluno(p_aluno uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(
    (SELECT i.teto FROM aluno_notificacao_intensidade i WHERE i.aluno_id = p_aluno),
    public.notificacoes_cfg_int('max_por_dia', 6)
  )
$fn$;

-- Empenho na pior turma do aluno, pelo modelo de evasão e pelos sinais de inativo e estagnado.
CREATE OR REPLACE FUNCTION public.notificacoes_empenho_do_aluno(p_aluno uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_empenho text;
BEGIN
  SELECT CASE
           WHEN bool_or(v.evadido_desde IS NOT NULL OR v.risco_abandono_faixa = 'alto') THEN 'quase_abandonando'
           WHEN bool_or(v.inativo_desde IS NOT NULL) THEN 'inativo'
           WHEN bool_or(v.estagnado_desde IS NOT NULL) THEN 'estagnado'
           WHEN bool_or(v.risco_abandono_faixa = 'atencao') THEN 'oscilando'
           WHEN bool_and(COALESCE(v.sem_dado, FALSE)) THEN NULL
           ELSE 'engajado'
         END
    INTO v_empenho
    FROM vw_metricas_engajamento_aluno_classe v
   WHERE v.aluno_id = p_aluno;
  RETURN v_empenho;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;  -- view fora do ar é empenho desconhecido, nunca erro
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notificacoes_calcular_intensidade(p_aluno uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_janela  integer := public.notificacoes_cfg_int('intensidade_janela_dias', 14);
  v_min     integer := public.notificacoes_cfg_int('intensidade_min_pushes', 10);
  v_baixa   integer := public.notificacoes_cfg_int('intensidade_abertura_baixa_pct', 10);
  v_alta    integer := public.notificacoes_cfg_int('intensidade_abertura_alta_pct', 40);
  v_dias_a  integer := public.notificacoes_cfg_int('intensidade_dias_uso_alta', 4);
  v_sil_b   integer := public.notificacoes_cfg_int('intensidade_silenciados_baixa', 2);
  v_pushes  integer;
  v_abertas integer;
  v_sil     integer;
  v_dias    integer;
  v_empenho text := public.notificacoes_empenho_do_aluno(p_aluno);
  v_nivel   text := 'normal';
  v_teto    integer;
  v_antes   text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE n.read)
    INTO v_pushes, v_abertas
    FROM notificacoes n
   WHERE n.aluno_id = p_aluno
     AND n.origem IN ('motor', 'social')
     AND NOT (COALESCE(n.contexto, '{}'::jsonb) ? 'sem_push')
     AND n.horario_envio > now() - make_interval(days => v_janela);
  SELECT count(*) INTO v_sil FROM notificacoes_silenciadas s WHERE s.aluno_id = p_aluno;
  SELECT count(DISTINCT d.dia) INTO v_dias
    FROM aluno_atividade_diaria d
   WHERE d.aluno_id = p_aluno AND d.dia > current_date - 7 AND COALESCE(d.tempo_uso_seg, 0) >= 60;

  IF v_empenho IN ('quase_abandonando', 'inativo')
     OR v_sil >= v_sil_b
     OR (v_pushes >= v_min AND v_abertas * 100 < v_baixa * v_pushes) THEN
    v_nivel := 'baixa';
  ELSIF v_pushes >= v_min AND v_abertas * 100 >= v_alta * v_pushes AND v_dias >= v_dias_a THEN
    v_nivel := 'alta';
  END IF;
  v_teto := CASE v_nivel
              WHEN 'baixa' THEN public.notificacoes_cfg_int('intensidade_teto_baixa', 3)
              WHEN 'alta'  THEN public.notificacoes_cfg_int('intensidade_teto_alta', 8)
              ELSE public.notificacoes_cfg_int('max_por_dia', 6)
            END;

  SELECT i.nivel INTO v_antes FROM aluno_notificacao_intensidade i WHERE i.aluno_id = p_aluno;
  INSERT INTO aluno_notificacao_intensidade AS i (
    aluno_id, nivel, teto, empenho, pushes_janela, abertas_janela, silenciados, dias_uso_7, calculado_em
  ) VALUES (p_aluno, v_nivel, v_teto, v_empenho, v_pushes, v_abertas, v_sil, v_dias, now())
  ON CONFLICT (aluno_id) DO UPDATE
    SET nivel = EXCLUDED.nivel, teto = EXCLUDED.teto, empenho = EXCLUDED.empenho,
        pushes_janela = EXCLUDED.pushes_janela, abertas_janela = EXCLUDED.abertas_janela,
        silenciados = EXCLUDED.silenciados, dias_uso_7 = EXCLUDED.dias_uso_7, calculado_em = now();
  IF v_antes IS DISTINCT FROM v_nivel THEN
    INSERT INTO aluno_notificacao_intensidade_log (aluno_id, de, para, entradas)
    VALUES (p_aluno, v_antes, v_nivel, jsonb_build_object(
      'empenho', v_empenho, 'pushes', v_pushes, 'abertas', v_abertas,
      'silenciados', v_sil, 'dias_uso_7', v_dias));
  END IF;
  RETURN v_nivel;
END;
$fn$;

-- Cron diário. Um aluno com problema não impede os outros.
CREATE OR REPLACE FUNCTION public.notificacoes_recalcular_intensidades()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_aluno uuid;
  v_ok integer := 0;
  v_falhas integer := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('trailup_notificacoes_intensidade')) THEN
    RETURN jsonb_build_object('pulou', true);
  END IF;
  FOR v_aluno IN SELECT DISTINCT ca.aluno_id FROM classe_aluno ca LOOP
    BEGIN
      PERFORM public.notificacoes_calcular_intensidade(v_aluno);
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_falhas := v_falhas + 1;
      RAISE WARNING USING MESSAGE = 'intensidade de ' || v_aluno::text || ': ' || SQLERRM;
    END;
  END LOOP;
  RETURN jsonb_build_object('calculados', v_ok, 'falhas', v_falhas);
END;
$fn$;

REVOKE ALL ON FUNCTION public.notificacoes_peso_perfil(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_teto_do_aluno(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_empenho_do_aluno(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_calcular_intensidade(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_recalcular_intensidades() FROM PUBLIC, anon, authenticated;
"""

ENTREGAR = r"""
CREATE OR REPLACE FUNCTION public.notificacoes_entregar(
  p_aluno uuid, p_gatilhos text[] DEFAULT ARRAY['horario'::text, 'login'::text]
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_teto      integer := public.notificacoes_teto_do_aluno(p_aluno);
  v_global    integer := public.notificacoes_cfg_int('intervalo_global_min', 30);
  v_foco      text := public.notificacoes_em_foco(p_aluno);
  v_tz        text;
  v_dia       date;
  v_inicio    timestamptz;
  v_hoje      integer;
  v_reg       record;
  v_cat_teto  integer;
  v_cat_exc   text;
  v_id        bigint;
  v_n         integer := 0;
  v_prio      integer;
  v_motivo    text;
  v_adiar     timestamptz;
  v_ultimo    timestamptz;
  v_na_cat    integer;
  v_excedente text;
BEGIN
  -- Vencida e marcada, nao entregue: "volte a estudar hoje" tres dias depois e
  -- pior que nada. Vale tambem para a segurada no foco.
  UPDATE notificacoes_pendentes
     SET status = 'expirada', atualizado_em = now()
   WHERE aluno_id = p_aluno
     AND status = 'pendente'
     AND expira_em IS NOT NULL
     AND expira_em <= now();

  -- Em foco nada sai: o que estaria pronto agora passa a esperar o fim do foco.
  IF v_foco IS NOT NULL THEN
    UPDATE notificacoes_pendentes p
       SET gatilho = 'fim_foco',
           contexto = COALESCE(p.contexto, '{}'::jsonb)
                      || jsonb_build_object('gatilho_original', p.gatilho,
                                            'segurada_em', now(), 'foco', v_foco),
           atualizado_em = now()
     WHERE p.aluno_id = p_aluno
       AND p.status = 'pendente'
       AND p.gatilho = ANY(p_gatilhos)
       AND (p.gatilho <> 'horario' OR p.horario <= now());
    RETURN 0;
  END IF;

  -- Saida do foco sem enxurrada: uma por tipo.
  WITH seguradas AS (
    SELECT p.id,
           row_number() OVER (PARTITION BY p.tipo
                              ORDER BY COALESCE(p.prioridade, 0) DESC, p.horario DESC NULLS LAST,
                                       p.id DESC) AS ordem,
           count(*) OVER (PARTITION BY p.tipo) AS total
      FROM notificacoes_pendentes p
     WHERE p.aluno_id = p_aluno AND p.status = 'pendente' AND p.gatilho = 'fim_foco'
  ),
  colapsadas AS (
    UPDATE notificacoes_pendentes p
       SET status = 'colapsada', ultimo_erro = 'colapsada no fim do foco', atualizado_em = now()
      FROM seguradas s
     WHERE p.id = s.id AND s.ordem > 1
    RETURNING p.id
  )
  UPDATE notificacoes_pendentes p
     SET contexto = COALESCE(p.contexto, '{}'::jsonb)
                    || jsonb_build_object('colapsadas', s.total - 1),
         atualizado_em = now()
    FROM seguradas s
   WHERE p.id = s.id AND s.ordem = 1 AND s.total > 1;

  -- Ordem: prioridade efetiva = max(prioridade da pendente, base do tipo) + peso do perfil da tela.
  FOR v_reg IN
    SELECT p.*,
           COALESCE(t.categoria, 'outros') AS v2_categoria,
           COALESCE(t.intervalo_min, 0) AS v2_intervalo,
           COALESCE(t.prioridade_base, 0) AS v2_base,
           COALESCE(t.fura_teto_categoria, FALSE) AS v2_fura
      FROM notificacoes_pendentes p
      LEFT JOIN notificacoes_tipos t ON t.tipo = p.tipo
     WHERE p.aluno_id = p_aluno
       AND p.status = 'pendente'
       AND (p.gatilho = 'fim_foco' OR p.gatilho = ANY(p_gatilhos))
       AND (p.gatilho <> 'horario' OR p.horario <= now())
       AND (p.expira_em IS NULL OR p.expira_em > now())
     ORDER BY GREATEST(COALESCE(p.prioridade, 0), COALESCE(t.prioridade_base, 0))
              + public.notificacoes_peso_perfil(p_aluno, p.tipo) DESC,
              p.horario ASC
       FOR UPDATE OF p SKIP LOCKED
  LOOP
    -- Silenciado depois de entrar na fila: nao sai.
    IF EXISTS (SELECT 1 FROM notificacoes_silenciadas s
                WHERE s.aluno_id = p_aluno AND s.tipo = v_reg.tipo) THEN
      UPDATE notificacoes_pendentes
         SET status = 'suprimida', ultimo_erro = 'silenciado', atualizado_em = now()
       WHERE id = v_reg.id;
      CONTINUE;
    END IF;

    -- Texto da IA aprovado por guarda mais velha que a de hoje, ou sem guarda nenhuma, nao sai
    -- (20261102_24).
    IF v_reg.sugestao_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM notificacoes_ia s
                    WHERE s.id = v_reg.sugestao_id AND s.origem = 'ciclo')
       AND (CASE WHEN COALESCE(v_reg.contexto->>'texto_guarda', '') ~ '^[0-9]{1,6}$'
                 THEN (v_reg.contexto->>'texto_guarda')::integer ELSE 0 END)
           < public.notificacoes_cfg_int('texto_guarda_versao_minima', 0) THEN
      UPDATE notificacoes_pendentes
         SET status = 'suprimida', ultimo_erro = 'texto_fora_da_guarda', atualizado_em = now()
       WHERE id = v_reg.id;
      UPDATE notificacoes_ia
         SET status = 'suprimida', motivo = 'texto_fora_da_guarda'
       WHERE id = v_reg.sugestao_id;
      CONTINUE;
    END IF;

    v_tz := public.notificacoes_tz(COALESCE(v_reg.contexto->>'timezone', 'UTC'));
    v_dia := public.notificacoes_dia_local(v_tz);
    v_inicio := v_dia::timestamp AT TIME ZONE v_tz;
    v_prio := GREATEST(COALESCE(v_reg.prioridade, 0), v_reg.v2_base);
    v_motivo := NULL;
    v_adiar := NULL;
    v_cat_teto := NULL;
    v_cat_exc := NULL;
    SELECT c.teto_dia, c.excedente INTO v_cat_teto, v_cat_exc
      FROM notificacoes_categorias c WHERE c.categoria = v_reg.v2_categoria;

    -- 1. Teto global (intensidade do aluno), sobre os pushes do dia.
    SELECT COALESCE(notificacoes_dia, 0) INTO v_hoje
      FROM aluno_atividade_diaria WHERE aluno_id = p_aluno AND dia = v_dia;
    v_hoje := COALESCE(v_hoje, 0);
    IF v_teto > 0 AND v_hoje >= v_teto THEN
      v_motivo := 'teto_diario';
    END IF;

    -- 2. Teto da categoria, sobre os pushes do dia local.
    IF v_motivo IS NULL AND NOT v_reg.v2_fura AND v_cat_teto IS NOT NULL AND v_cat_teto > 0 THEN
      SELECT count(*) INTO v_na_cat
        FROM notificacoes n
        JOIN notificacoes_tipos t ON t.tipo = n.tipo
       WHERE n.aluno_id = p_aluno
         AND n.horario_envio >= v_inicio
         AND n.origem IN ('motor', 'social')
         AND NOT (COALESCE(n.contexto, '{}'::jsonb) ? 'sem_push')
         AND t.categoria = v_reg.v2_categoria;
      IF v_na_cat >= v_cat_teto THEN
        v_motivo := 'orcamento_categoria';
      END IF;
    END IF;

    -- 3. Intervalo do tipo e intervalo global: adia em vez de descartar.
    IF v_motivo IS NULL THEN
      IF v_reg.v2_intervalo > 0 THEN
        SELECT max(n.horario_envio) INTO v_ultimo
          FROM notificacoes n
         WHERE n.aluno_id = p_aluno AND n.tipo = v_reg.tipo
           AND n.origem IN ('motor', 'social')
           AND NOT (COALESCE(n.contexto, '{}'::jsonb) ? 'sem_push')
           AND n.horario_envio > now() - make_interval(mins => v_reg.v2_intervalo);
        IF v_ultimo IS NOT NULL THEN
          v_adiar := v_ultimo + make_interval(mins => v_reg.v2_intervalo);
        END IF;
      END IF;
      IF v_prio < 3 AND v_global > 0 THEN
        SELECT max(n.horario_envio) INTO v_ultimo
          FROM notificacoes n
         WHERE n.aluno_id = p_aluno
           AND n.origem IN ('motor', 'social')
           AND NOT (COALESCE(n.contexto, '{}'::jsonb) ? 'sem_push')
           AND n.horario_envio > now() - make_interval(mins => v_global);
        IF v_ultimo IS NOT NULL THEN
          v_adiar := GREATEST(v_adiar, v_ultimo + make_interval(mins => v_global));
        END IF;
      END IF;
      IF v_adiar IS NOT NULL THEN
        v_adiar := public.notificacoes_fora_do_silencio(v_tz, v_adiar);
        IF v_reg.expira_em IS NULL OR v_adiar < v_reg.expira_em THEN
          UPDATE notificacoes_pendentes p
             SET horario = v_adiar, gatilho = 'horario',
                 contexto = COALESCE(p.contexto, '{}'::jsonb)
                            || jsonb_build_object('adiada_por', 'intervalo', 'adiada_em', now()),
                 atualizado_em = now()
           WHERE p.id = v_reg.id;
          CONTINUE;
        END IF;
        v_motivo := 'intervalo';
      END IF;
    END IF;

    -- 4. Excedente: caixa sem push ou suprimida. Sugestão da IA nunca fica sem push na caixa.
    IF v_motivo IS NOT NULL THEN
      v_excedente := CASE WHEN v_reg.sugestao_id IS NOT NULL THEN 'suprime'
                          ELSE COALESCE(v_cat_exc, 'suprime') END;
      IF v_excedente = 'suprime' THEN
        UPDATE notificacoes_pendentes
           SET status = 'suprimida', ultimo_erro = v_motivo, atualizado_em = now()
         WHERE id = v_reg.id;
        IF v_reg.sugestao_id IS NOT NULL THEN
          UPDATE notificacoes_ia
             SET status = 'suprimida', motivo = v_motivo
           WHERE id = v_reg.sugestao_id AND status = 'sugerida';
        END IF;
        CONTINUE;
      END IF;
    END IF;

    -- A linha na caixa de entrada vem ANTES do push: se o push falhar o aluno
    -- ainda ve a notificacao ao abrir o app.
    INSERT INTO notificacoes (
      aluno_id, titulo, corpo, tipo, horario_envio, status, read,
      origem, origem_id, contexto
    )
    VALUES (
      p_aluno, COALESCE(v_reg.titulo, 'TrailUp'), COALESCE(v_reg.corpo, ''), v_reg.tipo,
      now(), 'enviada', FALSE, 'motor', v_reg.id,
      COALESCE(v_reg.contexto, '{}'::jsonb)
        || jsonb_build_object('categoria', v_reg.v2_categoria)
        || CASE WHEN v_motivo IS NOT NULL THEN jsonb_build_object('sem_push', v_motivo)
                ELSE '{}'::jsonb END
    )
    RETURNING id INTO v_id;

    UPDATE notificacoes_pendentes
       SET status = 'entregue', entregue_em = now(),
           notificacao_id = v_id, atualizado_em = now()
     WHERE id = v_reg.id;

    IF v_reg.sugestao_id IS NOT NULL THEN
      UPDATE notificacoes_ia
         SET status = 'promovida', promovida_em = now(), pendente_id = v_reg.id
       WHERE id = v_reg.sugestao_id;
    END IF;

    IF v_motivo IS NULL THEN
      INSERT INTO aluno_atividade_diaria (aluno_id, dia, notificacoes_dia)
      VALUES (p_aluno, v_dia, 1)
      ON CONFLICT (aluno_id, dia) DO UPDATE
        SET notificacoes_dia = aluno_atividade_diaria.notificacoes_dia + 1,
            atualizado_em = now();

      PERFORM public.notificacoes_enviar_push(
        p_aluno, v_id, COALESCE(v_reg.titulo, 'TrailUp'), COALESCE(v_reg.corpo, ''),
        COALESCE(v_reg.contexto, '{}'::jsonb) - 'texto', v_prio
      );
    END IF;

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$fn$;
"""

SOCIAL = r"""
-- Chat e convites entram pelo motor: mesmas regras de teto, silêncio, foco e intervalo.
CREATE OR REPLACE FUNCTION public.social_notificar_evento(
  p_aluno_id uuid, p_titulo text, p_corpo text, p_tipo text, p_dedupe_key text,
  p_dados jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_tz   text;
  v_gat  text := 'horario';
  v_hor  timestamptz;
  v_pend bigint;
  v_id   bigint;
BEGIN
  IF p_aluno_id IS NULL OR public.notificacoes_destino(p_aluno_id, p_tipo) IS NOT NULL THEN
    RETURN NULL;
  END IF;
  SELECT d.timezone INTO v_tz
    FROM expo_tokens d
   WHERE d.aluno_id = p_aluno_id AND d.ativo
   ORDER BY d.ultima_atividade_em DESC
   LIMIT 1;
  IF NOT FOUND THEN
    v_gat := 'login';
  END IF;
  v_tz := public.notificacoes_tz(v_tz);
  v_hor := public.notificacoes_fora_do_silencio(v_tz, now());

  INSERT INTO notificacoes_pendentes (
    aluno_id, tipo, contexto, titulo, corpo, horario, status, prioridade, gatilho, expira_em, dedupe_key
  ) VALUES (
    p_aluno_id, p_tipo,
    COALESCE(p_dados, '{}'::jsonb) || jsonb_build_object(
      'dia', public.notificacoes_dia_local(v_tz, v_hor)::text, 'timezone', v_tz,
      'motivo', 'social', 'dedupe_key', p_dedupe_key, 'tipo', p_tipo),
    p_titulo, p_corpo, v_hor, 'pendente', 0, v_gat,
    v_hor + make_interval(hours => public.notificacoes_cfg_int('expiracao_padrao_horas', 48)),
    'social:' || p_dedupe_key
  )
  ON CONFLICT (aluno_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_pend;

  IF v_pend IS NULL THEN
    RETURN NULL;  -- o mesmo evento já avisou
  END IF;
  PERFORM public.notificacoes_entregar(p_aluno_id, ARRAY[v_gat]);
  SELECT p.notificacao_id INTO v_id FROM notificacoes_pendentes p WHERE p.id = v_pend;
  RETURN v_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.social_notificar_evento(uuid, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
"""

# Como a `20261002_02` deixou, conferido em produção em 05/11/2026.
SOCIAL_ANTES = r"""
CREATE OR REPLACE FUNCTION public.social_notificar_evento(
  p_aluno_id uuid, p_titulo text, p_corpo text, p_tipo text, p_dedupe_key text,
  p_dados jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.notificacoes (
    aluno_id, titulo, corpo, tipo, horario_envio, status, read,
    origem, contexto
  ) VALUES (
    p_aluno_id, p_titulo, p_corpo, p_tipo, now(), 'enviada', false,
    'social', COALESCE(p_dados, '{}'::jsonb) || jsonb_build_object('dedupe_key', p_dedupe_key)
  )
  ON CONFLICT (aluno_id, origem, ((contexto ->> 'dedupe_key')))
    WHERE origem = 'social' DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    PERFORM public.notificacoes_enviar_push(
      p_aluno_id, v_id, p_titulo, p_corpo,
      COALESCE(p_dados, '{}'::jsonb) || jsonb_build_object('tipo', p_tipo), 1
    );
  END IF;
  RETURN v_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.social_notificar_evento(uuid, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
"""

CRON_SQL = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
    PERFORM cron.schedule('{JOB}', '{CRON}', 'SELECT public.notificacoes_recalcular_intensidades()');
  END IF;
END $$
"""

CRON_FORA = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB}');
  END IF;
END $$
"""

RELOAD = "NOTIFY pgrst, 'reload schema';"


def entregar_anterior() -> str:
    """`notificacoes_entregar` como a `20261102_24` a deixou (a versão em produção antes desta)."""
    caminho = Path(__file__).with_name("20261102_24_notificacao_so_com_texto_da_guarda.py")
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {caminho.name}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo.entregar_nova()


def upgrade() -> None:
    op.execute(TABELAS)
    op.execute(RETENCAO)
    op.execute(config())
    op.execute(FUNCOES_AUXILIARES)
    op.execute(ENTREGAR)
    op.execute(SOCIAL)
    op.execute(CRON_SQL)
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(CRON_FORA)
    op.execute(
        "DELETE FROM public.retencao_politica WHERE tabela IN "
        "('aluno_notificacao_intensidade', 'aluno_notificacao_intensidade_log')"
    )
    op.execute(SOCIAL_ANTES)
    op.execute(entregar_anterior())
    op.execute(
        "DROP FUNCTION IF EXISTS public.notificacoes_recalcular_intensidades();\n"
        "DROP FUNCTION IF EXISTS public.notificacoes_calcular_intensidade(uuid);\n"
        "DROP FUNCTION IF EXISTS public.notificacoes_empenho_do_aluno(uuid);\n"
        "DROP FUNCTION IF EXISTS public.notificacoes_teto_do_aluno(uuid);\n"
        "DROP FUNCTION IF EXISTS public.notificacoes_peso_perfil(uuid, text);\n"
        "DROP TABLE IF EXISTS public.aluno_notificacao_intensidade_log;\n"
        "DROP TABLE IF EXISTS public.aluno_notificacao_intensidade;\n"
        "DROP TABLE IF EXISTS public.notificacoes_tipos;\n"
        "DROP TABLE IF EXISTS public.notificacoes_categorias;"
    )
    chaves = ", ".join(_sql_texto(c) for c, _, _ in CONFIG)
    op.execute(f"DELETE FROM public.notificacoes_config WHERE chave IN ({chaves})")
    op.execute(
        "UPDATE public.notificacoes_config SET valor = "
        f"{_sql_texto(PESO_MINIMO_ANTES)} WHERE chave = 'perfil_peso_minimo_pct'"
    )
    op.execute(RELOAD)
