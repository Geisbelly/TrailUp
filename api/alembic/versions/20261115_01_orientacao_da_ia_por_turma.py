"""Orientação do professor para a IA, por turma

## O que é

Pedido da Geisbelly (15/11): o professor indica à IA o que **pedir** e o que **evitar**. A
orientação é da turma: vale em qualquer computador e em toda geração daquela turma — a "Gerar
trilha com IA" (esqueleto e cada tópico), o "Gerar o que falta", o "Pedir ajuste" de um tópico, a
descrição do tópico e o "Sugerir cards e atividades" de cada conteúdo.

Uma linha por turma, com dois textos livres de até 1.500 caracteres. Linha que não existe e texto
vazio querem dizer a mesma coisa: sem orientação.

## Quem lê e quem escreve

Só o professor dono da turma, direto pelo Supabase (`app_classes_do_professor()`), nos quatro
verbos: o console lê, grava com upsert e pode apagar. O aluno não lê, porque a orientação é
instrução de trabalho para a IA, não conteúdo da turma. `anon` não tem nada.

A edge function `generate-content-ai` **não lê** esta tabela: o console manda a orientação no corpo
do pedido. É o mesmo caminho do resto do contexto da turma (nome, matéria, guia de tema), e não
pede `service_role` na função.

## Sem coluna de autor

Não há `atualizado_por`: só o dono da turma escreve, então o autor é sempre o professor da turma.
Sem coluna de pessoa, a tabela também não entra em `retencao_politica`. Ela sai com a turma, pela
FK `ON DELETE CASCADE`.

## Fora daqui

`duplicar_classe` não copia a orientação. A turma duplicada nasce sem ela, e o professor a escreve
de novo se quiser.

Revision ID: 20261115_01
Revises: 20261111_05
Create Date: 2026-11-15
"""

from alembic import op

revision = "20261115_01"
down_revision = "20261111_05"
branch_labels = None
depends_on = None

LIMITE = 1500

TABELA = f"""
CREATE TABLE IF NOT EXISTS public.classe_orientacao_ia (
  classe_id     bigint      PRIMARY KEY REFERENCES public.classe(id) ON DELETE CASCADE,
  pedir         text        NOT NULL DEFAULT '' CHECK (char_length(pedir) <= {LIMITE}),
  evitar        text        NOT NULL DEFAULT '' CHECK (char_length(evitar) <= {LIMITE}),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.classe_orientacao_ia IS
  'Orientacao do professor para a IA da turma: o que pedir e o que evitar ao gerar a trilha, os textos, os cards e as questoes. Le e escreve so o dono da turma.';
"""

TOCAR = r"""
CREATE OR REPLACE FUNCTION public.fn_classe_orientacao_ia_tocar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_classe_orientacao_ia_tocar ON public.classe_orientacao_ia;
CREATE TRIGGER trg_classe_orientacao_ia_tocar
  BEFORE UPDATE ON public.classe_orientacao_ia
  FOR EACH ROW EXECUTE FUNCTION public.fn_classe_orientacao_ia_tocar();
"""

RLS = r"""
ALTER TABLE public.classe_orientacao_ia ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.classe_orientacao_ia FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classe_orientacao_ia TO authenticated;

DROP POLICY IF EXISTS classe_orientacao_ia_professor_sel ON public.classe_orientacao_ia;
CREATE POLICY classe_orientacao_ia_professor_sel ON public.classe_orientacao_ia
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()));

DROP POLICY IF EXISTS classe_orientacao_ia_professor_ins ON public.classe_orientacao_ia;
CREATE POLICY classe_orientacao_ia_professor_ins ON public.classe_orientacao_ia
  FOR INSERT TO authenticated
  WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()));

DROP POLICY IF EXISTS classe_orientacao_ia_professor_upd ON public.classe_orientacao_ia;
CREATE POLICY classe_orientacao_ia_professor_upd ON public.classe_orientacao_ia
  FOR UPDATE TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()))
  WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()));

DROP POLICY IF EXISTS classe_orientacao_ia_professor_del ON public.classe_orientacao_ia;
CREATE POLICY classe_orientacao_ia_professor_del ON public.classe_orientacao_ia
  FOR DELETE TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()));
"""

DOWN = r"""
DROP TABLE IF EXISTS public.classe_orientacao_ia;
DROP FUNCTION IF EXISTS public.fn_classe_orientacao_ia_tocar();
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(TOCAR)
    op.execute(RLS)


def downgrade() -> None:
    op.execute(DOWN)
