"""loja: várias unidades do mesmo item e limite de uso por situação

O aluno pode comprar várias unidades do mesmo item (num pedido só, com
`p_quantidade`, ou em pedidos repetidos) e o professor controla quantas pode
USAR, por tipo de item e por situação.

**Compra**
- `loja_comprar(..., p_quantidade)` (1 a 20): uma linha de `loja_compras` por
  unidade, cada uma com a sua linha no razão e na auditoria. Tudo ou nada:
  saldo, estoque e limite de compras valem para o pedido inteiro. Unidades
  grátis (dotação) saem primeiro. O pedido repetido (mesma chave) devolve o
  mesmo lote sem cobrar de novo; as unidades 2..N guardam `chave#n` e o lote
  fica em `lote_chave`.
- Limite de compras: `loja_preco_classe.uso_max_por_aluno` continua sendo o
  máximo de unidades COMPRADAS por aluno (estornadas não contam); NULL = sem
  limite.
- Aumento por compra: vira opção da turma (`loja_preco_classe.preco_fator`,
  1 a 5; 1 desliga). NULL mantém o fator do catálogo (o comportamento de hoje).
- `loja_catalogo` passa a dizer o fator, o limite, quantas o aluno já comprou,
  quantas ainda pode comprar e quantas tem em posse. `loja_inventario` dá,
  por item, ativas / usadas / estornadas.

**Uso**
- `loja_usar_item(item, turma, alvo...)`: usa UMA unidade, a posse ativa mais
  antiga (FIFO), com a mesma chave de idempotência de `loja_usar` (que
  continua valendo para uma compra específica).
- Limites por situação em `loja_limite_uso` (turma, com sobreposição por
  tópico e por atividade): por atividade, por questão, por tópico, por dia,
  por semana (fuso de São Paulo) e total na turma. NULL herda, 0 bloqueia,
  -1 sem limite. As colunas antigas (`uso_max_prazo`, `uso_max_tempo`,
  `uso_max_retry`, `retry_max_por_topico`) seguem valendo na camada delas.
  Padrões: mais prazo 1 por atividade; mais tempo 3 por atividade; responder
  novamente 1 por questão e o teto por tópico de sempre (1); dica 1 por
  questão; troca de formato sem limite.
- A recusa diz qual limite bateu (`limite_por_questao`, `limite_por_atividade`,
  `limite_por_topico`, `limite_por_dia`, `limite_por_semana`,
  `limite_por_turma`), com `limite` e `usados`. Substitui `limite_de_uso` e
  `teto_do_topico`. Os tetos de dias/minutos, o mínimo/máximo por uso, o
  intervalo de 24 h e a revisão do material continuam como estavam.
- Responder novamente pode mirar uma questão (`p_alvo_tipo = 'questao'`).
- `loja_usos_permitidos(turma, item, alvo)`: quantas unidades ainda cabem
  naquela situação e o motivo do bloqueio, para o app desabilitar o botão.
- `loja_uso_log` ganha `atividade_id`, `topico_id` e `questao_id` (preenchidos
  para os usos antigos), que é por onde os limites contam.
- Estorno continua por unidade (`loja_estornar(compra_id)`), só de unidade
  não usada.

Downgrade: volta as funções de 20261020_02/03 e apaga só as funções novas.
Tabela, colunas e dados ficam.

Revision ID: 20261020_06
Revises: 20261020_05
Create Date: 2026-10-19
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261020_06"
down_revision = "20261020_05"
branch_labels = None
depends_on = None


TABELAS = r"""
ALTER TABLE public.loja_preco_classe
  ADD COLUMN IF NOT EXISTS preco_fator numeric NULL;
ALTER TABLE public.loja_preco_classe
  DROP CONSTRAINT IF EXISTS loja_preco_classe_fator_faixa;
ALTER TABLE public.loja_preco_classe
  ADD CONSTRAINT loja_preco_classe_fator_faixa
  CHECK (preco_fator IS NULL OR (preco_fator >= 1 AND preco_fator <= 5));
COMMENT ON COLUMN public.loja_preco_classe.preco_fator IS
  'Aumento do preço a cada unidade comprada (preço = base * fator^compradas). NULL herda loja_itens.preco_fator; 1 desliga o aumento.';
COMMENT ON COLUMN public.loja_preco_classe.uso_max_por_aluno IS
  'Máximo de unidades COMPRADAS por aluno nesta turma (estornadas não contam). NULL = sem limite. O uso tem os limites de loja_limite_uso.';

ALTER TABLE public.loja_compras
  ADD COLUMN IF NOT EXISTS lote_chave text NULL;
COMMENT ON COLUMN public.loja_compras.lote_chave IS
  'Chave do pedido que comprou várias unidades de uma vez. A 1ª unidade guarda a chave do pedido; as outras, chave#2, chave#3...';
CREATE INDEX IF NOT EXISTS loja_compras_fifo_idx
  ON public.loja_compras (aluno_id, classe_id, item_codigo, status, criado_em, id);
CREATE INDEX IF NOT EXISTS loja_compras_lote_idx
  ON public.loja_compras (aluno_id, lote_chave) WHERE lote_chave IS NOT NULL;

ALTER TABLE public.loja_uso_log
  ADD COLUMN IF NOT EXISTS atividade_id bigint NULL,
  ADD COLUMN IF NOT EXISTS topico_id    bigint NULL,
  ADD COLUMN IF NOT EXISTS questao_id   bigint NULL;
COMMENT ON COLUMN public.loja_uso_log.atividade_id IS
  'Atividade, tópico e questão em que a unidade foi usada, já resolvidos: os limites de uso contam por aqui.';
CREATE INDEX IF NOT EXISTS loja_uso_log_limite_idx
  ON public.loja_uso_log (aluno_id, classe_id, item_codigo, criado_em);

-- Usos anteriores: resolve a situação a partir do alvo gravado.
UPDATE public.loja_uso_log l
   SET atividade_id = a.id, topico_id = a.topico_id
  FROM public.atividades a
 WHERE l.alvo_tipo = 'atividade' AND a.id = l.alvo_id AND l.atividade_id IS NULL;
UPDATE public.loja_uso_log l
   SET questao_id = q.id, atividade_id = a.id, topico_id = a.topico_id
  FROM public.questoes q
  JOIN public.atividades a ON a.id = q.atividade_id
 WHERE l.alvo_tipo = 'questao' AND q.id = l.alvo_id AND l.questao_id IS NULL;
UPDATE public.loja_uso_log l
   SET topico_id = l.alvo_id
 WHERE l.alvo_tipo = 'topico' AND l.topico_id IS NULL;

CREATE TABLE IF NOT EXISTS public.loja_limite_uso (
  id             bigserial PRIMARY KEY,
  classe_id      bigint  NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  escopo         text    NOT NULL CHECK (escopo IN ('classe', 'topico', 'atividade')),
  alvo_id        bigint  NOT NULL DEFAULT 0,
  item_codigo    text    NOT NULL REFERENCES public.loja_itens(codigo),
  por_atividade  integer NULL CHECK (por_atividade IS NULL OR por_atividade BETWEEN -1 AND 100),
  por_questao    integer NULL CHECK (por_questao   IS NULL OR por_questao   BETWEEN -1 AND 100),
  por_topico     integer NULL CHECK (por_topico    IS NULL OR por_topico    BETWEEN -1 AND 100),
  por_dia        integer NULL CHECK (por_dia       IS NULL OR por_dia       BETWEEN -1 AND 100),
  por_semana     integer NULL CHECK (por_semana    IS NULL OR por_semana    BETWEEN -1 AND 100),
  por_turma      integer NULL CHECK (por_turma     IS NULL OR por_turma     BETWEEN -1 AND 100),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loja_limite_uso_alvo CHECK ((escopo = 'classe') = (alvo_id = 0)),
  UNIQUE (classe_id, escopo, alvo_id, item_codigo)
);

