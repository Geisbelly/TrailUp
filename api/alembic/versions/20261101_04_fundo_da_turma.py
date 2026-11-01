"""Recompensa coletiva: fundo da turma com meta (#144)

## O que é

Decisão de 01/11 (Geisbelly): a recompensa coletiva é um **fundo da turma**. O professor abre o fundo
com uma meta em moedas e o benefício que a turma ganha (por exemplo, "+1 dia de prazo na próxima
lista"). Os alunos doam moedas; quando a soma bate a meta, o fundo fica `atingido` e o professor
entrega o benefício. É o "recompensa coletiva, 50 SP, une a turma" de O'Donovan et al. §5.3.2.

## Regras

- **Um fundo ativo por turma** (`aberto` ou `atingido`), por índice único parcial.
- **Doar é atômico e idempotente:** debita o razão (`moedas_ledger`, motivo `compra`, referência
  `fundo_turma:<id>`) e soma ao fundo na mesma transação, ou não faz nada. Mesma chave = mesma
  doação. Trava o fundo e depois o aluno (a mesma ordem do cancelamento).
- **Doação não passa da meta:** o que excede o que falta não é cobrado.
- **Cancelar devolve tudo:** cada doação vira um `estorno` no razão.
- **Privacidade:** o aluno vê o total do fundo e a própria doação, nunca a dos colegas (quem doou pouco
  não fica exposto, a mesma razão do corte no rank). O professor vê as doações da turma dele.
- Ninguém escreve nas tabelas pelo cliente: só pelas RPCs, que conferem a posse.

## Retenção (LGPD)

As duas tabelas têm dado de pessoa e entram em `retencao_politica` como `vida_da_conta`: o fundo sai
com a turma (FK `ON DELETE CASCADE`), e a doação sai com o fundo ou com a conta do aluno (FK). Não é
`saida_turma` porque aquela regra precisa de `classe_id` na própria tabela, e a doação não tem.

O benefício é texto do professor: entregar é ele quem faz (estender um prazo, liberar algo), e
`fundo_turma_encerrar` registra que foi entregue.

Revision ID: 20261101_04
Revises: 20261101_03
Create Date: 2026-11-01
"""

from alembic import op

revision = "20261101_04"
down_revision = "20261101_03"
branch_labels = None
depends_on = None

TABELAS = r"""
CREATE TABLE IF NOT EXISTS public.fundos_turma (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  classe_id    bigint      NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  titulo       text        NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 80),
  beneficio    text        NOT NULL CHECK (char_length(btrim(beneficio)) BETWEEN 1 AND 300),
  meta         integer     NOT NULL CHECK (meta BETWEEN 1 AND 100000),
  arrecadado   integer     NOT NULL DEFAULT 0 CHECK (arrecadado >= 0),
  status       text        NOT NULL DEFAULT 'aberto'
                 CHECK (status IN ('aberto', 'atingido', 'entregue', 'cancelado')),
  criado_por   uuid        NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  atingido_em  timestamptz NULL,
  encerrado_em timestamptz NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS fundos_turma_um_ativo
  ON public.fundos_turma (classe_id) WHERE status IN ('aberto', 'atingido');

CREATE TABLE IF NOT EXISTS public.fundos_turma_contribuicao (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fundo_id        bigint      NOT NULL REFERENCES public.fundos_turma(id) ON DELETE CASCADE,
  aluno_id        uuid        NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  moedas          integer     NOT NULL CHECK (moedas > 0),
  idempotency_key text        NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  estornada_em    timestamptz NULL,
  UNIQUE (aluno_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS fundos_turma_contribuicao_fundo_idx
  ON public.fundos_turma_contribuicao (fundo_id);
"""

RETENCAO = r"""
INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo) VALUES
  ('fundos_turma', 'vida_da_conta', 'criado_por', 'vida_da_conta',
   'fundo da turma (criado_por = professor); sai com a turma pela FK'),
  ('fundos_turma_contribuicao', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'doacao ao fundo da turma; sai com o fundo ou com a conta do aluno pela FK')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

RLS = r"""
ALTER TABLE public.fundos_turma ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fundos_turma_contribuicao ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.fundos_turma, public.fundos_turma_contribuicao FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fundos_turma, public.fundos_turma_contribuicao FROM authenticated;
GRANT SELECT ON public.fundos_turma, public.fundos_turma_contribuicao TO authenticated;

DROP POLICY IF EXISTS fundos_turma_sel ON public.fundos_turma;
CREATE POLICY fundos_turma_sel ON public.fundos_turma
  FOR SELECT TO authenticated
  USING (
    classe_id IN (SELECT public.app_classes_do_professor())
    OR classe_id IN (SELECT public.app_classes_do_aluno())
  );

