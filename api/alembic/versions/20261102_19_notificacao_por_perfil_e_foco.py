"""Notificação por perfil, por amizade e com modo de foco: para quem e quando cada tipo sai (#149)

O motor já tinha a fila (`notificacoes_pendentes`), a expiração, o dedupe e o teto diário
(`aluno_atividade_diaria.notificacoes_dia`). Faltava decidir **para quem** e **quando**. Tudo aqui é
banco, pela regra de fronteira: a API só passa a gravar o estado de atenção que ela já calcula.

## Para quem: a matriz de Monterrat em `notificacoes_config`

`perfil_pesos_<tipo>` guarda, em JSON, o peso de cada perfil BrainHex para aquele tipo de evento.
`notificacoes_destino(aluno, tipo)` lê o peso do **perfil dominante** (`notificacoes_perfil_dominante`,
a mesma ordem do resto do motor) e barra o evento abaixo de `perfil_peso_minimo_pct` (50):

| tipo | perfis que recebem (peso) |
|---|---|
| `rank` (a própria posição) | Conqueror 1,0 · Achiever 0,75 · Daredevil 0,63 · Mastermind 0,63 (Socializer 0,13: não recebe) |
| `amigo_rank` (amigo subiu) | Socializer 1,0 |
| `novo_material` | Seeker 0,88 · Achiever 1,0 |
| `sequencia` | Achiever 1,0 |

Tipo sem chave de pesos (`lembrete`, `suporte`, `conquista`...) não é filtrado por perfil. Matriz
ilegível não cala ninguém: o destino cai em "recebe". `novo_material` e `sequencia` ainda não têm
quem os produza; a matriz já os roteia quando o produtor existir (pela IA em `notificacoes_ia` ou por
`notificacoes_enfileirar_evento`).

O filtro roda na promoção da sugestão da IA (`notificacoes_ia_promover`: barrada vira `suprimida`, com
`motivo` = `perfil` ou `silenciado`) e em `notificacoes_enfileirar_evento`, a porta de entrada dos
eventos que o próprio banco produz.

## Silenciar é sinal de perfil

`notificacoes_silenciar_tipo` (RPC do app, no detalhe da notificação) grava o estado em
`notificacoes_silenciadas` e o fato em `notificacoes_silenciamento_log`, append-only, com o perfil
dominante e o vetor de afinidades **daquele momento**: é o próximo passo que Monterrat propõe (quem
desliga uma mecânica provavelmente não responde a ela). Silenciar suprime também o que já estava na
fila daquele tipo. Só os tipos que passam pelo motor (`tipos_silenciaveis`) são aceitos: os que
entram direto em `notificacoes` (chat, convite, conquista do gatilho) não seriam calados, e o botão
mentiria.

## Rank: snapshot estreito e notificação só da própria posição ou de amigo

`rank_posicao_anterior` guarda a última posição vista por (rank × aluno), e nada mais: não é a
`rank_posicoes` materializada que o ranking por view aposentou. `notificacoes_rank_varrer()` roda pelo
`pg_cron` a cada 10 min, lê `vw_rank_posicoes_por_classe_todas` só dos ranks em andamento e compara:

- primeira vez que vê o aluno no rank: só grava a base, não notifica;
- subiu, com pontuação > 0: avisa o próprio aluno (`rank`), se o perfil recebe; e avisa cada amigo
  (amizade `accepted`, matriculado na turma do rank) cujo perfil recebe `amigo_rank`, **só se a nova
  posição estiver dentro do corte** (`app_rank_limite_visivel()`, 15). Fora do corte o amigo não é
  nomeado. Ninguém é avisado sobre terceiro: o texto é sempre "você" ou o amigo;
- desceu: só com `rank_notificar_descida` = 1 (padrão 0, pela regra "no pressure" do épico #133).

Uma notificação por rank por dia (o dedupe carrega o dia); enquanto ela não sai, a mudança seguinte
reescreve o texto em vez de criar outra.

## Quando: modo de foco

`notificacoes_em_foco(aluno)` diz se o aluno está em foco e por quê:

- `aluno`: ele ligou o modo foco no app (`notificacoes_iniciar_foco`, 5 a `foco_duracao_max_min`);
- `estudo`: estado de atenção recente (até `atencao_validade_min`) e **não** desconcentrado. Liga e
  desliga por `foco_por_atencao`.

Desconcentrado é `score × 100 < atencao_limiar_baixa_pct` (40, o mesmo corte do Python hoje), e o
rótulo da API só vale quando o score falta. O limiar mora aqui para o piloto calibrar sem deploy: hoje
não há histórico (`ia_decision_logs` vazia). Desconcentrado não está em foco, então a entrega segue.
Estado velho também não: se a API parar de escrever, o foco implícito se desfaz sozinho em vez de
segurar a fila para sempre.

Durante o foco, `notificacoes_entregar` não entrega: o que estaria pronto passa a `gatilho =
'fim_foco'` (e guarda o gatilho original em `contexto`). Fora do foco, antes de entregar, as
seguradas são **colapsadas por tipo**: fica a de maior prioridade e, entre iguais, a mais recente; as
outras vão para `colapsada`. A que sai continua passando por `expira_em` e pelo teto diário, como
antes. `notificacoes_varrer` passa a visitar quem tem notificação segurada, então o fim do foco por
tempo entrega em até 5 min; `notificacoes_encerrar_foco` entrega na hora.

`notificacoes_enviar_push` também respeita o foco: chat, convite e conquista entram direto na caixa de
entrada (não passam pela fila) e, em foco, ficam lá sem push. Mesmo princípio do silêncio noturno: o
foco é sobre o aviso, a linha continua na caixa.

## Estado de atenção legível pelo banco

`aluno_estado_atencao` (aluno, estado, score, desde, atualizado_em): a API escreve ao fim de cada
ciclo (`EstadoAtencaoRepository`); o motor lê. **Sem policy, de propósito**: é inferência sobre o
aluno, só a API (`service_role`) e as funções `SECURITY DEFINER` do motor a leem. O aluno vê só o
efeito (`notificacoes_meu_foco` devolve `origem = 'estudo'`).

## Tabelas e RLS

- `aluno_modo_foco` e `notificacoes_silenciadas`: o aluno lê as próprias linhas (policy `_sel`);
  escrita só pelas RPCs.
- `notificacoes_silenciamento_log`: o aluno lê o próprio histórico; escrita só pela RPC.
- `aluno_estado_atencao` e `rank_posicao_anterior`: sem policy, de propósito (só `service_role` e as
  funções do motor). GRANTs de `anon`/`authenticated` revogados.
- As cinco entram em `retencao_politica` como `vida_da_conta`: todas saem com o aluno pela FK.

Nenhum `%` literal no SQL desta migração: o SQL offline do Alembic o dobra.

Revision ID: 20261102_19
Revises: 20261102_18
Create Date: 2026-11-02
"""

