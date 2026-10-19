"""compra com preço da turma, e o uso do item na atividade

A vitrine comprava sem alvo. `segunda_chance` recusava isso, e `prazo_extra`
não gravava prazo nenhum: o item ficava na posse e a trilha não mudava. A
compra passa a só conceder a posse (preço, estoque e limite da turma entram
aqui). O efeito sai em `loja_usar`, com teto do professor e chave para não
aplicar duas vezes quando a resposta se perde.

Revision ID: 20261020_02
Revises: 20261020_01
Create Date: 2026-10-19
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261020_02"
down_revision = "20261020_01"
branch_labels = None
depends_on = None


TABELAS = """
CREATE TABLE IF NOT EXISTS public.atividade_prazo_aluno (
  aluno_id      uuid    NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  atividade_id  bigint  NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  dias_extras   integer NOT NULL DEFAULT 0 CHECK (dias_extras >= 0),
  prazo_efetivo timestamptz NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, atividade_id)
);

COMMENT ON TABLE public.atividade_prazo_aluno IS
  'Extensão comprada, por aluno. prazo_efetivo não segue uma edição posterior da data da turma.';

CREATE TABLE IF NOT EXISTS public.atividade_tempo_aluno (
  aluno_id        uuid    NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  atividade_id    bigint  NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  minutos_extras  integer NOT NULL DEFAULT 0 CHECK (minutos_extras >= 0),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, atividade_id)
);

COMMENT ON TABLE public.atividade_tempo_aluno IS
  'Minutos concedidos por tempo_extra. O que o teto cortou do pedido fica em loja_uso_log.resultado.minutos_cortados.';

CREATE TABLE IF NOT EXISTS public.loja_dica_liberada (
  aluno_id    uuid   NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  questao_id  bigint NOT NULL,
  compra_id   bigint NULL REFERENCES public.loja_compras(id),
  liberada_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, questao_id)
);

CREATE TABLE IF NOT EXISTS public.loja_uso_log (
  id               bigserial PRIMARY KEY,
  aluno_id         uuid    NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  compra_id        bigint  NOT NULL REFERENCES public.loja_compras(id),
  classe_id        bigint  NULL,
  item_codigo      text    NOT NULL,
  efeito           text    NOT NULL,
  alvo_tipo        text    NULL,
  alvo_id          bigint  NULL,
  idempotency_key  text    NOT NULL,
  resultado        jsonb   NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, idempotency_key)
);

COMMENT ON TABLE public.loja_uso_log IS
  'Log append-only de uso. A chave do cliente faz o pedido repetido devolver o mesmo resultado.';

CREATE INDEX IF NOT EXISTS loja_uso_log_alvo_idx
  ON public.loja_uso_log (aluno_id, efeito, alvo_id);

ALTER TABLE public.atividade_prazo_aluno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atividade_tempo_aluno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loja_dica_liberada ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loja_uso_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.atividade_prazo_aluno FROM anon, authenticated;
REVOKE ALL ON public.atividade_tempo_aluno FROM anon, authenticated;
REVOKE ALL ON public.loja_dica_liberada FROM anon, authenticated;
REVOKE ALL ON public.loja_uso_log FROM anon, authenticated;

GRANT SELECT ON public.atividade_prazo_aluno TO authenticated;
GRANT SELECT ON public.atividade_tempo_aluno TO authenticated;
GRANT SELECT ON public.loja_dica_liberada TO authenticated;
GRANT SELECT ON public.loja_uso_log TO authenticated;

DROP POLICY IF EXISTS atividade_prazo_aluno_sel ON public.atividade_prazo_aluno;
CREATE POLICY atividade_prazo_aluno_sel ON public.atividade_prazo_aluno
  FOR SELECT TO authenticated
  USING (
    aluno_id = auth.uid()
    OR aluno_id IN (SELECT public.app_alunos_do_professor())
  );