COMMENT ON TABLE public.loja_limite_uso IS
  'Quantas unidades de um item o aluno pode USAR, por situação. Camadas: atividade > tópico > turma > padrão do item. NULL herda, 0 bloqueia, -1 sem limite.';

ALTER TABLE public.loja_limite_uso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loja_limite_uso FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.loja_limite_uso TO authenticated;

DROP POLICY IF EXISTS loja_limite_uso_sel ON public.loja_limite_uso;
CREATE POLICY loja_limite_uso_sel ON public.loja_limite_uso
  FOR SELECT TO authenticated
  USING (
    classe_id IN (SELECT public.app_classes_do_aluno())
    OR classe_id IN (SELECT public.app_classes_do_professor())
  );
"""


LIMITES = r"""
-- Limites efetivos de uso de um item numa situação. -1 = sem limite (sai NULL).
CREATE OR REPLACE FUNCTION public.fn_loja_limites(
  p_classe    bigint,
  p_item      text,
  p_atividade bigint,
  p_topico    bigint
)
RETURNS TABLE (
  por_atividade integer,
  por_questao   integer,
  por_topico    integer,
  por_dia       integer,
  por_semana    integer,
  por_turma     integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_a   public.loja_limite_uso%ROWTYPE;
  v_t   public.loja_limite_uso%ROWTYPE;
  v_c   public.loja_limite_uso%ROWTYPE;
  v_ea  public.economia_config_escopo%ROWTYPE;
  v_et  public.economia_config_escopo%ROWTYPE;
  v_retry_turma integer;
  v_efeito text;
  r_ativ integer; r_q integer; r_top integer; r_dia integer; r_sem integer; r_tur integer;
BEGIN
  SELECT efeito INTO v_efeito FROM public.loja_itens WHERE codigo = p_item;

  SELECT * INTO v_a FROM public.loja_limite_uso
   WHERE classe_id = p_classe AND escopo = 'atividade' AND alvo_id = p_atividade AND item_codigo = p_item;
  SELECT * INTO v_t FROM public.loja_limite_uso
   WHERE classe_id = p_classe AND escopo = 'topico' AND alvo_id = p_topico AND item_codigo = p_item;
  SELECT * INTO v_c FROM public.loja_limite_uso
   WHERE classe_id = p_classe AND escopo = 'classe' AND alvo_id = 0 AND item_codigo = p_item;

  -- Colunas antigas (economia_config_escopo.uso_max_*, retry_max_por_topico)
  -- seguem valendo como a camada correspondente, abaixo da tabela nova.
  SELECT * INTO v_ea FROM public.economia_config_escopo
   WHERE escopo = 'atividade' AND alvo_id = p_atividade AND classe_id = p_classe;
  SELECT * INTO v_et FROM public.economia_config_escopo
   WHERE escopo = 'topico' AND alvo_id = p_topico AND classe_id = p_classe;
  SELECT retry_max_por_topico INTO v_retry_turma
    FROM public.loja_config_classe WHERE classe_id = p_classe;

  r_ativ := COALESCE(
    v_a.por_atividade,
    CASE v_efeito WHEN 'prazo_extra' THEN v_ea.uso_max_prazo WHEN 'tempo_extra' THEN v_ea.uso_max_tempo END,
    v_t.por_atividade,
    CASE v_efeito WHEN 'prazo_extra' THEN v_et.uso_max_prazo WHEN 'tempo_extra' THEN v_et.uso_max_tempo END,
    v_c.por_atividade,
    CASE v_efeito WHEN 'prazo_extra' THEN 1 WHEN 'tempo_extra' THEN 3 ELSE -1 END
  );
  r_q := COALESCE(v_a.por_questao, v_t.por_questao, v_c.por_questao,
    CASE v_efeito WHEN 'segunda_chance' THEN 1 WHEN 'dica' THEN 1 ELSE -1 END);
  r_top := COALESCE(
    v_a.por_topico,
    CASE WHEN v_efeito = 'segunda_chance' THEN v_ea.uso_max_retry END,
    v_t.por_topico,
    CASE WHEN v_efeito = 'segunda_chance' THEN v_et.uso_max_retry END,
    v_c.por_topico,
    CASE WHEN v_efeito = 'segunda_chance' THEN COALESCE(v_retry_turma, 1) END,
    -1
  );
  r_dia := COALESCE(v_a.por_dia, v_t.por_dia, v_c.por_dia, -1);
  r_sem := COALESCE(v_a.por_semana, v_t.por_semana, v_c.por_semana, -1);
  r_tur := COALESCE(v_a.por_turma, v_t.por_turma, v_c.por_turma, -1);

  RETURN QUERY SELECT
    NULLIF(r_ativ, -1), NULLIF(r_q, -1), NULLIF(r_top, -1),
    NULLIF(r_dia, -1), NULLIF(r_sem, -1), NULLIF(r_tur, -1);
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_loja_limites(bigint, text, bigint, bigint) FROM PUBLIC, anon, authenticated;

-- Conta os usos do aluno contra os limites. Devolve o primeiro limite batido
-- (do mais específico para o mais amplo) e quantos usos ainda cabem.
CREATE OR REPLACE FUNCTION public.fn_loja_checa_limite(
  p_aluno     uuid,
  p_classe    bigint,
  p_item      text,
  p_atividade bigint,
  p_topico    bigint,
  p_questao   bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_lim      record;
  v_hoje     timestamptz := (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')) AT TIME ZONE 'America/Sao_Paulo';
  v_semana   timestamptz := (date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')) AT TIME ZONE 'America/Sao_Paulo';
  v_u_q      integer; v_u_a integer; v_u_t integer; v_u_d integer; v_u_s integer; v_u_c integer;
  v_bloqueio text;
  v_limite   integer;
  v_usados   integer;
  v_rest     integer;
BEGIN
  SELECT * INTO v_lim FROM public.fn_loja_limites(p_classe, p_item, p_atividade, p_topico);

  SELECT
    count(*) FILTER (WHERE p_questao IS NOT NULL AND l.questao_id = p_questao),
    count(*) FILTER (WHERE p_atividade IS NOT NULL AND l.atividade_id = p_atividade),
    count(*) FILTER (WHERE p_topico IS NOT NULL AND l.topico_id = p_topico),
    count(*) FILTER (WHERE l.criado_em >= v_hoje),
    count(*) FILTER (WHERE l.criado_em >= v_semana),
    count(*)
    INTO v_u_q, v_u_a, v_u_t, v_u_d, v_u_s, v_u_c
    FROM public.loja_uso_log l
   WHERE l.aluno_id = p_aluno AND l.classe_id = p_classe AND l.item_codigo = p_item;

  IF p_questao IS NOT NULL AND v_lim.por_questao IS NOT NULL AND v_u_q >= v_lim.por_questao THEN
    v_bloqueio := 'limite_por_questao'; v_limite := v_lim.por_questao; v_usados := v_u_q;
  ELSIF p_atividade IS NOT NULL AND v_lim.por_atividade IS NOT NULL AND v_u_a >= v_lim.por_atividade THEN
    v_bloqueio := 'limite_por_atividade'; v_limite := v_lim.por_atividade; v_usados := v_u_a;
  ELSIF p_topico IS NOT NULL AND v_lim.por_topico IS NOT NULL AND v_u_t >= v_lim.por_topico THEN
    v_bloqueio := 'limite_por_topico'; v_limite := v_lim.por_topico; v_usados := v_u_t;
  ELSIF v_lim.por_dia IS NOT NULL AND v_u_d >= v_lim.por_dia THEN
    v_bloqueio := 'limite_por_dia'; v_limite := v_lim.por_dia; v_usados := v_u_d;
  ELSIF v_lim.por_semana IS NOT NULL AND v_u_s >= v_lim.por_semana THEN
    v_bloqueio := 'limite_por_semana'; v_limite := v_lim.por_semana; v_usados := v_u_s;
  ELSIF v_lim.por_turma IS NOT NULL AND v_u_c >= v_lim.por_turma THEN
    v_bloqueio := 'limite_por_turma'; v_limite := v_lim.por_turma; v_usados := v_u_c;
  END IF;

  -- NULL = sem limite nesta situação.
  SELECT min(x) INTO v_rest FROM (VALUES
    (CASE WHEN p_questao IS NOT NULL THEN v_lim.por_questao - v_u_q END),
    (CASE WHEN p_atividade IS NOT NULL THEN v_lim.por_atividade - v_u_a END),
    (CASE WHEN p_topico IS NOT NULL THEN v_lim.por_topico - v_u_t END),
    (v_lim.por_dia - v_u_d),
    (v_lim.por_semana - v_u_s),
    (v_lim.por_turma - v_u_c)
  ) AS r(x);

  RETURN jsonb_build_object(
    'bloqueio', v_bloqueio,
    'limite', v_limite,
    'usados', v_usados,
    'restantes', GREATEST(v_rest, 0),
    'limites', jsonb_build_object(
      'por_atividade', v_lim.por_atividade, 'por_questao', v_lim.por_questao,
      'por_topico', v_lim.por_topico, 'por_dia', v_lim.por_dia,
      'por_semana', v_lim.por_semana, 'por_turma', v_lim.por_turma
    ),
    'usos', jsonb_build_object(
      'na_atividade', v_u_a, 'na_questao', v_u_q, 'no_topico', v_u_t,
      'hoje', v_u_d, 'na_semana', v_u_s, 'na_turma', v_u_c
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_loja_checa_limite(uuid, bigint, text, bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;
"""


USAR = r"""
CREATE OR REPLACE FUNCTION public.loja_usar(
  p_compra_id       bigint,
  p_alvo_tipo       text,
  p_alvo_id         bigint,
  p_idempotency_key text,
  p_parametro       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_aluno       uuid := auth.uid();
  v_compra      public.loja_compras%ROWTYPE;
  v_item        public.loja_itens%ROWTYPE;
  v_repetido    jsonb;
  v_classe      bigint;
  v_topico      bigint;
  v_data        timestamptz;
  v_ja_tinha    boolean := false;
  v_pedido      integer;
  v_concedido   integer;
  v_dias        integer := 0;
  v_minutos     integer := 0;
  v_prazo_atual timestamptz;
  v_teto_ativ   integer;
  v_teto_total  integer;
  v_min_dias    integer;
  v_max_dias    integer;
  v_min_min     integer;
  v_max_min     integer;
  v_teto_tempo  integer;
  v_uso_prazo   integer;
  v_uso_tempo   integer;
  v_retry       integer;
  v_usados      integer;
  v_soma        integer;
  v_ultima      timestamptz;
  v_resultado   jsonb;
  v_questao_classe bigint;
  v_atividade   bigint;
  v_questao     bigint;
  v_limite      jsonb;
BEGIN
  IF v_aluno IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'chave_ausente');
  END IF;

  SELECT resultado INTO v_repetido
    FROM public.loja_uso_log
   WHERE aluno_id = v_aluno AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN v_repetido || jsonb_build_object('repetido', true);
  END IF;

  -- A mesma ordem da compra e do estorno: carteira do aluno, depois a linha.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_aluno::text, 0));

  SELECT * INTO v_compra
    FROM public.loja_compras
   WHERE id = p_compra_id AND aluno_id = v_aluno
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'compra_nao_encontrada');
  END IF;

  IF v_compra.status = 'estornada' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'estornada');
  END IF;

  IF v_compra.status <> 'ativa' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'ja_consumida');
  END IF;

  SELECT * INTO v_item FROM public.loja_itens WHERE codigo = v_compra.item_codigo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'item_indisponivel');
  END IF;

  IF v_item.efeito IN ('prazo_extra', 'tempo_extra', 'segunda_chance') THEN
    -- Responder novamente pode mirar a atividade inteira ou uma questão dela.
    IF p_alvo_id IS NULL
       OR (p_alvo_tipo IS DISTINCT FROM 'atividade'
           AND NOT (v_item.efeito = 'segunda_chance' AND p_alvo_tipo = 'questao')) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'alvo_invalido');
    END IF;

    IF p_alvo_tipo = 'questao' THEN
      v_questao := p_alvo_id;
      SELECT q.atividade_id INTO v_atividade FROM public.questoes q WHERE q.id = p_alvo_id;
    ELSE
      v_atividade := p_alvo_id;
    END IF;

    SELECT t.classe_id, a.topico_id, a.data_entrega
      INTO v_classe, v_topico, v_data
      FROM public.atividades a
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE a.id = v_atividade;

    IF v_classe IS NULL OR v_classe IS DISTINCT FROM v_compra.classe_id THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'alvo_de_outra_turma');
    END IF;

    SELECT
      prazo_max_dias_total, prazo_max_por_ativ,
      prazo_extensao_min_dias, prazo_extensao_max_dias,
      tempo_extra_min_minutos, tempo_extra_max_minutos, tempo_max_por_ativ,
      retry_max_por_topico, uso_max_prazo, uso_max_tempo
      INTO v_teto_total, v_teto_ativ, v_min_dias, v_max_dias,
           v_min_min, v_max_min, v_teto_tempo, v_retry, v_uso_prazo, v_uso_tempo
      FROM public.economia_config_efetiva(v_compra.classe_id, v_atividade);

    IF v_teto_total IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'fora_da_turma');
    END IF;

    v_limite := public.fn_loja_checa_limite(
      v_aluno, v_compra.classe_id, v_item.codigo, v_atividade, v_topico, v_questao
    );
    IF v_limite ->> 'bloqueio' IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'erro', v_limite ->> 'bloqueio',
        'limite', (v_limite ->> 'limite')::integer,
        'usados', (v_limite ->> 'usados')::integer
      );
    END IF;
  END IF;

  IF v_item.efeito = 'prazo_extra' THEN
    v_pedido := CASE
      WHEN (v_item.parametros ->> 'dias') ~ '^[0-9]+$'
        THEN (v_item.parametros ->> 'dias')::integer
      ELSE v_min_dias
    END;
    v_concedido := LEAST(GREATEST(v_pedido, v_min_dias), v_max_dias);

    IF v_concedido <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'extensao_desligada');
    END IF;

    SELECT COALESCE(dias_extras, 0), prazo_efetivo
      INTO v_dias, v_prazo_atual
      FROM public.atividade_prazo_aluno
     WHERE aluno_id = v_aluno AND atividade_id = p_alvo_id
     FOR UPDATE;

    v_ja_tinha := FOUND;
    v_dias := COALESCE(v_dias, 0);
    IF NOT v_ja_tinha THEN
      v_prazo_atual := NULL;
    END IF;

    IF v_dias + v_concedido > v_teto_ativ THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'teto_da_atividade',
        'teto', v_teto_ativ, 'usado', v_dias);
    END IF;

    SELECT COALESCE(SUM(p.dias_extras), 0) INTO v_soma
      FROM public.atividade_prazo_aluno p
      JOIN public.atividades a ON a.id = p.atividade_id
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE p.aluno_id = v_aluno AND t.classe_id = v_compra.classe_id;

    IF COALESCE(v_soma, 0) + v_concedido > v_teto_total THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'teto_da_turma',
        'teto', v_teto_total, 'usado', v_soma);
    END IF;

    IF NOT v_ja_tinha THEN
      INSERT INTO public.atividade_prazo_aluno
        (aluno_id, atividade_id, dias_extras, prazo_efetivo)
      VALUES (
        v_aluno, p_alvo_id, v_concedido,
        CASE WHEN v_data IS NULL THEN NULL
             ELSE v_data + make_interval(days => v_concedido) END
      );
    ELSE
      UPDATE public.atividade_prazo_aluno
         SET dias_extras = dias_extras + v_concedido,
             prazo_efetivo = CASE
               WHEN prazo_efetivo IS NOT NULL
                 THEN prazo_efetivo + make_interval(days => v_concedido)
               WHEN v_data IS NOT NULL
                 THEN v_data + make_interval(days => dias_extras + v_concedido)
               ELSE NULL
             END,
             atualizado_em = now()
       WHERE aluno_id = v_aluno AND atividade_id = p_alvo_id;
    END IF;

    SELECT prazo_efetivo INTO v_prazo_atual
      FROM public.atividade_prazo_aluno
     WHERE aluno_id = v_aluno AND atividade_id = p_alvo_id;

    v_resultado := jsonb_build_object(
      'ok', true, 'efeito', 'prazo_extra', 'dias', v_concedido,
      'prazo_efetivo', v_prazo_atual, 'compra_id', v_compra.id
    );

  ELSIF v_item.efeito = 'tempo_extra' THEN
    v_pedido := CASE
      WHEN (v_item.parametros ->> 'minutos') ~ '^[0-9]+$'
        THEN (v_item.parametros ->> 'minutos')::integer
      ELSE v_min_min
    END;
    v_concedido := LEAST(GREATEST(v_pedido, v_min_min), v_max_min);

    IF v_concedido <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'extensao_desligada');
    END IF;

    SELECT COALESCE(minutos_extras, 0) INTO v_minutos
      FROM public.atividade_tempo_aluno
     WHERE aluno_id = v_aluno AND atividade_id = p_alvo_id
     FOR UPDATE;

    v_minutos := COALESCE(v_minutos, 0);

    IF v_minutos + v_concedido > v_teto_tempo THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'teto_da_atividade',
        'teto', v_teto_tempo, 'usado', v_minutos);
    END IF;

    INSERT INTO public.atividade_tempo_aluno (aluno_id, atividade_id, minutos_extras)
    VALUES (v_aluno, p_alvo_id, v_minutos + v_concedido)
    ON CONFLICT (aluno_id, atividade_id)
    DO UPDATE SET minutos_extras = EXCLUDED.minutos_extras, atualizado_em = now();

    v_resultado := jsonb_build_object(
      'ok', true, 'efeito', 'tempo_extra',
      'minutos', v_concedido,
      'minutos_pedidos', v_pedido,
      'minutos_cortados', GREATEST(v_pedido - v_concedido, 0),
      'minutos_na_atividade', v_minutos + v_concedido,
      'compra_id', v_compra.id
    );

  ELSIF v_item.efeito = 'segunda_chance' THEN
    -- O limite por tópico/questão/período já foi checado acima.
    SELECT max(criado_em) INTO v_ultima
      FROM public.atividade_tentativa
     WHERE aluno_id = v_aluno AND atividade_id = v_atividade;

    IF v_ultima IS NOT NULL AND v_ultima > now() - interval '24 hours' THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'cooldown_24h');
    END IF;

    IF NOT public.fn_revisou_topico(v_topico, COALESCE(v_ultima, '-infinity'::timestamptz)) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'revise_o_material');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.questoes q
       WHERE q.atividade_id = v_atividade
         AND (v_questao IS NULL OR q.id = v_questao)
         AND public.fn_questao_elegivel_retry(q.id)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'sem_questao_elegivel');
    END IF;

    v_resultado := jsonb_build_object(
      'ok', true, 'efeito', 'segunda_chance', 'compra_id', v_compra.id,
      'atividade_id', v_atividade, 'questao_id', v_questao
    );

  ELSIF v_item.efeito = 'dica' THEN
    IF p_alvo_tipo IS DISTINCT FROM 'questao' OR p_alvo_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'alvo_invalido');
    END IF;

    SELECT t.classe_id, a.id, a.topico_id INTO v_questao_classe, v_atividade, v_topico
      FROM public.questoes q
      JOIN public.atividades a ON a.id = q.atividade_id
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE q.id = p_alvo_id;

    IF v_questao_classe IS NULL OR v_questao_classe IS DISTINCT FROM v_compra.classe_id THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'alvo_de_outra_turma');
    END IF;

    v_questao := p_alvo_id;

    v_limite := public.fn_loja_checa_limite(
      v_aluno, v_compra.classe_id, v_item.codigo, v_atividade, v_topico, v_questao
    );
    IF v_limite ->> 'bloqueio' IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'erro', v_limite ->> 'bloqueio',
        'limite', (v_limite ->> 'limite')::integer,
        'usados', (v_limite ->> 'usados')::integer
      );
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.loja_dica_liberada
       WHERE aluno_id = v_aluno AND questao_id = p_alvo_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'ja_liberada');
    END IF;

    INSERT INTO public.loja_dica_liberada (aluno_id, questao_id, compra_id)
    VALUES (v_aluno, p_alvo_id, v_compra.id);

    v_resultado := jsonb_build_object(
      'ok', true, 'efeito', 'dica', 'questao_id', p_alvo_id, 'compra_id', v_compra.id
    );

  ELSIF v_item.efeito = 'troca_formato' THEN
    IF p_alvo_id IS NULL
       OR p_parametro IS NULL
       OR p_parametro NOT IN ('audio', 'texto', 'slides') THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'formato_invalido');
    END IF;

    SELECT classe_id INTO v_classe FROM public.topicos WHERE id = p_alvo_id;
    IF v_classe IS NULL OR v_classe IS DISTINCT FROM v_compra.classe_id THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'alvo_de_outra_turma');
    END IF;

    v_topico := p_alvo_id;

    v_limite := public.fn_loja_checa_limite(
      v_aluno, v_compra.classe_id, v_item.codigo, v_atividade, v_topico, v_questao
    );
    IF v_limite ->> 'bloqueio' IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'erro', v_limite ->> 'bloqueio',
        'limite', (v_limite ->> 'limite')::integer,
        'usados', (v_limite ->> 'usados')::integer
      );
    END IF;

    INSERT INTO public.loja_formato_escolhido (aluno_id, topico_id, formato)
    VALUES (v_aluno, p_alvo_id, p_parametro)
    ON CONFLICT (aluno_id, topico_id)
    DO UPDATE SET formato = EXCLUDED.formato, atualizado_em = now();

    v_resultado := jsonb_build_object(
      'ok', true, 'efeito', 'troca_formato', 'formato', p_parametro,
      'compra_id', v_compra.id
    );
  ELSE
    RETURN jsonb_build_object('ok', false, 'erro', 'efeito_desconhecido');
  END IF;

  UPDATE public.loja_compras
     SET status = 'consumida',
         consumido_em = now(),
         alvo_tipo = p_alvo_tipo,
         alvo_id = p_alvo_id
   WHERE id = v_compra.id;

  INSERT INTO public.loja_uso_log
    (aluno_id, compra_id, classe_id, item_codigo, efeito, alvo_tipo, alvo_id,
     idempotency_key, resultado, atividade_id, topico_id, questao_id)
  VALUES
    (v_aluno, v_compra.id, v_compra.classe_id, v_item.codigo, v_item.efeito,
     p_alvo_tipo, p_alvo_id, p_idempotency_key, v_resultado,
     v_atividade, v_topico, v_questao);

  PERFORM public.economia_auditar(
    'uso', 'loja_compras', v_compra.id::text, v_compra.classe_id, v_aluno,
    jsonb_build_object('status', 'ativa'),
    v_resultado
  );

  RETURN v_resultado;