from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path

from alembic import op

revision = "20261102_19"
down_revision = "20261102_18"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

JOB_RANK = "trailup_notificacoes_rank"
CRON_RANK = "*/10 * * * *"

# Matriz de Monterrat (mesma que sustenta o limite do rank, épico #133). Chave = perfil dominante
# como `notificacoes_perfil_dominante` devolve (minúsculo, `socializer` com z).
PESOS: dict[str, dict[str, float]] = {
    "rank": {
        "conqueror": 1.0,
        "achiever": 0.75,
        "daredevil": 0.63,
        "mastermind": 0.63,
        "socializer": 0.13,
    },
    "amigo_rank": {"socializer": 1.0},
    "novo_material": {"seeker": 0.88, "achiever": 1.0},
    "sequencia": {"achiever": 1.0},
}

TIPOS_SILENCIAVEIS = "lembrete,suporte,rank,amigo_rank,novo_material,sequencia"

# (chave, valor, descrição)
CONFIG_PARAMS: list[tuple[str, str, str]] = [
    ("perfil_peso_minimo_pct", "50",
     "Peso mínimo (em centésimos) do perfil dominante na matriz perfil_pesos_<tipo> para receber."),
    ("tipos_silenciaveis", TIPOS_SILENCIAVEIS,
     "Tipos que o aluno pode silenciar (separados por vírgula). Só os que passam pela fila."),
    ("foco_duracao_padrao_min", "50", "Duração do modo foco quando o app não diz quantos minutos."),
    ("foco_duracao_max_min", "180", "Duração máxima do modo foco ligado pelo aluno."),
    ("foco_por_atencao", "1",
     "1 = estudo recente com atenção não baixa também segura as notificações; 0 = só o foco do aluno."),
    ("atencao_validade_min", "10",
     "Minutos em que o estado de atenção gravado pela API vale para decidir o foco."),
    ("atencao_limiar_baixa_pct", "40",
     "Score de atenção (x100) abaixo do qual o aluno está desconcentrado e a entrega segue."),
    ("rank_notificar_descida", "0", "1 = avisa também quando a própria posição no rank cai."),
    ("rank_expiracao_horas", "12", "Horas até a notificação de rank perder o sentido e expirar."),
]


def _sql_texto(valor: str) -> str:
    return "'" + valor.replace("'", "''") + "'"


def config() -> str:
    linhas = [
        f"  ({_sql_texto(chave)}, {_sql_texto(valor)}, {_sql_texto(descricao)})"
        for chave, valor, descricao in CONFIG_PARAMS
    ]
    for tipo, pesos in PESOS.items():
        linhas.append(
            f"  ({_sql_texto('perfil_pesos_' + tipo)}, {_sql_texto(json.dumps(pesos, sort_keys=True))}, "
            f"{_sql_texto('Peso de cada perfil BrainHex para o tipo ' + tipo + ' (matriz de Monterrat, #149).')})"
        )
    return (
        "INSERT INTO public.notificacoes_config (chave, valor, descricao) VALUES\n"
        + ",\n".join(linhas)
        + "\nON CONFLICT (chave) DO NOTHING;"
    )


CHAVES_CONFIG = [c for c, _, _ in CONFIG_PARAMS] + [f"perfil_pesos_{t}" for t in PESOS]

RETENCAO = """
INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo) VALUES
  ('aluno_modo_foco', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'foco ligado pelo aluno; uma linha por aluno, sai com a conta pela FK'),
  ('aluno_estado_atencao', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'ultimo estado de atencao do ciclo; uma linha por aluno, sai com a conta pela FK'),
  ('notificacoes_silenciadas', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'tipos de aviso que o aluno silenciou; sai com a conta pela FK'),
  ('notificacoes_silenciamento_log', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'historico de silenciar e reativar, sinal de perfil; sai com a conta pela FK'),
  ('rank_posicao_anterior', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'ultima posicao vista no rank, so para detectar subida; sai com a conta ou com o rank pela FK')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

RESTRICOES = """
-- `fim_foco`: segurada durante o foco. `colapsada`: segurada que perdeu para outra do mesmo tipo.
ALTER TABLE public.notificacoes_pendentes
  DROP CONSTRAINT IF EXISTS notificacoes_pendentes_gatilho_check;
ALTER TABLE public.notificacoes_pendentes
  ADD CONSTRAINT notificacoes_pendentes_gatilho_check
  CHECK (gatilho IN ('horario', 'login', 'tempo_uso', 'fim_foco'));
ALTER TABLE public.notificacoes_pendentes
  DROP CONSTRAINT IF EXISTS notificacoes_pendentes_status_check;
