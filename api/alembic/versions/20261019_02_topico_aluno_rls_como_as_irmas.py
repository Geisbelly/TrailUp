"""topico_aluno: INSERT deixa de ser `true` e o professor volta a ler o progresso da turma

`topico_aluno` tinha três policies, e duas estavam erradas. As tabelas irmãs
`conteudo_aluno` e `atividade_aluno` provam qual era a intenção — as três guardam a mesma
coisa (o progresso do aluno num item da trilha) e só esta divergia.

    conteudo_aluno / atividade_aluno        topico_aluno (antes)
    ins  WITH CHECK (aluno_id = auth.uid()) ins  WITH CHECK (true)
    sel  USING (proprio OR aluno do prof.)  sel  USING (aluno_id = auth.uid())
    upd  USING + WITH CHECK (proprio)       upd  USING (proprio), sem WITH CHECK

**1. INSERT com `WITH CHECK (true)`.** Qualquer sessão autenticada gravava linha de
progresso para qualquer aluno. Reproduzido em produção com simulação de papel (desfeito):
um aluno inseriu `topico_aluno` de OUTRO aluno, 1 linha gravada. Ele não consegue ler a
linha de volta (a policy de SELECT é correta nesse ponto), mas grava.

**2. Faltava a policy de SELECT do professor.** Medido ao vivo, professor com 1 aluno:

    topico_aluno      0 de 2   <- painel vazio, sem erro nenhum
    conteudo_aluno    2 de 2
    atividade_aluno   1 de 1

É o modo de falha que o CLAUDE.md descreve: RLS sem a policy certa "fecha em silêncio", o
`supabase-js` devolve lista vazia em vez de exceção, e o console desenha o estado padrão.
`DashboardSection.tsx` lê `topico_aluno` para o painel do professor.

O predicado é **copiado** das irmãs, não reescrito, para as três ficarem idênticas:
`aluno_id = auth.uid() OR aluno_id IN (SELECT app_alunos_do_professor())`.

> Por isso esta migration vem **depois** de `20261019_01`. Aquela conserta
> `app_alunos_do_professor()` — hoje o professor concede a si mesmo acesso a aluno que não
> ensina. Adicionar esta leitura antes dela daria ao professor o progresso de toda a
> plataforma em vez do da turma dele.

O `WITH CHECK` explícito no UPDATE não muda comportamento (sem ele o Postgres usa a
expressão do `USING` para checar a linha nova), mas deixa as três tabelas iguais em vez de
depender de quem lê saber dessa regra.

**O que esta migration NÃO faz:** impedir o cliente de gravar `percentual_concluido` e
`status`. O CLAUDE.md diz que nenhum cliente escreve essas colunas, e o cliente de fato não
escreve (conferido: os quatro `upsert` do mobile as omitem de propósito, com comentário).
Mas a RLS ainda permite, e medido ao vivo um aluno gravou `percentual_concluido = 100` para
si. Fechar isso de verdade é congelar a coluna no estilo de
`trg_eventos_aluno_valor_do_banco` — e quem legitimamente a escreve é o trigger
`trailup_recalcular_topico_aluno`, então o congelamento precisa de um sinal de sessão para
não bloquear o próprio recálculo. Mexer nessa função é mexer exatamente onde "a conta certa
nunca sobrevivia" (`20260826_18`); fica para uma mudança própria, com revisão própria, em
vez de embutida aqui.

Revision ID: 20261019_02
Revises: 20261019_01
Create Date: 2026-10-18
"""

from alembic import op

revision = "20261019_02"
down_revision = "20261019_01"
branch_labels = None
depends_on = None


SQL = """
-- O nome antigo vem do painel do Supabase, não de uma migration.
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.topico_aluno;
DROP POLICY IF EXISTS topico_aluno_posse_ins ON public.topico_aluno;
CREATE POLICY topico_aluno_posse_ins ON public.topico_aluno
  FOR INSERT TO authenticated
  WITH CHECK (aluno_id = auth.uid());

DROP POLICY IF EXISTS "Aluno vê só seus progressos" ON public.topico_aluno;
DROP POLICY IF EXISTS topico_aluno_posse_sel ON public.topico_aluno;
CREATE POLICY topico_aluno_posse_sel ON public.topico_aluno
  FOR SELECT TO authenticated
  USING (
    aluno_id = auth.uid()
    OR aluno_id IN (SELECT public.app_alunos_do_professor())
  );

DROP POLICY IF EXISTS "Aluno atualiza só seus progressos" ON public.topico_aluno;
DROP POLICY IF EXISTS topico_aluno_posse_upd ON public.topico_aluno;
CREATE POLICY topico_aluno_posse_upd ON public.topico_aluno
  FOR UPDATE TO authenticated
  USING (aluno_id = auth.uid())
  WITH CHECK (aluno_id = auth.uid());

NOTIFY pgrst, 'reload schema';
"""

ANTERIOR_SQL = """
DROP POLICY IF EXISTS topico_aluno_posse_ins ON public.topico_aluno;
CREATE POLICY "Enable insert for authenticated users only" ON public.topico_aluno
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS topico_aluno_posse_sel ON public.topico_aluno;
CREATE POLICY "Aluno vê só seus progressos" ON public.topico_aluno
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid());

DROP POLICY IF EXISTS topico_aluno_posse_upd ON public.topico_aluno;
CREATE POLICY "Aluno atualiza só seus progressos" ON public.topico_aluno
  FOR UPDATE TO authenticated
  USING (aluno_id = auth.uid());

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(ANTERIOR_SQL)
