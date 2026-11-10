"""Rascunho da trilha gerada pela IA, salvo sozinho a cada etapa

## Por quê

Gerar a trilha com IA leva minutos: o esqueleto e, depois, um pedido por tópico. A proposta
só existia no estado do diálogo do console até o professor aplicar. Um erro no meio (cota
do Gemini, 504, aba recarregada, diálogo fechado sem querer, falha ao aplicar) jogava fora
tudo o que já tinha sido gerado, e o professor tinha de pedir a trilha inteira de novo,
gastando a cota de novo.

## O que entra

`trilha_rascunho`: **uma linha por turma** (`classe_id` é a chave), com o pedido feito à IA
(`pedido`: descrição, quantidade de tópicos, fontes em texto) e a proposta como está
(`topicos`: o mesmo JSON que o console mostra). O console grava a linha logo que o esqueleto
chega e a cada tópico, ajuste ou remoção. Ao abrir o diálogo, oferece retomar; ao aplicar a
trilha, apaga a linha. Gerar de novo substitui o rascunho da turma.

Gravar é banco, não API: não há modelo de linguagem no meio (regra de fronteira). O console
escreve direto, como já faz com `topicos` e `conteudos`.

- **RLS e policy no mesmo commit.** O professor dono lê e escreve a linha da própria turma
  (`app_classes_do_professor()`). O aluno não lê: é trabalho do professor, ainda não
  publicado. Anônimo não tem GRANT. Não há leitura pela API.
- **Formato mínimo no banco:** `pedido` é objeto e `topicos` é lista (`jsonb_typeof`). O
  resto do formato é do console, que é quem escreve e quem lê.
- **Teto de tamanho** (`octet_length` do texto do `topicos`): uma trilha de 20 tópicos com
  material fica em centenas de KB; o teto barra lixo sem barrar trilha de verdade.
- `updated_at` e `atualizado_por` saem do gatilho, não do cliente, e a turma da linha não muda.

## Downgrade

Derruba o gatilho, a função e a tabela (os rascunhos se perdem; a trilha aplicada não).

Revision ID: 20261110_08
Revises: 20261110_07
Create Date: 2026-11-10
"""

from alembic import op

revision = "20261110_08"
down_revision = "20261110_07"
branch_labels = None
depends_on = None

# Bytes do texto de `topicos`. Uma trilha de 20 tópicos com material completo fica bem abaixo.
TOPICOS_BYTES_MAXIMO = 4_000_000
# Bytes do texto de `pedido` (fontes em texto entram aqui, até ~15 mil caracteres por arquivo).
PEDIDO_BYTES_MAXIMO = 1_000_000

TABELA = f"""
CREATE TABLE IF NOT EXISTS public.trilha_rascunho (
  classe_id bigint NOT NULL,
  pedido jsonb NOT NULL DEFAULT '{{}}'::jsonb,
  topicos jsonb NOT NULL DEFAULT '[]'::jsonb,
  atualizado_por uuid NULL DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT trilha_rascunho_pkey PRIMARY KEY (classe_id),
  CONSTRAINT trilha_rascunho_classe_id_fkey
    FOREIGN KEY (classe_id) REFERENCES public.classe(id) ON DELETE CASCADE,
  CONSTRAINT trilha_rascunho_pedido_chk
    CHECK (jsonb_typeof(pedido) = 'object' AND octet_length(pedido::text) <= {PEDIDO_BYTES_MAXIMO}),
  CONSTRAINT trilha_rascunho_topicos_chk
    CHECK (jsonb_typeof(topicos) = 'array' AND octet_length(topicos::text) <= {TOPICOS_BYTES_MAXIMO})
);
"""

RLS = """
ALTER TABLE public.trilha_rascunho ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trilha_rascunho FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trilha_rascunho TO authenticated;
GRANT ALL ON public.trilha_rascunho TO service_role;
DROP POLICY IF EXISTS trilha_rascunho_professor_all ON public.trilha_rascunho;
CREATE POLICY trilha_rascunho_professor_all ON public.trilha_rascunho
  FOR ALL TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()))
  WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()));
"""

CARIMBO = """
CREATE OR REPLACE FUNCTION public.fn_trilha_rascunho_carimbo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  NEW.updated_at := now();
  NEW.atualizado_por := auth.uid();
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  ELSE
    NEW.created_at := OLD.created_at;
    NEW.classe_id := OLD.classe_id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_trilha_rascunho_carimbo ON public.trilha_rascunho;
CREATE TRIGGER trg_trilha_rascunho_carimbo
  BEFORE INSERT OR UPDATE ON public.trilha_rascunho
  FOR EACH ROW EXECUTE FUNCTION public.fn_trilha_rascunho_carimbo();
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(RLS)
    op.execute(CARIMBO)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_trilha_rascunho_carimbo ON public.trilha_rascunho")
    op.execute("DROP FUNCTION IF EXISTS public.fn_trilha_rascunho_carimbo()")
    op.execute("DROP TABLE IF EXISTS public.trilha_rascunho")