DROP POLICY IF EXISTS atividade_tempo_aluno_sel ON public.atividade_tempo_aluno;
CREATE POLICY atividade_tempo_aluno_sel ON public.atividade_tempo_aluno
  FOR SELECT TO authenticated
  USING (
    aluno_id = auth.uid()
    OR aluno_id IN (SELECT public.app_alunos_do_professor())
  );

DROP POLICY IF EXISTS loja_dica_liberada_sel ON public.loja_dica_liberada;
CREATE POLICY loja_dica_liberada_sel ON public.loja_dica_liberada
  FOR SELECT TO authenticated
  USING (
    aluno_id = auth.uid()
    OR aluno_id IN (SELECT public.app_alunos_do_professor())
  );

DROP POLICY IF EXISTS loja_uso_log_sel ON public.loja_uso_log;
CREATE POLICY loja_uso_log_sel ON public.loja_uso_log
  FOR SELECT TO authenticated
  USING (
    aluno_id = auth.uid()
    OR aluno_id IN (SELECT public.app_alunos_do_professor())
  );
"""


PRAZO_QUANDO_A_DATA_NASCE = """
CREATE OR REPLACE FUNCTION public.fn_atividade_aplica_prazo_comprado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NEW.data_entrega IS NULL OR NEW.data_entrega IS NOT DISTINCT FROM OLD.data_entrega THEN
    RETURN NEW;
  END IF;

  -- Só preenche o que ainda não tinha data. Um prazo_efetivo já gravado não
  -- acompanha a edição: a extensão comprada fica onde foi concedida.
  UPDATE public.atividade_prazo_aluno
     SET prazo_efetivo = NEW.data_entrega + make_interval(days => dias_extras),
         atualizado_em = now()
   WHERE atividade_id = NEW.id
     AND prazo_efetivo IS NULL;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_atividade_aplica_prazo_comprado ON public.atividades;