END;
$fn$;

REVOKE ALL ON FUNCTION public.loja_usar(bigint, text, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loja_usar(bigint, text, bigint, text, text) TO authenticated;
"""


CATALOGO = r"""
DROP FUNCTION IF EXISTS public.loja_catalogo(bigint);

CREATE FUNCTION public.loja_catalogo(p_classe_id bigint)
RETURNS TABLE (
  codigo            text,
  nome              text,
  descricao         text,
  efeito            text,
  preco             numeric,
  gratis_restantes  integer,
  disponivel        boolean,
  ordem             integer,
  estoque_restante  integer,
  preco_fator       numeric,
  limite_compras    integer,
  compradas         integer,
  compras_restantes integer,
  em_posse          integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH base AS (
    SELECT
      i.*,
      pc.preco_base AS pc_preco_base,
      pc.estoque AS pc_estoque,
      pc.uso_max_por_aluno AS pc_limite,
      pc.ativo AS pc_ativo,
      COALESCE(pc.preco_fator, i.preco_fator) AS fator,
      c.itens_desligados,
      public.loja_compradas_do_item(p_classe_id, i.codigo) AS ja_compradas,
      (
        SELECT count(*)::integer FROM public.loja_compras vendidas
         WHERE vendidas.classe_id = p_classe_id AND vendidas.item_codigo = i.codigo
           AND vendidas.origem = 'compra' AND vendidas.status <> 'estornada'
      ) AS vendidas,
      (
        SELECT count(*)::integer FROM public.loja_compras minhas
         WHERE minhas.aluno_id = auth.uid() AND minhas.classe_id = p_classe_id
           AND minhas.item_codigo = i.codigo AND minhas.status = 'ativa'
      ) AS ativas
    FROM public.loja_itens i
    LEFT JOIN public.loja_config_classe c ON c.classe_id = p_classe_id
    LEFT JOIN public.loja_preco_classe pc
      ON pc.classe_id = p_classe_id AND pc.item_codigo = i.codigo
  )
  SELECT
    b.codigo,
    b.nome,
    b.descricao,
    b.efeito,
    ceil(COALESCE(b.pc_preco_base, b.preco_base) * power(b.fator, b.ja_compradas))::numeric AS preco,
    public.loja_saldo_item(p_classe_id, b.codigo) AS gratis_restantes,
    (
      b.ativo
      AND COALESCE(b.pc_ativo, true)
      AND NOT (b.codigo = ANY(COALESCE(b.itens_desligados, '{}'::text[])))
      AND (b.pc_estoque IS NULL OR b.pc_estoque > b.vendidas)
    ) AS disponivel,
    b.ordem,
    CASE WHEN b.pc_estoque IS NULL THEN NULL ELSE GREATEST(0, b.pc_estoque - b.vendidas) END AS estoque_restante,
    b.fator AS preco_fator,
    b.pc_limite AS limite_compras,
    b.ja_compradas AS compradas,
    CASE WHEN b.pc_limite IS NULL THEN NULL ELSE GREATEST(0, b.pc_limite - b.ja_compradas) END AS compras_restantes,
    b.ativas AS em_posse
  FROM base b
  ORDER BY b.ordem;
$fn$;

REVOKE ALL ON FUNCTION public.loja_catalogo(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loja_catalogo(bigint) TO authenticated;
"""


INVENTARIO = r"""
CREATE OR REPLACE FUNCTION public.loja_inventario(p_classe_id bigint)
RETURNS TABLE (
  item_codigo text,
  ativos      integer,
  usados      integer,
  estornados  integer,
  total       integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT
    c.item_codigo,
    count(*) FILTER (WHERE c.status = 'ativa')::integer,
    count(*) FILTER (WHERE c.status = 'consumida')::integer,
    count(*) FILTER (WHERE c.status = 'estornada')::integer,
    count(*)::integer
  FROM public.loja_compras c
  WHERE c.aluno_id = auth.uid() AND c.classe_id = p_classe_id
  GROUP BY c.item_codigo
  ORDER BY c.item_codigo;
$fn$;

REVOKE ALL ON FUNCTION public.loja_inventario(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loja_inventario(bigint) TO authenticated;
"""


COMPRAR = r"""
DROP FUNCTION IF EXISTS public.loja_comprar(text, bigint, text, text, bigint, text);

CREATE FUNCTION public.loja_comprar(
  p_item            text,
  p_classe_id       bigint,
  p_idempotency_key text,
  p_alvo_tipo       text    DEFAULT NULL,
  p_alvo_id         bigint  DEFAULT NULL,
  p_parametro       text    DEFAULT NULL,
  p_quantidade      integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_aluno       uuid := auth.uid();
  v_item        public.loja_itens%ROWTYPE;
  v_preco_turma public.loja_preco_classe%ROWTYPE;
  v_desligados  text[];
  v_gratis      integer;
  v_qtd_gratis  integer;
  v_qtd_paga    integer;
  v_compradas   integer;
  v_vendidas    integer;
  v_preco_base  numeric;
  v_fator       numeric;
  v_precos      numeric[] := '{}';
  v_total       numeric := 0;
  v_saldo       numeric;
  v_antes       numeric;
  v_ids         bigint[] := '{}';
  v_origens     text[] := '{}';
  v_compra_id   bigint;
  v_chave       text;
  v_origem      text;
  v_preco       numeric;
  i             integer;
BEGIN
  IF v_aluno IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'chave_ausente');
  END IF;

  IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 20 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'quantidade_invalida', 'maximo', 20);
  END IF;

  -- Pedido repetido devolve o mesmo lote, sem cobrar de novo.
  SELECT array_agg(id ORDER BY id) INTO v_ids
    FROM public.loja_compras
   WHERE aluno_id = v_aluno
     AND (idempotency_key = p_idempotency_key OR lote_chave = p_idempotency_key);
  IF v_ids IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'repetido', true,
      'compra_id', v_ids[1], 'compra_ids', to_jsonb(v_ids),
      'quantidade', cardinality(v_ids),
      'saldo', public.loja_saldo()
    );
  END IF;
  v_ids := '{}';

  IF p_classe_id NOT IN (SELECT public.app_classes_do_aluno()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'fora_da_turma');
  END IF;

  SELECT * INTO v_item FROM public.loja_itens WHERE codigo = p_item;
  IF NOT FOUND OR NOT v_item.ativo THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'item_indisponivel');
  END IF;

  SELECT * INTO v_preco_turma
    FROM public.loja_preco_classe
   WHERE classe_id = p_classe_id AND item_codigo = p_item;

  IF v_preco_turma.ativo IS FALSE THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'item_desligado_na_turma');
  END IF;

  SELECT itens_desligados INTO v_desligados
    FROM public.loja_config_classe WHERE classe_id = p_classe_id;

  IF p_item = ANY(COALESCE(v_desligados, '{}'::text[])) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'item_desligado_na_turma');
  END IF;

  IF v_item.efeito = 'troca_formato'
     AND (p_alvo_id IS NOT NULL OR p_parametro IS NOT NULL) THEN
    IF p_alvo_id IS NULL
       OR p_parametro IS NULL
       OR p_parametro NOT IN ('audio', 'texto', 'slides') THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'formato_invalido');
    END IF;
    IF p_quantidade <> 1 THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'quantidade_invalida', 'maximo', 1);
    END IF;
  END IF;

  -- Trava do estoque antes da carteira (mesma ordem do estorno).
  PERFORM pg_advisory_xact_lock(
    hashtextextended('estoque:' || p_classe_id::text || ':' || p_item, 0)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(v_aluno::text, 0));

  SELECT array_agg(id ORDER BY id) INTO v_ids
    FROM public.loja_compras
   WHERE aluno_id = v_aluno
     AND (idempotency_key = p_idempotency_key OR lote_chave = p_idempotency_key);
  IF v_ids IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'repetido', true,
      'compra_id', v_ids[1], 'compra_ids', to_jsonb(v_ids),
      'quantidade', cardinality(v_ids),
      'saldo', public.loja_saldo()
    );
  END IF;
  v_ids := '{}';

  -- Unidades grátis (dotação) primeiro; o resto é compra.
  v_gratis := public.loja_saldo_item(p_classe_id, p_item);
  v_qtd_gratis := LEAST(v_gratis, p_quantidade);
  v_qtd_paga := p_quantidade - v_qtd_gratis;

  IF v_qtd_paga > 0 THEN
    v_compradas := public.loja_compradas_do_item(p_classe_id, p_item);

    IF v_preco_turma.uso_max_por_aluno IS NOT NULL
       AND v_compradas + v_qtd_paga > v_preco_turma.uso_max_por_aluno THEN
      RETURN jsonb_build_object(
        'ok', false, 'erro', 'limite_de_compras',
        'limite', v_preco_turma.uso_max_por_aluno,
        'restantes', GREATEST(0, v_preco_turma.uso_max_por_aluno - v_compradas) + v_qtd_gratis
      );
    END IF;

    IF v_preco_turma.estoque IS NOT NULL THEN
      SELECT count(*) INTO v_vendidas
        FROM public.loja_compras
       WHERE classe_id = p_classe_id
         AND item_codigo = p_item
         AND origem = 'compra'
         AND status <> 'estornada';
      IF COALESCE(v_vendidas, 0) + v_qtd_paga > v_preco_turma.estoque THEN
        RETURN jsonb_build_object(
          'ok', false, 'erro', 'estoque_esgotado',
          'restantes', GREATEST(0, v_preco_turma.estoque - COALESCE(v_vendidas, 0)) + v_qtd_gratis
        );
      END IF;
    END IF;

    v_preco_base := COALESCE(v_preco_turma.preco_base, v_item.preco_base);
    v_fator := COALESCE(v_preco_turma.preco_fator, v_item.preco_fator, 1);
  END IF;

  FOR i IN 1..p_quantidade LOOP
    IF i <= v_qtd_gratis THEN
      v_precos := v_precos || 0::numeric;
    ELSE
      v_preco := ceil(v_preco_base * power(v_fator, v_compradas + (i - v_qtd_gratis - 1)));
      v_precos := v_precos || v_preco;
      v_total := v_total + v_preco;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(delta), 0) INTO v_saldo
    FROM public.moedas_ledger
   WHERE aluno_id = v_aluno;
  v_antes := v_saldo;

  IF v_saldo < v_total THEN
    RETURN jsonb_build_object(
      'ok', false, 'erro', 'saldo_insuficiente',
      'saldo', v_saldo, 'preco', v_total, 'precos', to_jsonb(v_precos)
    );
  END IF;

  -- Uma linha por unidade: cada uma usa, estorna e aparece no razão sozinha.
  FOR i IN 1..p_quantidade LOOP
    v_origem := CASE WHEN i <= v_qtd_gratis THEN 'dotacao' ELSE 'compra' END;
    v_preco := v_precos[i];
    v_chave := CASE WHEN i = 1 THEN p_idempotency_key ELSE p_idempotency_key || '#' || i::text END;

    INSERT INTO public.loja_compras
      (aluno_id, classe_id, item_codigo, origem, preco_pago,
       alvo_tipo, alvo_id, idempotency_key, lote_chave)
    VALUES
      (v_aluno, p_classe_id, p_item, v_origem, v_preco,
       p_alvo_tipo, p_alvo_id, v_chave,
       CASE WHEN p_quantidade > 1 THEN p_idempotency_key END)
    RETURNING id INTO v_compra_id;

    v_ids := v_ids || v_compra_id;
    v_origens := v_origens || v_origem;

    IF v_preco > 0 THEN
      INSERT INTO public.moedas_ledger
        (aluno_id, delta, motivo, classe_id, compra_id)
      VALUES
        (v_aluno, -v_preco, 'compra', p_classe_id, v_compra_id);
    END IF;

    PERFORM public.economia_auditar(
      'compra', 'loja_compras', v_compra_id::text, p_classe_id, v_aluno,
      jsonb_build_object('saldo', v_antes),
      jsonb_build_object(
        'compra_id', v_compra_id, 'item', p_item, 'origem', v_origem,
        'preco', v_preco, 'unidade', i, 'quantidade', p_quantidade,
        'saldo', v_antes - v_preco
      )
    );
    v_antes := v_antes - v_preco;
  END LOOP;

  IF v_item.efeito = 'troca_formato'
     AND p_alvo_id IS NOT NULL
     AND p_parametro IN ('audio', 'texto', 'slides') THEN
    INSERT INTO public.loja_formato_escolhido (aluno_id, topico_id, formato)
    VALUES (v_aluno, p_alvo_id, p_parametro)
    ON CONFLICT (aluno_id, topico_id)
    DO UPDATE SET formato = EXCLUDED.formato, atualizado_em = now();

    UPDATE public.loja_compras
       SET status = 'consumida', consumido_em = now()
     WHERE id = v_ids[1];
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'compra_id', v_ids[1],
    'compra_ids', to_jsonb(v_ids),
    'quantidade', p_quantidade,
    'origem', v_origens[1],
    'origens', to_jsonb(v_origens),
    'preco', v_total,
    'precos', to_jsonb(v_precos),
    'saldo', public.loja_saldo()
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.loja_comprar(text, bigint, text, text, bigint, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loja_comprar(text, bigint, text, text, bigint, text, integer) TO authenticated;
"""


USAR_ITEM = r"""
-- Usa UMA unidade do item: a posse ativa mais antiga (FIFO).
CREATE OR REPLACE FUNCTION public.loja_usar_item(
  p_item            text,
  p_classe_id       bigint,
  p_alvo_tipo       text,
  p_alvo_id         bigint,
  p_idempotency_key text,
  p_parametro       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_aluno    uuid := auth.uid();
  v_repetido jsonb;
  v_compra   bigint;
BEGIN
  IF v_aluno IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'chave_ausente');
  END IF;

  SELECT resultado INTO v_repetido
    FROM public.loja_uso_log
   WHERE aluno_id = v_aluno AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_repetido || jsonb_build_object('repetido', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_aluno::text, 0));

  SELECT resultado INTO v_repetido
    FROM public.loja_uso_log
   WHERE aluno_id = v_aluno AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_repetido || jsonb_build_object('repetido', true);
  END IF;

  SELECT id INTO v_compra
    FROM public.loja_compras
   WHERE aluno_id = v_aluno AND classe_id = p_classe_id
     AND item_codigo = p_item AND status = 'ativa'
   ORDER BY criado_em, id
   LIMIT 1;

  IF v_compra IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_unidade');
  END IF;

  RETURN public.loja_usar(v_compra, p_alvo_tipo, p_alvo_id, p_idempotency_key, p_parametro);