ALTER TABLE public.notificacoes_pendentes
  ADD CONSTRAINT notificacoes_pendentes_status_check
  CHECK (status IN ('pendente', 'entregue', 'expirada', 'cancelada', 'suprimida', 'colapsada'));
"""

RESTRICOES_ANTERIORES = """
UPDATE public.notificacoes_pendentes
   SET gatilho = COALESCE(NULLIF(contexto->>'gatilho_original', 'fim_foco'), 'login')
 WHERE gatilho = 'fim_foco';
UPDATE public.notificacoes_pendentes SET status = 'suprimida' WHERE status = 'colapsada';
ALTER TABLE public.notificacoes_pendentes
  DROP CONSTRAINT IF EXISTS notificacoes_pendentes_gatilho_check;
ALTER TABLE public.notificacoes_pendentes
  ADD CONSTRAINT notificacoes_pendentes_gatilho_check
  CHECK (gatilho IN ('horario', 'login', 'tempo_uso'));
ALTER TABLE public.notificacoes_pendentes
  DROP CONSTRAINT IF EXISTS notificacoes_pendentes_status_check;
ALTER TABLE public.notificacoes_pendentes
  ADD CONSTRAINT notificacoes_pendentes_status_check
  CHECK (status IN ('pendente', 'entregue', 'expirada', 'cancelada', 'suprimida'));
"""

TABELAS = """
CREATE TABLE IF NOT EXISTS public.aluno_modo_foco (
  aluno_id      uuid        PRIMARY KEY REFERENCES public.alunos(id) ON DELETE CASCADE,
  iniciado_em   timestamptz NOT NULL DEFAULT now(),
  ativo_ate     timestamptz NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.aluno_modo_foco IS
  'Modo foco ligado pelo aluno (#149): nada é entregue até ativo_ate. Escrita só por '
  'notificacoes_iniciar_foco / notificacoes_encerrar_foco.';
ALTER TABLE public.aluno_modo_foco ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aluno_modo_foco_sel ON public.aluno_modo_foco;
CREATE POLICY aluno_modo_foco_sel ON public.aluno_modo_foco
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());
REVOKE ALL ON TABLE public.aluno_modo_foco FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.aluno_modo_foco TO authenticated;

CREATE TABLE IF NOT EXISTS public.aluno_estado_atencao (
  aluno_id      uuid         PRIMARY KEY REFERENCES public.alunos(id) ON DELETE CASCADE,
  estado        text         NOT NULL CHECK (estado IN ('alta', 'moderada', 'baixa')),
  score         numeric(4,3) CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
  ciclo_id      text,
  desde         timestamptz  NOT NULL DEFAULT now(),
  atualizado_em timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.aluno_estado_atencao IS
  'Estado de atenção corrente que a API calcula ao fim de cada ciclo (#149). Sem policy de '
  'propósito: inferência sobre o aluno, lida só pela API (service_role) e pelo motor de '
  'notificações (SECURITY DEFINER).';
ALTER TABLE public.aluno_estado_atencao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.aluno_estado_atencao FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.notificacoes_silenciadas (
  aluno_id      uuid        NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  tipo          text        NOT NULL,
  silenciada_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, tipo)
);
COMMENT ON TABLE public.notificacoes_silenciadas IS
  'Tipos de notificação que o aluno silenciou (#149). Escrita só por notificacoes_silenciar_tipo.';
ALTER TABLE public.notificacoes_silenciadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notificacoes_silenciadas_sel ON public.notificacoes_silenciadas;
CREATE POLICY notificacoes_silenciadas_sel ON public.notificacoes_silenciadas
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());
REVOKE ALL ON TABLE public.notificacoes_silenciadas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notificacoes_silenciadas TO authenticated;

CREATE TABLE IF NOT EXISTS public.notificacoes_silenciamento_log (
  id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aluno_id         uuid        NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  tipo             text        NOT NULL,
  acao             text        NOT NULL CHECK (acao IN ('silenciou', 'reativou')),
  perfil_dominante text,
  afinidades       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  notificacao_id   bigint,
  criado_em        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificacoes_silenciamento_log_aluno_idx
  ON public.notificacoes_silenciamento_log (aluno_id, criado_em DESC);
COMMENT ON TABLE public.notificacoes_silenciamento_log IS
  'Histórico append-only de silenciar/reativar um tipo, com o perfil e as afinidades do momento: '
  'sinal de perfil (#149, Monterrat). Escrita só por notificacoes_silenciar_tipo.';
ALTER TABLE public.notificacoes_silenciamento_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notificacoes_silenciamento_log_sel ON public.notificacoes_silenciamento_log;
CREATE POLICY notificacoes_silenciamento_log_sel ON public.notificacoes_silenciamento_log
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());
REVOKE ALL ON TABLE public.notificacoes_silenciamento_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notificacoes_silenciamento_log TO authenticated;

CREATE TABLE IF NOT EXISTS public.rank_posicao_anterior (
  rank_id   bigint      NOT NULL REFERENCES public.ranks(id) ON DELETE CASCADE,
  aluno_id  uuid        NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  posicao   integer     NOT NULL,
  pontuacao numeric,
  visto_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rank_id, aluno_id)
);
COMMENT ON TABLE public.rank_posicao_anterior IS
  'Última posição vista por (rank x aluno), base da notificação de mudança no rank (#149). Sem '
  'policy de propósito: só notificacoes_rank_varrer (SECURITY DEFINER) lê e escreve.';