CREATE TRIGGER trg_atividade_aplica_prazo_comprado
  AFTER UPDATE OF data_entrega ON public.atividades
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_atividade_aplica_prazo_comprado();
"""


CONFIG_EFETIVA = """
CREATE OR REPLACE FUNCTION public.economia_config_efetiva(
  p_classe_id bigint,
  p_atividade_id bigint
)
RETURNS TABLE (
  prazo_max_dias_total integer,
  prazo_max_por_ativ integer,
  prazo_extensao_min_dias integer,
  prazo_extensao_max_dias integer,
  tempo_extra_min_minutos integer,
  tempo_extra_max_minutos integer,
  tempo_max_por_ativ integer,
  retry_max_por_topico integer,
  uso_max_prazo integer,
  uso_max_tempo integer,
  uso_max_retry integer,
  topico_id bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF auth.uid() IS NULL
     OR (
       p_classe_id NOT IN (SELECT public.app_classes_do_aluno())
       AND p_classe_id NOT IN (SELECT public.app_classes_do_professor())
     ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(c.prazo_max_dias_total, 2),
    COALESCE(ea.prazo_max_por_ativ, et.prazo_max_por_ativ, c.prazo_max_por_ativ, 2),
    COALESCE(ea.prazo_extensao_min_dias, et.prazo_extensao_min_dias, c.prazo_extensao_min_dias, 1),
    COALESCE(ea.prazo_extensao_max_dias, et.prazo_extensao_max_dias, c.prazo_extensao_max_dias, 1),
    COALESCE(ea.tempo_extra_min_minutos, et.tempo_extra_min_minutos, c.tempo_extra_min_minutos, 5),
    COALESCE(ea.tempo_extra_max_minutos, et.tempo_extra_max_minutos, c.tempo_extra_max_minutos, 15),
    COALESCE(ea.tempo_max_por_ativ, et.tempo_max_por_ativ, c.tempo_max_por_ativ, 30),
    COALESCE(ea.uso_max_retry, et.uso_max_retry, c.retry_max_por_topico, 1),
    COALESCE(ea.uso_max_prazo, et.uso_max_prazo),
    COALESCE(ea.uso_max_tempo, et.uso_max_tempo),
    ea.uso_max_retry,
    a.topico_id
  FROM (SELECT p_atividade_id AS atividade_id, p_classe_id AS classe_id) s
  LEFT JOIN public.atividades a ON a.id = s.atividade_id
  LEFT JOIN public.loja_config_classe c ON c.classe_id = s.classe_id
  LEFT JOIN public.economia_config_escopo ea
    ON ea.escopo = 'atividade' AND ea.alvo_id = s.atividade_id AND ea.classe_id = s.classe_id
  LEFT JOIN public.economia_config_escopo et
    ON et.escopo = 'topico' AND et.alvo_id = a.topico_id AND et.classe_id = s.classe_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.economia_config_efetiva(bigint, bigint) TO authenticated;
"""


CATALOGO = """
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
  estoque_restante  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT
    i.codigo,
    i.nome,
    i.descricao,
    i.efeito,
    ceil(
      COALESCE(pc.preco_base, i.preco_base)
      * power(i.preco_fator, public.loja_compradas_do_item(p_classe_id, i.codigo))
    )::numeric AS preco,
    public.loja_saldo_item(p_classe_id, i.codigo) AS gratis_restantes,
    (
      i.ativo
      AND COALESCE(pc.ativo, true)
      AND NOT (i.codigo = ANY(COALESCE(c.itens_desligados, '{}'::text[])))
      AND (
        pc.estoque IS NULL
        OR pc.estoque > (
          SELECT count(*)::integer
            FROM public.loja_compras vendidas
           WHERE vendidas.classe_id = p_classe_id
             AND vendidas.item_codigo = i.codigo
             AND vendidas.origem = 'compra'
             AND vendidas.status <> 'estornada'
        )
      )
    ) AS disponivel,
    i.ordem,
    CASE
      WHEN pc.estoque IS NULL THEN NULL
      ELSE GREATEST(
        0,
        pc.estoque - (
          SELECT count(*)::integer
            FROM public.loja_compras vendidas
           WHERE vendidas.classe_id = p_classe_id
             AND vendidas.item_codigo = i.codigo
             AND vendidas.origem = 'compra'
             AND vendidas.status <> 'estornada'
        )
      )
    END AS estoque_restante
  FROM public.loja_itens i
  LEFT JOIN public.loja_config_classe c ON c.classe_id = p_classe_id
  LEFT JOIN public.loja_preco_classe pc
    ON pc.classe_id = p_classe_id AND pc.item_codigo = i.codigo
  ORDER BY i.ordem;
$fn$;

GRANT EXECUTE ON FUNCTION public.loja_catalogo(bigint) TO authenticated;
"""


COMPRAR = r"""
CREATE OR REPLACE FUNCTION public.loja_comprar(
  p_item            text,
  p_classe_id       bigint,
  p_idempotency_key text,
  p_alvo_tipo       text   DEFAULT NULL,
  p_alvo_id         bigint DEFAULT NULL,
  p_parametro       text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_aluno      uuid := auth.uid();
  v_item       public.loja_itens%ROWTYPE;
  v_preco_turma public.loja_preco_classe%ROWTYPE;
  v_existente  public.loja_compras%ROWTYPE;
  v_desligados text[];
  v_gratis     integer;
  v_compradas  integer;
  v_vendidas   integer;
  v_preco_base numeric;
  v_preco      numeric := 0;
  v_saldo      numeric;
  v_origem     text := 'compra';
  v_compra_id  bigint;
  v_antes      numeric;
BEGIN
  IF v_aluno IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'chave_ausente');
  END IF;

  SELECT * INTO v_existente
    FROM public.loja_compras
   WHERE aluno_id = v_aluno AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'repetido', true,
      'compra_id', v_existente.id,
      'saldo', public.loja_saldo()
    );
  END IF;

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

  -- Aplicar na hora só quando o cliente já mandou o alvo. Sem alvo, a posse
  -- fica ativa e `loja_usar` faz o efeito na trilha.
  IF v_item.efeito = 'troca_formato'
     AND (p_alvo_id IS NOT NULL OR p_parametro IS NOT NULL) THEN
    IF p_alvo_id IS NULL
       OR p_parametro IS NULL
       OR p_parametro NOT IN ('audio', 'texto', 'slides') THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'formato_invalido');
    END IF;
  END IF;

  -- Trava do estoque antes da carteira. As duas pontas (compra e estorno)
  -- concordam com esta ordem: estoque, depois aluno.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('estoque:' || p_classe_id::text || ':' || p_item, 0)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(v_aluno::text, 0));

  SELECT * INTO v_existente
    FROM public.loja_compras
   WHERE aluno_id = v_aluno AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'repetido', true,
      'compra_id', v_existente.id,
      'saldo', public.loja_saldo()
    );
  END IF;

  v_gratis := public.loja_saldo_item(p_classe_id, p_item);

  IF v_gratis > 0 THEN
    v_origem := 'dotacao';
    v_preco := 0;
  ELSE
    IF v_preco_turma.uso_max_por_aluno IS NOT NULL THEN
      SELECT count(*) INTO v_compradas
        FROM public.loja_compras
       WHERE aluno_id = v_aluno
         AND classe_id = p_classe_id
         AND item_codigo = p_item
         AND origem = 'compra'
         AND status <> 'estornada';
      IF COALESCE(v_compradas, 0) >= v_preco_turma.uso_max_por_aluno THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'limite_de_compras');
      END IF;
    END IF;

    IF v_preco_turma.estoque IS NOT NULL THEN
      SELECT count(*) INTO v_vendidas
        FROM public.loja_compras
       WHERE classe_id = p_classe_id
         AND item_codigo = p_item
         AND origem = 'compra'
         AND status <> 'estornada';
      IF COALESCE(v_vendidas, 0) >= v_preco_turma.estoque THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'estoque_esgotado');
      END IF;
    END IF;

    v_compradas := public.loja_compradas_do_item(p_classe_id, p_item);
    v_preco_base := COALESCE(v_preco_turma.preco_base, v_item.preco_base);
    v_preco := ceil(v_preco_base * power(v_item.preco_fator, v_compradas));

    SELECT COALESCE(SUM(delta), 0) INTO v_saldo
      FROM public.moedas_ledger
     WHERE aluno_id = v_aluno;

    v_antes := v_saldo;

    IF v_saldo < v_preco THEN
      RETURN jsonb_build_object(
        'ok', false, 'erro', 'saldo_insuficiente',
        'saldo', v_saldo, 'preco', v_preco
      );
    END IF;
  END IF;

  INSERT INTO public.loja_compras
    (aluno_id, classe_id, item_codigo, origem, preco_pago,
     alvo_tipo, alvo_id, idempotency_key)
  VALUES
    (v_aluno, p_classe_id, p_item, v_origem, v_preco,
     p_alvo_tipo, p_alvo_id, p_idempotency_key)
  RETURNING id INTO v_compra_id;

  IF v_preco > 0 THEN
    INSERT INTO public.moedas_ledger
      (aluno_id, delta, motivo, classe_id, compra_id)
    VALUES
      (v_aluno, -v_preco, 'compra', p_classe_id, v_compra_id);
  END IF;

  IF v_item.efeito = 'troca_formato'
     AND p_alvo_id IS NOT NULL
     AND p_parametro IN ('audio', 'texto', 'slides') THEN
    INSERT INTO public.loja_formato_escolhido (aluno_id, topico_id, formato)
    VALUES (v_aluno, p_alvo_id, p_parametro)
    ON CONFLICT (aluno_id, topico_id)
    DO UPDATE SET formato = EXCLUDED.formato, atualizado_em = now();

    UPDATE public.loja_compras
       SET status = 'consumida', consumido_em = now()
     WHERE id = v_compra_id;
  END IF;

  PERFORM public.economia_auditar(
    'compra', 'loja_compras', v_compra_id::text, p_classe_id, v_aluno,
    jsonb_build_object('saldo', v_antes),
    jsonb_build_object(
      'compra_id', v_compra_id, 'item', p_item, 'origem', v_origem,
      'preco', v_preco, 'saldo', public.loja_saldo()
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'compra_id', v_compra_id,
    'origem', v_origem,
    'preco', v_preco,
    'saldo', public.loja_saldo()
  );
END;
$fn$;
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
    IF p_alvo_tipo IS DISTINCT FROM 'atividade' OR p_alvo_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'alvo_invalido');
    END IF;

    SELECT t.classe_id, a.topico_id, a.data_entrega
      INTO v_classe, v_topico, v_data
      FROM public.atividades a
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE a.id = p_alvo_id;

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
      FROM public.economia_config_efetiva(v_compra.classe_id, p_alvo_id);

    IF v_teto_total IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'fora_da_turma');
    END IF;
  END IF;

  IF v_item.efeito = 'prazo_extra' THEN
    IF COALESCE(v_uso_prazo, v_teto_ativ) IS NOT NULL AND v_uso_prazo IS NOT NULL THEN
      SELECT count(*) INTO v_usados
        FROM public.loja_uso_log
       WHERE aluno_id = v_aluno AND efeito = 'prazo_extra' AND alvo_id = p_alvo_id;
      IF v_usados >= v_uso_prazo THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'limite_de_uso');
      END IF;
    END IF;

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
    IF v_uso_tempo IS NOT NULL THEN
      SELECT count(*) INTO v_usados
        FROM public.loja_uso_log
       WHERE aluno_id = v_aluno AND efeito = 'tempo_extra' AND alvo_id = p_alvo_id;
      IF v_usados >= v_uso_tempo THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'limite_de_uso');
      END IF;
    END IF;

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
    SELECT count(*) INTO v_usados
      FROM public.loja_compras c
      JOIN public.atividades a ON a.id = c.alvo_id
     WHERE c.aluno_id = v_aluno
       AND c.item_codigo = 'segunda_chance'
       AND c.status = 'consumida'
       AND a.topico_id = v_topico;

    IF COALESCE(v_usados, 0) >= v_retry THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'teto_do_topico');
    END IF;

    SELECT max(criado_em) INTO v_ultima
      FROM public.atividade_tentativa
     WHERE aluno_id = v_aluno AND atividade_id = p_alvo_id;

    IF v_ultima IS NOT NULL AND v_ultima > now() - interval '24 hours' THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'cooldown_24h');
    END IF;

    IF NOT public.fn_revisou_topico(v_topico, COALESCE(v_ultima, '-infinity'::timestamptz)) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'revise_o_material');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.questoes q
       WHERE q.atividade_id = p_alvo_id
         AND public.fn_questao_elegivel_retry(q.id)
    ) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'sem_questao_elegivel');
    END IF;

    v_resultado := jsonb_build_object(
      'ok', true, 'efeito', 'segunda_chance', 'compra_id', v_compra.id,
      'atividade_id', p_alvo_id
    );

  ELSIF v_item.efeito = 'dica' THEN
    IF p_alvo_tipo IS DISTINCT FROM 'questao' OR p_alvo_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'alvo_invalido');
    END IF;

    SELECT t.classe_id INTO v_questao_classe
      FROM public.questoes q
      JOIN public.atividades a ON a.id = q.atividade_id
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE q.id = p_alvo_id;

    IF v_questao_classe IS NULL OR v_questao_classe IS DISTINCT FROM v_compra.classe_id THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'alvo_de_outra_turma');
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
     idempotency_key, resultado)
  VALUES
    (v_aluno, v_compra.id, v_compra.classe_id, v_item.codigo, v_item.efeito,
     p_alvo_tipo, p_alvo_id, p_idempotency_key, v_resultado);

  PERFORM public.economia_auditar(
    'uso', 'loja_compras', v_compra.id::text, v_compra.classe_id, v_aluno,
    jsonb_build_object('status', 'ativa'),
    v_resultado
  );

  RETURN v_resultado;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.loja_usar(bigint, text, bigint, text, text) TO authenticated;