DROP POLICY IF EXISTS fundos_turma_contribuicao_sel ON public.fundos_turma_contribuicao;
CREATE POLICY fundos_turma_contribuicao_sel ON public.fundos_turma_contribuicao
  FOR SELECT TO authenticated
  USING (
    aluno_id = auth.uid()
    OR fundo_id IN (
      SELECT f.id FROM public.fundos_turma f
       WHERE f.classe_id IN (SELECT public.app_classes_do_professor())
    )
  );
"""

FUNCOES = r"""
CREATE OR REPLACE FUNCTION public.fundo_turma_criar(
  p_classe_id bigint,
  p_titulo    text,
  p_beneficio text,
  p_meta      integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_id bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'turma_nao_encontrada_ou_sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF p_meta IS NULL OR p_meta < 1 OR p_meta > 100000 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'meta_invalida');
  END IF;
  IF char_length(btrim(COALESCE(p_titulo, ''))) NOT BETWEEN 1 AND 80
     OR char_length(btrim(COALESCE(p_beneficio, ''))) NOT BETWEEN 1 AND 300 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'texto_invalido');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('fundo_turma_classe:' || p_classe_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.fundos_turma
              WHERE classe_id = p_classe_id AND status IN ('aberto', 'atingido')) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'fundo_ja_ativo');
  END IF;

  INSERT INTO public.fundos_turma (classe_id, titulo, beneficio, meta, criado_por)
  VALUES (p_classe_id, btrim(p_titulo), btrim(p_beneficio), p_meta, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.economia_auditar(
    'fundo_criar', 'fundos_turma', v_id::text, p_classe_id, NULL, NULL,
    jsonb_build_object('meta', p_meta, 'titulo', btrim(p_titulo))
  );
  RETURN jsonb_build_object('ok', true, 'fundo_id', v_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fundo_turma_contribuir(
  p_fundo_id        bigint,
  p_moedas          integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_aluno     uuid := auth.uid();
  v_fundo     public.fundos_turma%ROWTYPE;
  v_existente public.fundos_turma_contribuicao%ROWTYPE;
  v_saldo     numeric;
  v_valor     integer;
  v_id        bigint;
BEGIN
  IF v_aluno IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'chave_ausente');
  END IF;
  IF p_moedas IS NULL OR p_moedas < 1 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'valor_invalido');
  END IF;

  SELECT * INTO v_fundo FROM public.fundos_turma WHERE id = p_fundo_id;
  IF NOT FOUND OR v_fundo.classe_id NOT IN (SELECT public.app_classes_do_aluno()) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'fundo_indisponivel');
  END IF;

  -- Fundo, depois carteira: a mesma ordem do cancelamento, que devolve a todos.
  PERFORM pg_advisory_xact_lock(hashtextextended('fundo_turma:' || p_fundo_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_aluno::text, 0));

  SELECT * INTO v_existente FROM public.fundos_turma_contribuicao
   WHERE aluno_id = v_aluno AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT * INTO v_fundo FROM public.fundos_turma WHERE id = v_existente.fundo_id;
    RETURN jsonb_build_object('ok', true, 'repetido', true, 'moedas', v_existente.moedas,
                              'arrecadado', v_fundo.arrecadado, 'meta', v_fundo.meta, 'status', v_fundo.status,
                              'saldo', public.loja_saldo());
  END IF;

  SELECT * INTO v_fundo FROM public.fundos_turma WHERE id = p_fundo_id;
  IF v_fundo.status <> 'aberto' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'fundo_fechado', 'status', v_fundo.status);
  END IF;

  -- O que passa da meta não é cobrado.
  v_valor := LEAST(p_moedas, v_fundo.meta - v_fundo.arrecadado);

  SELECT COALESCE(SUM(delta), 0) INTO v_saldo FROM public.moedas_ledger WHERE aluno_id = v_aluno;
  IF v_saldo < v_valor THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'saldo_insuficiente', 'saldo', v_saldo, 'valor', v_valor);
  END IF;

  INSERT INTO public.fundos_turma_contribuicao (fundo_id, aluno_id, moedas, idempotency_key)
  VALUES (p_fundo_id, v_aluno, v_valor, p_idempotency_key)
  RETURNING id INTO v_id;

  INSERT INTO public.moedas_ledger (aluno_id, delta, motivo, referencia, classe_id)
  VALUES (v_aluno, -v_valor, 'compra', 'fundo_turma:' || p_fundo_id::text, v_fundo.classe_id);

  UPDATE public.fundos_turma
     SET arrecadado = arrecadado + v_valor,
         status = CASE WHEN arrecadado + v_valor >= meta THEN 'atingido' ELSE status END,
         atingido_em = CASE WHEN arrecadado + v_valor >= meta THEN now() ELSE atingido_em END
   WHERE id = p_fundo_id
  RETURNING * INTO v_fundo;

  PERFORM public.economia_auditar(
    'fundo_contribuir', 'fundos_turma_contribuicao', v_id::text, v_fundo.classe_id, v_aluno,
    jsonb_build_object('saldo', v_saldo),
    jsonb_build_object('moedas', v_valor, 'arrecadado', v_fundo.arrecadado, 'status', v_fundo.status)
  );

  RETURN jsonb_build_object('ok', true, 'moedas', v_valor, 'arrecadado', v_fundo.arrecadado,
                            'meta', v_fundo.meta, 'status', v_fundo.status, 'saldo', public.loja_saldo());
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fundo_turma_encerrar(p_fundo_id bigint, p_entregue boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_fundo      public.fundos_turma%ROWTYPE;
  v_devolvidas integer := 0;
  v_c          record;
BEGIN
  SELECT * INTO v_fundo FROM public.fundos_turma WHERE id = p_fundo_id;
  IF auth.uid() IS NULL OR NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_fundo.classe_id
  ) THEN
    RAISE EXCEPTION 'fundo_nao_encontrado_ou_sem_permissao' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('fundo_turma:' || p_fundo_id::text, 0));
  SELECT * INTO v_fundo FROM public.fundos_turma WHERE id = p_fundo_id;

  IF p_entregue THEN
    IF v_fundo.status <> 'atingido' THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'meta_nao_atingida', 'status', v_fundo.status);
    END IF;
    UPDATE public.fundos_turma SET status = 'entregue', encerrado_em = now() WHERE id = p_fundo_id;
  ELSE
    IF v_fundo.status NOT IN ('aberto', 'atingido') THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'fundo_ja_encerrado', 'status', v_fundo.status);
    END IF;
    FOR v_c IN
      SELECT * FROM public.fundos_turma_contribuicao
       WHERE fundo_id = p_fundo_id AND estornada_em IS NULL
       ORDER BY id
    LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended(v_c.aluno_id::text, 0));
      INSERT INTO public.moedas_ledger (aluno_id, delta, motivo, referencia, classe_id)
      VALUES (v_c.aluno_id, v_c.moedas, 'estorno', 'fundo_turma:' || p_fundo_id::text, v_fundo.classe_id);
      UPDATE public.fundos_turma_contribuicao SET estornada_em = now() WHERE id = v_c.id;
      v_devolvidas := v_devolvidas + 1;
    END LOOP;
    UPDATE public.fundos_turma SET status = 'cancelado', encerrado_em = now() WHERE id = p_fundo_id;
  END IF;

  PERFORM public.economia_auditar(
    CASE WHEN p_entregue THEN 'fundo_entregar' ELSE 'fundo_cancelar' END,
    'fundos_turma', p_fundo_id::text, v_fundo.classe_id, NULL,
    jsonb_build_object('status', v_fundo.status, 'arrecadado', v_fundo.arrecadado),
    jsonb_build_object('devolvidas', v_devolvidas)
  );
  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN p_entregue THEN 'entregue' ELSE 'cancelado' END,
                            'devolvidas', v_devolvidas);
END;
$fn$;

REVOKE ALL ON FUNCTION public.fundo_turma_criar(bigint, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fundo_turma_contribuir(bigint, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fundo_turma_encerrar(bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fundo_turma_criar(bigint, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fundo_turma_contribuir(bigint, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fundo_turma_encerrar(bigint, boolean) TO authenticated;
"""


def upgrade() -> None:
    op.execute(TABELAS)
    op.execute(RETENCAO)
    op.execute(RLS)
    op.execute(FUNCOES)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.fundo_turma_encerrar(bigint, boolean)")
    op.execute("DROP FUNCTION IF EXISTS public.fundo_turma_contribuir(bigint, integer, text)")
    op.execute("DROP FUNCTION IF EXISTS public.fundo_turma_criar(bigint, text, text, integer)")
    op.execute("DELETE FROM public.retencao_politica WHERE tabela IN ('fundos_turma', 'fundos_turma_contribuicao')")
    op.execute("DROP TABLE IF EXISTS public.fundos_turma_contribuicao")
    op.execute("DROP TABLE IF EXISTS public.fundos_turma")
    op.execute("NOTIFY pgrst, 'reload schema'")
