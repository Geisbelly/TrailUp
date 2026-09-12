"""a posse dos itens, e a contagem que poe a dotacao antes da compra

Dotacao e compra moram na mesma tabela porque uma unidade dada e' uma posse
como outra qualquer -- so' que com `preco_pago = 0`. A distincao importa em
exatamente dois lugares:

  - preco: a escalada de `preco_fator` conta so' `origem = 'compra'`. Ganhar
    unidade nao encarece a seguinte;
  - teto: o teto do professor conta TODAS as posses. Ele e' decisao pedagogica
    sobre quanto prazo e' aceitavel, nao sobre quanto o aluno pagou.

A concessao da dotacao e' derivada, nao materializada na matricula:
`dotacao - usadas + compradas`. Materializar criaria a pergunta insoluvel do
que fazer quando o professor mudar a dotacao depois -- quem entrou antes fica
com a antiga? Derivando, mudar o numero vale para todos na hora.

Revision ID: 20260912_04
Revises: 20260912_03
Create Date: 2026-09-12
"""

from alembic import op

revision = "20260912_04"
down_revision = "20260912_03"
branch_labels = None
depends_on = None


TABELA = """
CREATE TABLE IF NOT EXISTS public.loja_compras (
  id               bigserial PRIMARY KEY,
  aluno_id         uuid    NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  classe_id        bigint  NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  item_codigo      text    NOT NULL REFERENCES public.loja_itens(codigo),
  origem           text    NOT NULL DEFAULT 'compra'
                     CHECK (origem IN ('compra','dotacao','concessao')),
  preco_pago       numeric NOT NULL DEFAULT 0 CHECK (preco_pago >= 0),
  alvo_tipo        text    NULL CHECK (alvo_tipo IN ('atividade','topico','questao')),
  alvo_id          bigint  NULL,
  status           text    NOT NULL DEFAULT 'ativa'
                     CHECK (status IN ('ativa','consumida','estornada')),
  idempotency_key  text    NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  consumido_em     timestamptz NULL,
  UNIQUE (aluno_id, idempotency_key)
);

COMMENT ON COLUMN public.loja_compras.origem IS
  'compra | dotacao | concessao. So importa em dois lugares: a escalada de
   preco conta apenas compra, e o teto do professor conta todas.';

CREATE INDEX IF NOT EXISTS loja_compras_aluno_item_idx
  ON public.loja_compras (aluno_id, classe_id, item_codigo);

ALTER TABLE public.loja_compras ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.loja_compras FROM anon, authenticated;

DROP POLICY IF EXISTS loja_compras_sel_proprio ON public.loja_compras;
CREATE POLICY loja_compras_sel_proprio ON public.loja_compras
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid());

DROP POLICY IF EXISTS loja_compras_sel_professor ON public.loja_compras;
CREATE POLICY loja_compras_sel_professor ON public.loja_compras
  FOR SELECT TO authenticated
  USING (aluno_id IN (SELECT public.app_alunos_do_professor()));
"""

SALDO_ITEM = """
CREATE OR REPLACE FUNCTION public.loja_saldo_item(
  p_classe_id bigint,
  p_item      text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_dotacao integer;
  v_usadas  integer;
BEGIN
  SELECT COALESCE(quantidade, 0) INTO v_dotacao
    FROM public.loja_dotacao
   WHERE classe_id = p_classe_id AND item_codigo = p_item;

  v_dotacao := COALESCE(v_dotacao, 0);

  SELECT count(*) INTO v_usadas
    FROM public.loja_compras
   WHERE aluno_id = auth.uid()
     AND classe_id = p_classe_id
     AND item_codigo = p_item
     AND origem = 'dotacao'
     AND status <> 'estornada';

  RETURN GREATEST(0, v_dotacao - COALESCE(v_usadas, 0));
END;
$fn$;

-- Quantas unidades o aluno ja COMPROU deste item, para a escalada de preco.
-- Conta so' origem = 'compra': ganhar unidade nao encarece a seguinte.
CREATE OR REPLACE FUNCTION public.loja_compradas_do_item(
  p_classe_id bigint,
  p_item      text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT COALESCE(count(*), 0)::integer
    FROM public.loja_compras
   WHERE aluno_id = auth.uid()
     AND classe_id = p_classe_id
     AND item_codigo = p_item
     AND origem = 'compra'
     AND status <> 'estornada';
$fn$;

GRANT EXECUTE ON FUNCTION public.loja_saldo_item(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.loja_compradas_do_item(bigint, text) TO authenticated;
"""