ALTER TABLE public.rank_posicao_anterior ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rank_posicao_anterior FROM PUBLIC, anon, authenticated;
"""

FUNCOES = r"""
-- Em foco? 'aluno' (ligou o modo foco), 'estudo' (atenção recente e não baixa) ou NULL.
CREATE OR REPLACE FUNCTION public.notificacoes_em_foco(p_aluno uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_validade integer := GREATEST(1, public.notificacoes_cfg_int('atencao_validade_min', 10));
  v_limiar   integer := public.notificacoes_cfg_int('atencao_limiar_baixa_pct', 40);
BEGIN
  IF p_aluno IS NULL THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM aluno_modo_foco f WHERE f.aluno_id = p_aluno AND f.ativo_ate > now()) THEN
    RETURN 'aluno';
  END IF;
  -- Desconcentrado não está em foco: a entrega segue. Estado velho também não, para a fila não
  -- ficar presa quando a API para de escrever.
  IF public.notificacoes_cfg_int('foco_por_atencao', 1) > 0
     AND EXISTS (
       SELECT 1 FROM aluno_estado_atencao e
        WHERE e.aluno_id = p_aluno
          AND e.atualizado_em > now() - make_interval(mins => v_validade)
          AND CASE WHEN e.score IS NOT NULL THEN e.score * 100 >= v_limiar
                   ELSE e.estado <> 'baixa' END
     ) THEN
    RETURN 'estudo';
  END IF;
  RETURN NULL;
END;
$fn$;