"""


ESTORNAR = r"""
CREATE OR REPLACE FUNCTION public.loja_estornar(
  p_compra_id bigint,
  p_motivo    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_professor uuid := auth.uid();
  v_compra    public.loja_compras%ROWTYPE;
  v_motivo    text := left(btrim(coalesce(p_motivo, '')), 280);
BEGIN
  IF v_professor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_compra FROM public.loja_compras WHERE id = p_compra_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'compra_nao_encontrada');
  END IF;

  IF v_compra.classe_id NOT IN (SELECT public.app_classes_do_professor()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('estoque:' || v_compra.classe_id::text || ':' || v_compra.item_codigo, 0)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(v_compra.aluno_id::text, 0));

  SELECT * INTO v_compra
    FROM public.loja_compras
   WHERE id = p_compra_id
   FOR UPDATE;

  IF v_compra.status = 'estornada' THEN
    RETURN jsonb_build_object('ok', true, 'repetido', true, 'compra_id', v_compra.id);
  END IF;

  IF v_compra.status <> 'ativa' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'ja_usado');
  END IF;

  UPDATE public.loja_compras
     SET status = 'estornada'
   WHERE id = v_compra.id;

  IF v_compra.preco_pago > 0 THEN
    INSERT INTO public.moedas_ledger
      (aluno_id, delta, motivo, classe_id, compra_id, referencia)
    VALUES
      (v_compra.aluno_id, v_compra.preco_pago, 'estorno', v_compra.classe_id,
       v_compra.id, 'estorno:' || v_compra.id::text);
  END IF;

  PERFORM public.economia_auditar(
    'estorno', 'loja_compras', v_compra.id::text, v_compra.classe_id, v_compra.aluno_id,
    jsonb_build_object('status', 'ativa', 'preco_pago', v_compra.preco_pago),
    jsonb_build_object('status', 'estornada', 'motivo', NULLIF(v_motivo, ''))
  );

  RETURN jsonb_build_object('ok', true, 'compra_id', v_compra.id, 'devolvido', v_compra.preco_pago);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.loja_estornar(bigint, text) TO authenticated;
"""


def upgrade() -> None:
    op.execute(TABELAS)
    op.execute(PRAZO_QUANDO_A_DATA_NASCE)
    op.execute(CONFIG_EFETIVA)
    op.execute(CATALOGO)
    op.execute(COMPRAR)
    op.execute(USAR)
    op.execute(ESTORNAR)
    op.execute("NOTIFY pgrst, 'reload schema';")


def _constante(arquivo: str, nome: str) -> str:
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo} para restaurar o downgrade")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return str(getattr(modulo, nome))


def downgrade() -> None:
    # Devolve catálogo e compra ao corpo anterior a esta migration.
    # Não derruba prazo, tempo, dica nem log de uso: isso é dado do aluno.
    # loja_usar e o gatilho do prazo continuam, senão o que já foi concedido
    # deixa de valer no dia em que a atividade ganha data.
    op.execute("DROP FUNCTION IF EXISTS public.loja_catalogo(bigint);")
    op.execute(_constante("20260912_04_loja_compra.py", "CATALOGO"))
    op.execute(_constante("20260912_05_segunda_chance.py", "COMPRAR_V2"))
    op.execute("NOTIFY pgrst, 'reload schema';")