CATALOGO = """
CREATE OR REPLACE FUNCTION public.loja_catalogo(p_classe_id bigint)
RETURNS TABLE (
  codigo           text,
  nome             text,
  descricao        text,
  efeito           text,
  preco            numeric,
  gratis_restantes integer,
  disponivel       boolean,
  ordem            integer
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
    -- A n-esima COMPRA custa preco_base * preco_fator^(n-1). Arredondado para
    -- cima: preco quebrado numa moeda inteira confunde mais do que ajuda.
    ceil(
      i.preco_base
      * power(i.preco_fator, public.loja_compradas_do_item(p_classe_id, i.codigo))
    )::numeric AS preco,
    public.loja_saldo_item(p_classe_id, i.codigo) AS gratis_restantes,
    (i.ativo AND NOT (i.codigo = ANY(
       COALESCE(c.itens_desligados, '{}'::text[])
     ))) AS disponivel,
    i.ordem
  FROM public.loja_itens i
  LEFT JOIN public.loja_config_classe c ON c.classe_id = p_classe_id
  ORDER BY i.ordem;
$fn$;

GRANT EXECUTE ON FUNCTION public.loja_catalogo(bigint) TO authenticated;
"""


EFEITO_FORMATO = """
CREATE TABLE IF NOT EXISTS public.loja_formato_escolhido (
  aluno_id      uuid   NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  topico_id     bigint NOT NULL,
  formato       text   NOT NULL CHECK (formato IN ('audio','texto','slides')),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, topico_id)
);

COMMENT ON TABLE public.loja_formato_escolhido IS
  'Formato que o aluno COMPROU para um topico. Tabela propria de proposito:
   conteudo_personalizado.formato_prioritario e reescrito pelo pipeline por
   source_hash, e uma regeracao apagaria o que o aluno pagou.';

ALTER TABLE public.loja_formato_escolhido ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.loja_formato_escolhido
  FROM anon, authenticated;

DROP POLICY IF EXISTS loja_formato_escolhido_sel ON public.loja_formato_escolhido;
CREATE POLICY loja_formato_escolhido_sel ON public.loja_formato_escolhido
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid());
"""