-- Para quem: NULL = recebe; senão o motivo ('silenciado' ou 'perfil').
CREATE OR REPLACE FUNCTION public.notificacoes_destino(p_aluno uuid, p_tipo text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_pesos  text := public.notificacoes_cfg_txt('perfil_pesos_' || COALESCE(p_tipo, ''), '');
  v_minimo integer := public.notificacoes_cfg_int('perfil_peso_minimo_pct', 50);
  v_peso   numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM notificacoes_silenciadas s
              WHERE s.aluno_id = p_aluno AND s.tipo = p_tipo) THEN
    RETURN 'silenciado';
  END IF;
  IF v_pesos = '' THEN
    RETURN NULL;  -- tipo fora da matriz: o perfil não filtra
  END IF;
  BEGIN
    v_peso := COALESCE(
      (v_pesos::jsonb ->> public.notificacoes_perfil_dominante(p_aluno))::numeric, 0
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;  -- matriz ilegível não pode calar todo mundo
  END;
  IF v_peso * 100 < v_minimo THEN
    RETURN 'perfil';
  END IF;
  RETURN NULL;
END;
$fn$;

-- Porta de entrada dos eventos que o próprio banco produz (rank, amigo, ...): destino, horário fora
-- do silêncio, expiração e dedupe por dia. Enquanto a do dia não sai, a seguinte reescreve o texto.
CREATE OR REPLACE FUNCTION public.notificacoes_enfileirar_evento(
  p_aluno uuid,
  p_tipo text,
  p_motivo text,
  p_titulo text,
  p_corpo text,
  p_contexto jsonb DEFAULT '{}'::jsonb,
  p_prioridade integer DEFAULT 0,
  p_expira_horas integer DEFAULT NULL
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_tz  text;
  v_gat text := 'horario';
  v_hor timestamptz;
  v_dia date;
  v_id  bigint;
BEGIN
  IF p_aluno IS NULL OR public.notificacoes_destino(p_aluno, p_tipo) IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT d.timezone INTO v_tz
    FROM expo_tokens d
   WHERE d.aluno_id = p_aluno AND d.ativo
   ORDER BY d.ultima_atividade_em DESC
   LIMIT 1;
  -- Sem aparelho, a notificação espera o próximo login (mesma regra da promoção).
  IF NOT FOUND THEN
    v_gat := 'login';
  END IF;
  v_tz  := public.notificacoes_tz(v_tz);
  v_hor := public.notificacoes_fora_do_silencio(v_tz, now());
  v_dia := public.notificacoes_dia_local(v_tz, v_hor);

  INSERT INTO notificacoes_pendentes (
    aluno_id, tipo, contexto, titulo, corpo, horario, status, prioridade,
    gatilho, expira_em, dedupe_key
  )
  VALUES (
    p_aluno, p_tipo,
    COALESCE(p_contexto, '{}'::jsonb)
      || jsonb_build_object('dia', v_dia::text, 'timezone', v_tz, 'motivo', p_motivo),
    p_titulo, p_corpo, v_hor, 'pendente', COALESCE(p_prioridade, 0), v_gat,
    v_hor + make_interval(hours => COALESCE(
      p_expira_horas, public.notificacoes_cfg_int('expiracao_padrao_horas', 48)
    )),
    public.notificacoes_dedupe_key(p_tipo, p_motivo, v_dia)
  )
  ON CONFLICT (aluno_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE
    SET titulo = EXCLUDED.titulo,
        corpo = EXCLUDED.corpo,
        contexto = COALESCE(notificacoes_pendentes.contexto, '{}'::jsonb) || EXCLUDED.contexto,
        prioridade = GREATEST(COALESCE(notificacoes_pendentes.prioridade, 0), EXCLUDED.prioridade),
        atualizado_em = now()
    WHERE notificacoes_pendentes.status = 'pendente'
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

-- Entrega: fila -> caixa de entrada -> push. Igual à 20260826_04, mais o foco, o colapso na saída
-- do foco e o silêncio do tipo.
CREATE OR REPLACE FUNCTION public.notificacoes_entregar(
  p_aluno uuid, p_gatilhos text[] DEFAULT ARRAY['horario','login']
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_teto  integer := public.notificacoes_cfg_int('max_por_dia', 6);
  v_foco  text := public.notificacoes_em_foco(p_aluno);
  v_dia   date;
  v_hoje  integer;
  v_reg   record;
  v_id    bigint;
  v_n     integer := 0;
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

  -- Saida do foco sem enxurrada: uma por tipo. Fica a de maior prioridade e, entre iguais, a
  -- mais recente (o texto mais atual); as outras ficam registradas como colapsadas.
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

  FOR v_reg IN
    SELECT p.*
      FROM notificacoes_pendentes p
     WHERE p.aluno_id = p_aluno
       AND p.status = 'pendente'
       AND (p.gatilho = 'fim_foco' OR p.gatilho = ANY(p_gatilhos))
       AND (p.gatilho <> 'horario' OR p.horario <= now())
       AND (p.expira_em IS NULL OR p.expira_em > now())
     ORDER BY p.prioridade DESC, p.horario ASC
       FOR UPDATE SKIP LOCKED
  LOOP
    -- Silenciado depois de entrar na fila: nao sai.
    IF EXISTS (SELECT 1 FROM notificacoes_silenciadas s
                WHERE s.aluno_id = p_aluno AND s.tipo = v_reg.tipo) THEN
      UPDATE notificacoes_pendentes
         SET status = 'suprimida', ultimo_erro = 'silenciado', atualizado_em = now()
       WHERE id = v_reg.id;
      CONTINUE;
    END IF;

    v_dia := public.notificacoes_dia_local(COALESCE(v_reg.contexto->>'timezone', 'UTC'));

    SELECT COALESCE(notificacoes_dia, 0) INTO v_hoje
      FROM aluno_atividade_diaria WHERE aluno_id = p_aluno AND dia = v_dia;
    v_hoje := COALESCE(v_hoje, 0);

    -- Teto diario: a excedente e SUPRIMIDA, nao adiada. Adiar so empurraria a
    -- avalanche para o dia seguinte.
    IF v_teto > 0 AND v_hoje >= v_teto THEN
      UPDATE notificacoes_pendentes
         SET status = 'suprimida', ultimo_erro = 'teto diario', atualizado_em = now()
       WHERE id = v_reg.id;
      IF v_reg.sugestao_id IS NOT NULL THEN
        UPDATE notificacoes_ia
           SET status = 'suprimida', motivo = 'teto_diario'
         WHERE id = v_reg.sugestao_id AND status = 'sugerida';
      END IF;
      CONTINUE;
    END IF;

    -- A linha na caixa de entrada vem ANTES do push: se o push falhar o aluno
    -- ainda ve a notificacao ao abrir o app.
    INSERT INTO notificacoes (
      aluno_id, titulo, corpo, tipo, horario_envio, status, read,
      origem, origem_id, contexto
    )
    VALUES (
      p_aluno, COALESCE(v_reg.titulo, 'TrailUp'), COALESCE(v_reg.corpo, ''), v_reg.tipo,
      now(), 'enviada', FALSE, 'motor', v_reg.id, COALESCE(v_reg.contexto, '{}'::jsonb)
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

    INSERT INTO aluno_atividade_diaria (aluno_id, dia, notificacoes_dia)
    VALUES (p_aluno, v_dia, 1)
    ON CONFLICT (aluno_id, dia) DO UPDATE
      SET notificacoes_dia = aluno_atividade_diaria.notificacoes_dia + 1,
          atualizado_em = now();

    PERFORM public.notificacoes_enviar_push(
      p_aluno, v_id, COALESCE(v_reg.titulo, 'TrailUp'), COALESCE(v_reg.corpo, ''),
      COALESCE(v_reg.contexto, '{}'::jsonb) - 'texto', COALESCE(v_reg.prioridade, 0)
    );

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$fn$;

-- Rank: compara a posição de agora com a última vista e avisa o próprio aluno e os amigos.
CREATE OR REPLACE FUNCTION public.notificacoes_rank_varrer()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_limite   integer := public.app_rank_limite_visivel();
  v_descida  boolean := public.notificacoes_cfg_int('rank_notificar_descida', 0) > 0;
  v_expira   integer := public.notificacoes_cfg_int('rank_expiracao_horas', 12);
  v_reg      record;
  v_amigo    record;
  v_nome     text;
  v_lugar    text;
  v_alunos   uuid[] := ARRAY[]::uuid[];
  v_aluno    uuid;
  v_base     integer := 0;
  v_proprias integer := 0;
  v_amigos   integer := 0;
  v_entregues integer := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('notificacoes_rank_varrer')) THEN
    RETURN jsonb_build_object('pulou', true);
  END IF;

  FOR v_reg IN
    WITH ativos AS (
      SELECT r.id, COALESCE(NULLIF(btrim(rt.nome), ''), 'ranking da turma') AS nome
        FROM ranks r
        JOIN rank_tipo rt ON rt.id = r.tipo_id
       WHERE r.inicio <= now() AND (r.fim IS NULL OR r.fim > now())
    ),
    agora AS (
      SELECT v.rank_id, v.classe_id, v.id_aluno AS aluno_id, v.posicao::integer AS posicao,
             v.pontuacao, a.nome AS rank_nome
        FROM vw_rank_posicoes_por_classe_todas v
        JOIN ativos a ON a.id = v.rank_id
    )
    SELECT g.*, ant.posicao AS posicao_anterior
      FROM agora g
      LEFT JOIN rank_posicao_anterior ant
        ON ant.rank_id = g.rank_id AND ant.aluno_id = g.aluno_id
     WHERE ant.posicao IS DISTINCT FROM g.posicao
  LOOP
    INSERT INTO rank_posicao_anterior (rank_id, aluno_id, posicao, pontuacao, visto_em)
    VALUES (v_reg.rank_id, v_reg.aluno_id, v_reg.posicao, v_reg.pontuacao, now())
    ON CONFLICT (rank_id, aluno_id) DO UPDATE
      SET posicao = EXCLUDED.posicao, pontuacao = EXCLUDED.pontuacao, visto_em = now();

    -- Primeira vez: só a base. Sem posição anterior não há "subiu".
    IF v_reg.posicao_anterior IS NULL THEN
      v_base := v_base + 1;
      CONTINUE;
    END IF;

    v_lugar := v_reg.posicao::text || 'º lugar (' || left(v_reg.rank_nome, 40) || ')';

    IF v_reg.posicao < v_reg.posicao_anterior AND COALESCE(v_reg.pontuacao, 0) > 0 THEN
      -- A própria posição: sempre visível para ele, dentro ou fora do corte.
      IF public.notificacoes_enfileirar_evento(
           v_reg.aluno_id, 'rank', 'rank:' || v_reg.rank_id::text,
           'Você subiu no ranking',
           'Você agora está em ' || v_lugar || '.',
           jsonb_build_object('rank_id', v_reg.rank_id, 'classe_id', v_reg.classe_id,
                              'posicao', v_reg.posicao, 'posicao_anterior', v_reg.posicao_anterior),
           0, v_expira
         ) IS NOT NULL THEN
        v_proprias := v_proprias + 1;
        v_alunos := array_append(v_alunos, v_reg.aluno_id);
      END IF;

      -- Amigo só é nomeado dentro do corte: fora dele, o ranking o esconde de propósito.
      IF v_reg.posicao <= v_limite THEN
        SELECT COALESCE(NULLIF(btrim(a.apelido), ''), NULLIF(split_part(btrim(a.nome), ' ', 1), ''),
                        'Uma amizade sua')
          INTO v_nome
          FROM alunos a WHERE a.id = v_reg.aluno_id;
        v_nome := left(COALESCE(v_nome, 'Uma amizade sua'), 30);

        FOR v_amigo IN
          SELECT CASE WHEN sr.aluno_a_id = v_reg.aluno_id THEN sr.aluno_b_id
                      ELSE sr.aluno_a_id END AS amigo_id
            FROM social_relacionamentos sr
           WHERE sr.status = 'accepted'
             AND v_reg.aluno_id IN (sr.aluno_a_id, sr.aluno_b_id)
        LOOP
          CONTINUE WHEN NOT EXISTS (
            SELECT 1 FROM classe_aluno ca
             WHERE ca.classe_id = v_reg.classe_id AND ca.aluno_id = v_amigo.amigo_id
          );
          IF public.notificacoes_enfileirar_evento(
               v_amigo.amigo_id, 'amigo_rank',
               'rank:' || v_reg.rank_id::text || ':' || v_reg.aluno_id::text,
               v_nome || ' subiu no ranking',
               'Agora em ' || v_lugar || '. Que tal estudar em dupla?',
               jsonb_build_object('rank_id', v_reg.rank_id, 'classe_id', v_reg.classe_id,
                                  'amigo_id', v_reg.aluno_id, 'posicao', v_reg.posicao),
               0, v_expira
             ) IS NOT NULL THEN
            v_amigos := v_amigos + 1;
            v_alunos := array_append(v_alunos, v_amigo.amigo_id);
          END IF;
        END LOOP;
      END IF;
    ELSIF v_reg.posicao > v_reg.posicao_anterior AND v_descida THEN
      IF public.notificacoes_enfileirar_evento(
           v_reg.aluno_id, 'rank', 'rank:' || v_reg.rank_id::text,
           'Sua posição no ranking mudou',
           'Você está em ' || v_lugar || '.',
           jsonb_build_object('rank_id', v_reg.rank_id, 'classe_id', v_reg.classe_id,
                              'posicao', v_reg.posicao, 'posicao_anterior', v_reg.posicao_anterior),
           0, v_expira
         ) IS NOT NULL THEN
        v_proprias := v_proprias + 1;
        v_alunos := array_append(v_alunos, v_reg.aluno_id);
      END IF;
    END IF;
  END LOOP;

  -- Entrega na hora (foco, teto e silêncio decidem lá dentro).
  FOR v_aluno IN SELECT DISTINCT x FROM unnest(v_alunos) AS x LOOP
    v_entregues := v_entregues + public.notificacoes_entregar(v_aluno, ARRAY['horario']);
  END LOOP;

  RETURN jsonb_build_object('pulou', false, 'base', v_base, 'proprias', v_proprias,
                            'amigos', v_amigos, 'entregues', v_entregues);
END;
$fn$;

-- RPC do app: estado do foco do próprio aluno.
CREATE OR REPLACE FUNCTION public.notificacoes_meu_foco()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_aluno  uuid := auth.uid();
  v_ate    timestamptz;
  v_origem text;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  SELECT f.ativo_ate INTO v_ate
    FROM aluno_modo_foco f WHERE f.aluno_id = v_aluno AND f.ativo_ate > now();
  v_origem := public.notificacoes_em_foco(v_aluno);
  RETURN jsonb_build_object(
    'em_foco', v_origem IS NOT NULL,
    'origem', v_origem,
    'ate', v_ate,
    'seguradas', (SELECT count(*) FROM notificacoes_pendentes p
                   WHERE p.aluno_id = v_aluno AND p.status = 'pendente'
                     AND p.gatilho = 'fim_foco')
  );
END;
$fn$;

-- RPC do app: liga (ou estende) o modo foco por p_minutos.
CREATE OR REPLACE FUNCTION public.notificacoes_iniciar_foco(p_minutos integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_aluno uuid := auth.uid();
  v_max   integer := GREATEST(5, public.notificacoes_cfg_int('foco_duracao_max_min', 180));
  v_min   integer;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  v_min := LEAST(v_max, GREATEST(5, COALESCE(
    p_minutos, public.notificacoes_cfg_int('foco_duracao_padrao_min', 50)
  )));

  INSERT INTO aluno_modo_foco (aluno_id, iniciado_em, ativo_ate, atualizado_em)
  VALUES (v_aluno, now(), now() + make_interval(mins => v_min), now())
  ON CONFLICT (aluno_id) DO UPDATE
    SET iniciado_em = CASE WHEN aluno_modo_foco.ativo_ate > now()
                           THEN aluno_modo_foco.iniciado_em ELSE now() END,
        ativo_ate = EXCLUDED.ativo_ate,
        atualizado_em = now();

  RETURN public.notificacoes_meu_foco();
END;
$fn$;

-- RPC do app: encerra o modo foco e entrega o que ficou segurado (colapsado por tipo).
CREATE OR REPLACE FUNCTION public.notificacoes_encerrar_foco()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_aluno uuid := auth.uid();
  v_n     integer;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  UPDATE aluno_modo_foco
     SET ativo_ate = now(), atualizado_em = now()
   WHERE aluno_id = v_aluno AND ativo_ate > now();
  -- O app está aberto: o que esperava o login também pode sair.
  v_n := public.notificacoes_entregar(v_aluno, ARRAY['horario', 'login']);
  RETURN public.notificacoes_meu_foco() || jsonb_build_object('entregues', v_n);
END;
$fn$;

-- RPC do app: silenciar (ou voltar a receber) um tipo. O fato fica no log como sinal de perfil.
CREATE OR REPLACE FUNCTION public.notificacoes_silenciar_tipo(
  p_tipo text, p_silenciar boolean DEFAULT TRUE, p_notificacao_id bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_aluno     uuid := auth.uid();
  v_tipo      text := lower(btrim(COALESCE(p_tipo, '')));
  v_silenciar boolean := COALESCE(p_silenciar, TRUE);
  v_permitido text[] := string_to_array(
    replace(public.notificacoes_cfg_txt('tipos_silenciaveis', ''), ' ', ''), ','
  );
  v_origem    bigint;
  v_mudou     boolean;
  v_perfis    jsonb;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  IF v_tipo = '' OR NOT (v_tipo = ANY(COALESCE(v_permitido, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'tipo nao silenciavel: ' || v_tipo;
  END IF;
  -- Só a notificação do próprio aluno vira referência no log.
  SELECT n.id INTO v_origem
    FROM notificacoes n WHERE n.id = p_notificacao_id AND n.aluno_id = v_aluno;

  IF v_silenciar THEN
    INSERT INTO notificacoes_silenciadas (aluno_id, tipo) VALUES (v_aluno, v_tipo)
    ON CONFLICT (aluno_id, tipo) DO NOTHING
    RETURNING TRUE INTO v_mudou;
    UPDATE notificacoes_pendentes
       SET status = 'suprimida', ultimo_erro = 'silenciado', atualizado_em = now()
     WHERE aluno_id = v_aluno AND tipo = v_tipo AND status = 'pendente';
  ELSE
    DELETE FROM notificacoes_silenciadas WHERE aluno_id = v_aluno AND tipo = v_tipo
    RETURNING TRUE INTO v_mudou;
  END IF;

  IF COALESCE(v_mudou, FALSE) THEN
    SELECT jsonb_object_agg(lower(btrim(p.nome)), ap.afinidade) INTO v_perfis
      FROM aluno_perfil ap JOIN perfil p ON p.id = ap.perfil_id
     WHERE ap.aluno_id = v_aluno;
    INSERT INTO notificacoes_silenciamento_log (
      aluno_id, tipo, acao, perfil_dominante, afinidades, notificacao_id
    )
    VALUES (
      v_aluno, v_tipo, CASE WHEN v_silenciar THEN 'silenciou' ELSE 'reativou' END,
      public.notificacoes_perfil_dominante(v_aluno), COALESCE(v_perfis, '{}'::jsonb), v_origem
    );
  END IF;

  RETURN jsonb_build_object('tipo', v_tipo, 'silenciado', v_silenciar,
                            'mudou', COALESCE(v_mudou, FALSE));
END;
$fn$;

REVOKE ALL ON FUNCTION public.notificacoes_em_foco(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_destino(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_enfileirar_evento(uuid, text, text, text, text, jsonb, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_entregar(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_rank_varrer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_meu_foco() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notificacoes_iniciar_foco(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notificacoes_encerrar_foco() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notificacoes_silenciar_tipo(text, boolean, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificacoes_meu_foco() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notificacoes_iniciar_foco(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notificacoes_encerrar_foco() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notificacoes_silenciar_tipo(text, boolean, bigint) TO authenticated;
"""

CRON_SQL = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB_RANK}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB_RANK}');
    PERFORM cron.schedule('{JOB_RANK}', '{CRON_RANK}', 'SELECT public.notificacoes_rank_varrer()');
  END IF;
END $$
"""

CRON_FORA = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{JOB_RANK}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{JOB_RANK}');
  END IF;
END $$
"""

RELOAD = "NOTIFY pgrst, 'reload schema';"


def _load(nome: str):
    path = AQUI.with_name(nome)
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_02_18", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _Coletor:
    def __init__(self) -> None:
        self.sql: list[str] = []

    def execute(self, sql) -> None:
        self.sql.append(str(sql))


def _sql_do_upgrade(nome: str) -> str:
    """O SQL que o `upgrade()` de outra migração executaria, sem executar."""
    mod = _load(nome)
    coletor = _Coletor()
    original = mod.op
    mod.op = coletor
    try:
        mod.upgrade()
    finally:
        mod.op = original
    return "\n".join(coletor.sql)


def _funcao(texto: str, nome: str, origem: str) -> str:
    """Recorta `CREATE OR REPLACE FUNCTION public.<nome>(...)` até o fim do corpo, da origem.

    Copiar à mão seria uma segunda fonte da verdade; recortar falha alto se a origem mudar de forma.
    """
    m = re.search(
        rf"CREATE OR REPLACE FUNCTION public\.{re.escape(nome)}\(.*?\bAS (\$\w*\$)",
        texto,
        re.S,
    )
    if m is None:
        raise RuntimeError(f"{nome} não encontrado em {origem}; revise a 20261102_19")
    fim = texto.find(m.group(1), m.end())
    if fim < 0:
        raise RuntimeError(f"fim de {nome} não encontrado em {origem}; revise a 20261102_19")
    return texto[m.start() : fim + len(m.group(1))] + ";"


def _troca(texto: str, antigo: str, novo: str, onde: str) -> str:
    if texto.count(antigo) != 1:
        raise RuntimeError(f"o trecho de {onde} mudou de forma; revise a 20261102_19")
    return texto.replace(antigo, novo, 1)


def promover_anterior() -> str:
    return _funcao(
        _load("20261102_01_notificacao_no_horario_do_aluno.py").FUNCOES,
        "notificacoes_ia_promover",
        "20261102_01",
    )


def promover_nova() -> str:
    texto = _troca(
        promover_anterior(),
        "  v_origem text := 'agora';\nBEGIN\n",
        "  v_origem text := 'agora';\n  v_barra  text;\nBEGIN\n",
        "notificacoes_ia_promover (declarações)",
    )
    return _troca(
        texto,
        "  IF NEW.aluno_id IS NULL THEN\n    RETURN NEW;\n  END IF;\n",
        "  IF NEW.aluno_id IS NULL THEN\n    RETURN NEW;\n  END IF;\n\n"
        "  -- Para quem (#149): perfil dominante e tipo silenciado decidem antes da fila.\n"
        "  v_barra := public.notificacoes_destino(NEW.aluno_id, NEW.tipo);\n"
        "  IF v_barra IS NOT NULL THEN\n"
        "    UPDATE notificacoes_ia SET status = 'suprimida', motivo = v_barra WHERE id = NEW.id;\n"
        "    RETURN NEW;\n"
        "  END IF;\n",
        "notificacoes_ia_promover (início)",
    )


def varrer_anterior() -> str:
    return _funcao(
        _load("20261102_01_notificacao_no_horario_do_aluno.py").FUNCOES,
        "notificacoes_varrer",
        "20261102_01",
    )


def varrer_nova() -> str:
    return _troca(
        varrer_anterior(),
        "           AND p.aluno_id IS NOT NULL AND p.horario <= now()\n      ) x\n",
        "           AND p.aluno_id IS NOT NULL AND p.horario <= now()\n"
        "        UNION\n"
        "        -- Segurada no foco (#149): o fim do foco por tempo entrega aqui.\n"
        "        SELECT p.aluno_id\n"
        "          FROM notificacoes_pendentes p\n"
        "         WHERE p.status = 'pendente' AND p.gatilho = 'fim_foco'\n"
        "           AND p.aluno_id IS NOT NULL\n"
        "      ) x\n",
        "notificacoes_varrer (alunos visitados)",
    )


def push_anterior() -> str:
    return _funcao(
        _sql_do_upgrade("20260826_15_conciliar_push_expo.py"),
        "notificacoes_enviar_push",
        "20260826_15",
    )


def push_nova() -> str:
    return _troca(
        push_anterior(),
        "        BEGIN\n          -- Uma unica leitura ordenada",
        "        BEGIN\n"
        "          -- Em foco nao ha aviso no aparelho (#149). Chat, convite e conquista entram\n"
        "          -- direto na caixa de entrada; a linha fica la, so o push nao sai.\n"
        "          IF public.notificacoes_em_foco(p_aluno) IS NOT NULL THEN\n"
        "            RETURN 0;\n"
        "          END IF;\n"
        "\n"
        "          -- Uma unica leitura ordenada",
        "notificacoes_enviar_push (início)",
    )


def entregar_anterior() -> str:
    return _funcao(
        _load("20260826_04_notificacoes_motor_sql.py").FUNCOES,
        "notificacoes_entregar",
        "20260826_04",
    )


def anteriores() -> str:
    """As funções do motor como estavam antes desta migração (o downgrade volta a elas)."""
    return "\n".join(
        (
            entregar_anterior(),
            promover_anterior(),
            varrer_anterior(),
            push_anterior(),
            "REVOKE ALL ON FUNCTION public.notificacoes_entregar(uuid, text[]) "
            "FROM PUBLIC, anon, authenticated;",
        )
    )


def upgrade() -> None:
    op.execute(config())
    op.execute(RESTRICOES)
    op.execute(TABELAS)
    op.execute(RETENCAO)
    op.execute(FUNCOES)
    op.execute(promover_nova())
    op.execute(varrer_nova())
    op.execute(push_nova())
    op.execute(CRON_SQL)
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(CRON_FORA)
    # As funções antigas voltam ANTES das tabelas saírem: as novas leem as tabelas desta migração.
    op.execute(anteriores())
    for assinatura in (
        "notificacoes_silenciar_tipo(text, boolean, bigint)",
        "notificacoes_encerrar_foco()",
        "notificacoes_iniciar_foco(integer)",
        "notificacoes_meu_foco()",
        "notificacoes_rank_varrer()",
        "notificacoes_enfileirar_evento(uuid, text, text, text, text, jsonb, integer, integer)",
        "notificacoes_destino(uuid, text)",
        "notificacoes_em_foco(uuid)",
    ):
        op.execute(f"DROP FUNCTION IF EXISTS public.{assinatura}")
    for tabela in (
        "rank_posicao_anterior",
        "notificacoes_silenciamento_log",
        "notificacoes_silenciadas",
        "aluno_estado_atencao",
        "aluno_modo_foco",
    ):
        op.execute(f"DROP TABLE IF EXISTS public.{tabela}")
    op.execute(
        "DELETE FROM public.retencao_politica WHERE tabela IN ('aluno_modo_foco', 'aluno_estado_atencao', "
        "'notificacoes_silenciadas', 'notificacoes_silenciamento_log', 'rank_posicao_anterior')"
    )
    op.execute(RESTRICOES_ANTERIORES)
    chaves = ", ".join(_sql_texto(c) for c in CHAVES_CONFIG)
    op.execute(f"DELETE FROM public.notificacoes_config WHERE chave IN ({chaves})")
    op.execute(RELOAD)