END;
$fn$;

REVOKE ALL ON FUNCTION public.loja_usar_item(text, bigint, text, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loja_usar_item(text, bigint, text, bigint, text, text) TO authenticated;
"""


PERMITIDOS = r"""
-- Quantas unidades o aluno ainda pode usar nesta situação, e por que não.
CREATE OR REPLACE FUNCTION public.loja_usos_permitidos(
  p_classe_id bigint,
  p_item      text,
  p_alvo_tipo text,
  p_alvo_id   bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_aluno     uuid := auth.uid();
  v_atividade bigint;
  v_topico    bigint;
  v_questao   bigint;
  v_classe    bigint;
  v_ativos    integer;
  v_limite    jsonb;
  v_bloqueio  text;
  v_rest      integer;
BEGIN
  IF v_aluno IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;
  IF p_classe_id NOT IN (SELECT public.app_classes_do_aluno()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'fora_da_turma');
  END IF;

  IF p_alvo_tipo = 'atividade' THEN
    SELECT a.id, a.topico_id, t.classe_id INTO v_atividade, v_topico, v_classe
      FROM public.atividades a JOIN public.topicos t ON t.id = a.topico_id
     WHERE a.id = p_alvo_id;
  ELSIF p_alvo_tipo = 'questao' THEN
    SELECT q.id, a.id, a.topico_id, t.classe_id INTO v_questao, v_atividade, v_topico, v_classe
      FROM public.questoes q
      JOIN public.atividades a ON a.id = q.atividade_id
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE q.id = p_alvo_id;
  ELSIF p_alvo_tipo = 'topico' THEN
    SELECT t.id, t.classe_id INTO v_topico, v_classe FROM public.topicos t WHERE t.id = p_alvo_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'erro', 'alvo_invalido');
  END IF;

  IF v_classe IS DISTINCT FROM p_classe_id THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'alvo_de_outra_turma');
  END IF;

  SELECT count(*)::integer INTO v_ativos
    FROM public.loja_compras
   WHERE aluno_id = v_aluno AND classe_id = p_classe_id
     AND item_codigo = p_item AND status = 'ativa';

  v_limite := public.fn_loja_checa_limite(v_aluno, p_classe_id, p_item, v_atividade, v_topico, v_questao);
  v_bloqueio := v_limite ->> 'bloqueio';
  IF v_bloqueio IS NULL AND v_ativos = 0 THEN
    v_bloqueio := 'sem_unidade';
  END IF;

  v_rest := CASE
    WHEN v_limite ->> 'restantes' IS NULL THEN v_ativos
    ELSE LEAST(v_ativos, (v_limite ->> 'restantes')::integer)
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'item', p_item,
    'ativos', v_ativos,
    'restantes', CASE WHEN v_limite ->> 'bloqueio' IS NOT NULL THEN 0 ELSE v_rest END,
    'restantes_no_limite', (v_limite ->> 'restantes')::integer,
    'bloqueio', v_bloqueio,
    'limite', (v_limite ->> 'limite')::integer,
    'usados', (v_limite ->> 'usados')::integer,
    'limites', v_limite -> 'limites',
    'usos', v_limite -> 'usos'
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.loja_usos_permitidos(bigint, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loja_usos_permitidos(bigint, text, text, bigint) TO authenticated;
"""


SALVAR_LIMITE = r"""
CREATE OR REPLACE FUNCTION public.economia_salvar_limite_uso(
  p_classe_id     bigint,
  p_escopo        text,
  p_alvo_id       bigint,
  p_item          text,
  p_por_atividade integer,
  p_por_questao   integer,
  p_por_topico    integer,
  p_por_dia       integer,
  p_por_semana    integer,
  p_por_turma     integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_alvo  bigint := CASE WHEN p_escopo = 'classe' THEN 0 ELSE p_alvo_id END;
  v_antes jsonb;
  v_ok    boolean;
BEGIN
  IF auth.uid() IS NULL OR p_classe_id NOT IN (SELECT public.app_classes_do_professor()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;

  IF p_escopo IS NULL OR p_escopo NOT IN ('classe', 'topico', 'atividade')
     OR (p_escopo <> 'classe' AND p_alvo_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'escopo_invalido');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.loja_itens WHERE codigo = p_item) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'item_indisponivel');
  END IF;

  IF p_escopo = 'topico' THEN
    SELECT EXISTS (SELECT 1 FROM public.topicos WHERE id = v_alvo AND classe_id = p_classe_id) INTO v_ok;
  ELSIF p_escopo = 'atividade' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.atividades a JOIN public.topicos t ON t.id = a.topico_id
       WHERE a.id = v_alvo AND t.classe_id = p_classe_id
    ) INTO v_ok;
  ELSE
    v_ok := true;
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'alvo_de_outra_turma');
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[p_por_atividade, p_por_questao, p_por_topico,
                               p_por_dia, p_por_semana, p_por_turma]) AS v(x)
     WHERE x IS NOT NULL AND (x < -1 OR x > 100)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'faixa_invalida');
  END IF;

  SELECT to_jsonb(l) INTO v_antes
    FROM public.loja_limite_uso l
   WHERE l.classe_id = p_classe_id AND l.escopo = p_escopo
     AND l.alvo_id = v_alvo AND l.item_codigo = p_item;

  IF p_por_atividade IS NULL AND p_por_questao IS NULL AND p_por_topico IS NULL
     AND p_por_dia IS NULL AND p_por_semana IS NULL AND p_por_turma IS NULL THEN
    DELETE FROM public.loja_limite_uso
     WHERE classe_id = p_classe_id AND escopo = p_escopo
       AND alvo_id = v_alvo AND item_codigo = p_item;
  ELSE
    INSERT INTO public.loja_limite_uso
      (classe_id, escopo, alvo_id, item_codigo, por_atividade, por_questao,
       por_topico, por_dia, por_semana, por_turma, atualizado_em)
    VALUES
      (p_classe_id, p_escopo, v_alvo, p_item, p_por_atividade, p_por_questao,
       p_por_topico, p_por_dia, p_por_semana, p_por_turma, now())
    ON CONFLICT (classe_id, escopo, alvo_id, item_codigo) DO UPDATE SET
      por_atividade = EXCLUDED.por_atividade,
      por_questao = EXCLUDED.por_questao,
      por_topico = EXCLUDED.por_topico,
      por_dia = EXCLUDED.por_dia,
      por_semana = EXCLUDED.por_semana,
      por_turma = EXCLUDED.por_turma,
      atualizado_em = now();
  END IF;

  PERFORM public.economia_auditar(
    'config_limite_uso', 'loja_limite_uso',
    p_classe_id::text || ':' || p_escopo || ':' || v_alvo::text || ':' || p_item,
    p_classe_id, NULL, v_antes,
    jsonb_build_object(
      'escopo', p_escopo, 'alvo_id', v_alvo, 'item', p_item,
      'por_atividade', p_por_atividade, 'por_questao', p_por_questao,
      'por_topico', p_por_topico, 'por_dia', p_por_dia,
      'por_semana', p_por_semana, 'por_turma', p_por_turma
    )
  );

  RETURN jsonb_build_object('ok', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.economia_salvar_limite_uso(bigint, text, bigint, text, integer, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.economia_salvar_limite_uso(bigint, text, bigint, text, integer, integer, integer, integer, integer, integer) TO authenticated;
"""


PRECO = r"""
DROP FUNCTION IF EXISTS public.economia_salvar_preco_classe(bigint, text, numeric, integer, integer, boolean);

CREATE FUNCTION public.economia_salvar_preco_classe(
  p_classe_id bigint,
  p_item text,
  p_preco_base numeric,
  p_estoque integer,
  p_uso_max_por_aluno integer,
  p_ativo boolean,
  p_preco_fator numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_antes jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_classe_id NOT IN (SELECT public.app_classes_do_professor()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.loja_itens WHERE codigo = p_item) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'item_indisponivel');
  END IF;

  IF (p_preco_base IS NOT NULL AND p_preco_base <= 0)
     OR (p_estoque IS NOT NULL AND p_estoque < 0)
     OR (p_uso_max_por_aluno IS NOT NULL AND p_uso_max_por_aluno < 0)
     OR (p_preco_fator IS NOT NULL AND (p_preco_fator < 1 OR p_preco_fator > 5)) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'faixa_invalida');
  END IF;

  SELECT to_jsonb(p) INTO v_antes
    FROM public.loja_preco_classe p
   WHERE p.classe_id = p_classe_id AND p.item_codigo = p_item;

  IF p_preco_base IS NULL AND p_estoque IS NULL AND p_uso_max_por_aluno IS NULL
     AND p_ativo IS NULL AND p_preco_fator IS NULL THEN
    DELETE FROM public.loja_preco_classe
     WHERE classe_id = p_classe_id AND item_codigo = p_item;
  ELSE
    INSERT INTO public.loja_preco_classe
      (classe_id, item_codigo, preco_base, estoque, uso_max_por_aluno, ativo, preco_fator, atualizado_em)
    VALUES
      (p_classe_id, p_item, p_preco_base, p_estoque, p_uso_max_por_aluno, p_ativo, p_preco_fator, now())
    ON CONFLICT (classe_id, item_codigo) DO UPDATE SET
      preco_base = EXCLUDED.preco_base,
      estoque = EXCLUDED.estoque,
      uso_max_por_aluno = EXCLUDED.uso_max_por_aluno,
      ativo = EXCLUDED.ativo,
      preco_fator = EXCLUDED.preco_fator,
      atualizado_em = now();
  END IF;

  PERFORM public.economia_auditar(
    'config_preco', 'loja_preco_classe', p_classe_id::text || ':' || p_item,
    p_classe_id, NULL, v_antes,
    jsonb_build_object(
      'preco_base', p_preco_base, 'estoque', p_estoque,
      'uso_max_por_aluno', p_uso_max_por_aluno, 'ativo', p_ativo,
      'preco_fator', p_preco_fator
    )
  );

  RETURN jsonb_build_object('ok', true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.economia_salvar_preco_classe(bigint, text, numeric, integer, integer, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.economia_salvar_preco_classe(bigint, text, numeric, integer, integer, boolean, numeric) TO authenticated;
"""


NOVAS = """
DROP FUNCTION IF EXISTS public.loja_usar_item(text, bigint, text, bigint, text, text);
DROP FUNCTION IF EXISTS public.loja_usos_permitidos(bigint, text, text, bigint);
DROP FUNCTION IF EXISTS public.loja_inventario(bigint);
DROP FUNCTION IF EXISTS public.economia_salvar_limite_uso(
  bigint, text, bigint, text, integer, integer, integer, integer, integer, integer
);
DROP FUNCTION IF EXISTS public.fn_loja_checa_limite(uuid, bigint, text, bigint, bigint, bigint);
DROP FUNCTION IF EXISTS public.fn_loja_limites(bigint, text, bigint, bigint);
"""


def upgrade() -> None:
    op.execute(TABELAS)
    op.execute(LIMITES)
    op.execute(USAR)
    op.execute(CATALOGO)
    op.execute(INVENTARIO)
    op.execute(COMPRAR)
    op.execute(USAR_ITEM)
    op.execute(PERMITIDOS)
    op.execute(SALVAR_LIMITE)
    op.execute(PRECO)
    op.execute("NOTIFY pgrst, 'reload schema';")


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo} para restaurar o downgrade")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def downgrade() -> None:
    # Volta compra, uso, catálogo e preço da turma ao corpo de 20261020_02/03.
    # Apaga só as funções novas. loja_limite_uso, lote_chave, preco_fator e as
    # colunas novas do log ficam, com os dados: são histórico do aluno e
    # configuração do professor.
    compra = _modulo("20261020_02_economia_compra_e_uso.py")
    config = _modulo("20261020_03_economia_metas_extrato_auditoria.py")
    op.execute(compra.USAR)
    op.execute(NOVAS)
    op.execute("DROP FUNCTION IF EXISTS public.loja_comprar(text, bigint, text, text, bigint, text, integer);")
    op.execute(compra.COMPRAR)
    op.execute("GRANT EXECUTE ON FUNCTION public.loja_comprar(text, bigint, text, text, bigint, text) TO authenticated;")
    op.execute(compra.CATALOGO)
    op.execute(
        "DROP FUNCTION IF EXISTS public.economia_salvar_preco_classe("
        "bigint, text, numeric, integer, integer, boolean, numeric);"
    )
    op.execute(config.CONFIG)
    op.execute("NOTIFY pgrst, 'reload schema';")