COMPRAR = """
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
  v_existente  public.loja_compras%ROWTYPE;
  v_desligados text[];
  v_gratis     integer;
  v_compradas  integer;
  v_preco      numeric := 0;
  v_saldo      numeric;
  v_origem     text := 'compra';
  v_compra_id  bigint;
BEGIN
  IF v_aluno IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  -- 1. Idempotencia. O pedido pode ter chegado e a resposta ter se perdido;
  -- repetir devolve a mesma compra em vez de cobrar de novo.
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

  -- 2. Matricula, pelo helper: predicado que consultasse classe_aluno direto
  -- entraria em recursao de RLS.
  IF p_classe_id NOT IN (SELECT public.app_classes_do_aluno()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'fora_da_turma');
  END IF;

  -- 3. Item ligado.
  SELECT * INTO v_item FROM public.loja_itens WHERE codigo = p_item;
  IF NOT FOUND OR NOT v_item.ativo THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'item_indisponivel');
  END IF;

  SELECT itens_desligados INTO v_desligados
    FROM public.loja_config_classe WHERE classe_id = p_classe_id;

  IF p_item = ANY(COALESCE(v_desligados, '{}'::text[])) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'item_desligado_na_turma');
  END IF;

  -- 4. Teto e gate ficam nas fatias 3 e 4, com os efeitos que os exigem.

  -- 5. Dotacao primeiro. Unidade gratuita nao consulta preco nem saldo: negar
  -- algo gratis a quem esta sem moeda seria negar justamente a quem a dotacao
  -- existe para proteger.
  v_gratis := public.loja_saldo_item(p_classe_id, p_item);

  IF v_gratis > 0 THEN
    v_origem := 'dotacao';
    v_preco := 0;
  ELSE
    -- 6. Preco, com a escalada contando so' as unidades compradas.
    v_compradas := public.loja_compradas_do_item(p_classe_id, p_item);
    v_preco := ceil(v_item.preco_base * power(v_item.preco_fator, v_compradas));

    -- 7. Saldo, com a carteira travada.
    --
    -- Trava por advisory lock, e nao por FOR UPDATE: o Postgres recusa
    -- `FOR UPDATE` junto de funcao de agregacao ("FOR UPDATE is not allowed
    -- with aggregate functions"), e travar linha por linha nao ajudaria de
    -- qualquer forma -- o problema e a linha que AINDA NAO existe, inserida por
    -- uma compra simultanea. O lock e por aluno e morre com a transacao.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_aluno::text, 0));

    SELECT COALESCE(SUM(delta), 0) INTO v_saldo
      FROM public.moedas_ledger
     WHERE aluno_id = v_aluno;

    IF v_saldo < v_preco THEN
      RETURN jsonb_build_object(
        'ok', false, 'erro', 'saldo_insuficiente',
        'saldo', v_saldo, 'preco', v_preco
      );
    END IF;
  END IF;

  -- 8. A posse.
  INSERT INTO public.loja_compras
    (aluno_id, classe_id, item_codigo, origem, preco_pago,
     alvo_tipo, alvo_id, idempotency_key)
  VALUES
    (v_aluno, p_classe_id, p_item, v_origem, v_preco,
     p_alvo_tipo, p_alvo_id, p_idempotency_key)
  RETURNING id INTO v_compra_id;

  -- 9. O debito, apontando para a compra: sem compra_id o extrato diria que
  -- saiu moeda sem dizer por que.
  IF v_preco > 0 THEN
    INSERT INTO public.moedas_ledger
      (aluno_id, delta, motivo, classe_id, compra_id)
    VALUES
      (v_aluno, -v_preco, 'compra', p_classe_id, v_compra_id);
  END IF;

  -- 10. O efeito. Nesta fatia so' `troca_formato`; os outros tres chegam com
  -- as suas salvaguardas nas fatias 3 e 4.
  IF v_item.efeito = 'troca_formato' THEN
    -- `p_parametro IS NULL` explicito: `NULL NOT IN (...)` devolve NULL, nao
    -- TRUE, entao sem esta guarda o IF nao dispararia e o NULL seguiria ate
    -- estourar no CHECK, longe daqui.
    IF p_parametro IS NULL
       OR p_parametro NOT IN ('audio','texto','slides')
       OR p_alvo_id IS NULL THEN
      RAISE EXCEPTION 'troca_formato exige alvo e formato validos';
    END IF;

    INSERT INTO public.loja_formato_escolhido (aluno_id, topico_id, formato)
    VALUES (v_aluno, p_alvo_id, p_parametro)
    ON CONFLICT (aluno_id, topico_id)
    DO UPDATE SET formato = EXCLUDED.formato, atualizado_em = now();

    UPDATE public.loja_compras
       SET status = 'consumida', consumido_em = now()
     WHERE id = v_compra_id;
  END IF;

  -- 11. O saldo devolvido sai do banco, nunca de conta feita no cliente.
  RETURN jsonb_build_object(
    'ok', true,
    'compra_id', v_compra_id,
    'origem', v_origem,
    'preco', v_preco,
    'saldo', public.loja_saldo()
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION
  public.loja_comprar(text, bigint, text, text, bigint, text) TO authenticated;
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(SALDO_ITEM)
    op.execute(CATALOGO)
    op.execute(EFEITO_FORMATO)
    op.execute(COMPRAR)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.loja_formato_escolhido CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.loja_compras CASCADE;")
