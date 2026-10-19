"""professor_aluno: o professor não concede acesso a si mesmo a aluno que não ensina

Escalada de privilégio, reproduzida em produção com simulação de papel (tudo desfeito).

As policies de `professor_aluno` exigiam **só** `professor_id = auth.uid()`:

    professor_aluno_posse_upd  USING (professor_id = auth.uid())
                               WITH CHECK (professor_id = auth.uid())
    professor_aluno_posse_ins  WITH CHECK (professor_id = auth.uid())

Nada restringia `has_acesso` nem `aluno_id`. E `trg_professor_after_insert` /
`trg_alunos_after_insert` já pré-criam o produto cartesiano professor × aluno (com
`has_acesso = false`, o que por si só está certo). Juntando as duas coisas, um professor
executava **um** UPDATE sem precisar adivinhar id nenhum:

    UPDATE professor_aluno SET has_acesso = true WHERE professor_id = auth.uid();

`app_alunos_do_professor()` filtra `AND pa.has_acesso`, então a partir daí ele é "professor
de" todo aluno da plataforma. Medido ao vivo com um professor de **zero** turmas e zero
alunos: 2 alunos visíveis antes, 4 de 4 depois, mais `telemetria_lotes` e `aluno_perfil`
legíveis. **22 policies** dependem de `app_alunos_do_professor()`, então a brecha não era só
a tabela `alunos`.

Estado em produção quando isto foi escrito: uma conta com 7 de 7 linhas em `has_acesso`,
0 turmas criadas e 0 alunos ensinados.

A correção mantém `professor_aluno` como o mecanismo que é — o professor continua podendo
**revogar** livremente e continua dono das suas linhas — mas só pode LIGAR o acesso para
aluno que ele de fato ensina, via `app_classes_do_professor()`. Isso é exatamente o que o
CLAUDE.md já declara como a regra: o professor "lê o dado e a telemetria dos alunos dessas
classes" (as que ele criou).

Dois detalhes de três-valores, que esta base já pagou caro para aprender:

- `has_acesso IS NOT TRUE`, **não** `NOT has_acesso`. A coluna é nullable; com NULL,
  `NOT has_acesso` é NULL, o AND inteiro vira NULL, o WITH CHECK reprova e o professor
  perderia a capacidade de gravar linha neutra. `IS NOT TRUE` cobre false e NULL.
- `EXISTS` sobre `app_classes_do_professor()`, não `IN`/`NOT IN` — a casa toda usa EXISTS
  com os helpers `SECURITY DEFINER` justamente para não depender de como o NULL se propaga
  numa lista.

Não mexe nos triggers: o produto cartesiano com `has_acesso = false` é inerte e é o que
permite ao professor habilitar um aluno sem INSERT. O que estava errado era quem podia
virar o flag.

Revision ID: 20261019_01
Revises: 20261018_05
Create Date: 2026-10-18
"""

from alembic import op

revision = "20261019_01"
down_revision = "20261018_05"
branch_labels = None
depends_on = None


# Só pode LIGAR has_acesso para aluno de uma turma do próprio professor.
# Revogar (false) e deixar neutro (NULL) seguem livres: `IS NOT TRUE` cobre os dois.
PREDICADO_ALVO = """
    professor_id = auth.uid()
    AND (
      has_acesso IS NOT TRUE
      OR EXISTS (
        SELECT 1
          FROM public.classe_aluno ca
          JOIN public.app_classes_do_professor() AS minha(id) ON minha.id = ca.classe_id
         WHERE ca.aluno_id = professor_aluno.aluno_id
      )
    )
"""

SQL = f"""
DROP POLICY IF EXISTS professor_aluno_posse_upd ON public.professor_aluno;
CREATE POLICY professor_aluno_posse_upd ON public.professor_aluno
  FOR UPDATE TO authenticated
  USING (professor_id = auth.uid())
  WITH CHECK ({PREDICADO_ALVO});

DROP POLICY IF EXISTS professor_aluno_posse_ins ON public.professor_aluno;
CREATE POLICY professor_aluno_posse_ins ON public.professor_aluno
  FOR INSERT TO authenticated
  WITH CHECK ({PREDICADO_ALVO});

NOTIFY pgrst, 'reload schema';
"""

ANTERIOR_SQL = """
DROP POLICY IF EXISTS professor_aluno_posse_upd ON public.professor_aluno;
CREATE POLICY professor_aluno_posse_upd ON public.professor_aluno
  FOR UPDATE TO authenticated
  USING (professor_id = auth.uid())
  WITH CHECK (professor_id = auth.uid());

DROP POLICY IF EXISTS professor_aluno_posse_ins ON public.professor_aluno;
CREATE POLICY professor_aluno_posse_ins ON public.professor_aluno
  FOR INSERT TO authenticated
  WITH CHECK (professor_id = auth.uid());

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(ANTERIOR_SQL)
