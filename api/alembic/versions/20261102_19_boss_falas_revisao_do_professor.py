"""Falas do boss: o professor vê o que a IA escreveu e pode tirar do ar

## O problema

`boss_falas` (`20261101_09`) guarda o nome e as falas que a IA gera por conteúdo × perfil, e o app as
mostra ao aluno **direto**, sem ninguém ter lido antes. O público inclui menores. O prompt proíbe
ofensa, violência e link, e a validação descarta o que sai do limite, mas nenhum filtro é perfeito, e
o professor, que responde pela turma, nem tinha onde ler o que o aluno ouve: a tabela só tem policy de
SELECT por `app_minhas_classes()` e o console não a lê.

## O que muda

- `ativa boolean NOT NULL DEFAULT true` e `desativada_em`: o professor desliga uma fala (nome + falas de
  um conteúdo × perfil) e o aluno volta a ouvir as falas fixas do app, que já são o comportamento
  quando não há linha gerada.
- **Quem obedece é o banco, não o app.** A policy de SELECT do aluno passa a exigir `ativa`; o professor
  da turma continua vendo todas, inclusive as desligadas (ele precisa ver para religar). Com isso um
  build antigo do app, que não filtra nada, também deixa de receber a fala desligada.
- UPDATE só do professor da turma e só da coluna `ativa` (GRANT por coluna, o mesmo desenho de
  `intervencoes`). `desativada_em` é preenchida por gatilho: o cliente não a escolhe.
- A API, ao reescrever a linha (`_gravar`), **religa**: texto novo é texto que ninguém leu. Enquanto o
  hash do conteúdo não muda o modelo nem é chamado, então a decisão do professor vale até lá.

## O que não muda

Nada de escrita do professor em `nome` ou `falas`. Editar texto é outra decisão (e precisaria validar
de novo os limites e a lista de proibições que a API aplica); aqui o professor só liga ou desliga.
"""

from __future__ import annotations

from alembic import op

revision = "20261102_19"
down_revision = "20261102_18"
branch_labels = None
depends_on = None


COLUNAS = """
ALTER TABLE public.boss_falas ADD COLUMN IF NOT EXISTS ativa boolean NOT NULL DEFAULT true;
ALTER TABLE public.boss_falas ADD COLUMN IF NOT EXISTS desativada_em timestamptz;
"""


POLICIES = """
-- Aluno: só o que está ligado. Professor da turma: tudo, para poder religar.
DROP POLICY IF EXISTS boss_falas_minhas_classes_sel ON public.boss_falas;
CREATE POLICY boss_falas_minhas_classes_sel ON public.boss_falas
  FOR SELECT TO authenticated
  USING (
    classe_id IN (SELECT public.app_classes_do_professor())
    OR (ativa AND classe_id IN (SELECT public.app_classes_do_aluno()))
  );

DROP POLICY IF EXISTS boss_falas_professor_upd ON public.boss_falas;
CREATE POLICY boss_falas_professor_upd ON public.boss_falas
  FOR UPDATE TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()))
  WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()));

-- A policy decide QUAIS linhas; o GRANT por coluna decide QUAIS campos.
REVOKE UPDATE ON public.boss_falas FROM PUBLIC, anon, authenticated;
GRANT UPDATE (ativa) ON public.boss_falas TO authenticated;
"""


GATILHO = """
CREATE OR REPLACE FUNCTION public.fn_boss_falas_desativada_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.ativa IS DISTINCT FROM OLD.ativa THEN
    NEW.desativada_em := CASE WHEN NEW.ativa THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_boss_falas_desativada_em ON public.boss_falas;
CREATE TRIGGER trg_boss_falas_desativada_em
  BEFORE UPDATE OF ativa ON public.boss_falas
  FOR EACH ROW EXECUTE FUNCTION public.fn_boss_falas_desativada_em();
"""


def upgrade() -> None:
    op.execute(COLUNAS)
    op.execute(POLICIES)
    op.execute(GATILHO)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_boss_falas_desativada_em ON public.boss_falas")
    op.execute("DROP FUNCTION IF EXISTS public.fn_boss_falas_desativada_em()")
    op.execute("DROP POLICY IF EXISTS boss_falas_professor_upd ON public.boss_falas")
    op.execute("REVOKE UPDATE (ativa) ON public.boss_falas FROM authenticated")
    op.execute("DROP POLICY IF EXISTS boss_falas_minhas_classes_sel ON public.boss_falas")
    op.execute(
        """
        CREATE POLICY boss_falas_minhas_classes_sel ON public.boss_falas
          FOR SELECT TO authenticated
          USING (classe_id IN (SELECT public.app_minhas_classes()))
        """
    )
    op.execute("ALTER TABLE public.boss_falas DROP COLUMN IF EXISTS desativada_em")
    op.execute("ALTER TABLE public.boss_falas DROP COLUMN IF EXISTS ativa")
