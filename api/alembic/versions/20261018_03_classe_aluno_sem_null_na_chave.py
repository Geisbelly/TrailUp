"""Matricula sem turma desliga a guarda da loja: classe_aluno.classe_id vira NOT NULL

O aluno consegue desligar, para si mesmo e com um unico INSERT que a RLS
autoriza, a checagem de matricula do `loja_comprar`.

## O mecanismo

`loja_comprar` barra compra em turma alheia assim:

    IF p_classe_id NOT IN (SELECT public.app_classes_do_aluno()) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'fora_da_turma');
    END IF;

`app_classes_do_aluno()` e `SELECT ca.classe_id FROM classe_aluno ca WHERE
ca.aluno_id = auth.uid()`. Se a subconsulta devolver UMA linha NULL,
`x NOT IN (lista com NULL)` deixa de ser TRUE e vira NULL -- e `IF NULL THEN`
nao dispara. A guarda some.

E o aluno consegue plantar essa linha. A policy de INSERT e:

    WITH CHECK ((aluno_id = auth.uid()) OR (classe_id IN (SELECT app_classes_do_professor())))

O primeiro ramo basta: `aluno_id = auth.uid()` autoriza a linha, e nada exigia
`classe_id`. A coluna era nullable, nenhum trigger barrava.

Reproduzido ponta a ponta, como o proprio aluno, em transacao revertida:

    A. aluno esta na turma alheia?                       nao
    B. guarda ANTES  (NOT IN)                            true   -> barra
    C. aluno insere classe_aluno(aluno_id=self, NULL)    ACEITO
    D. app_classes_do_aluno() devolve NULL?              1 linha
    E. guarda DEPOIS (NOT IN)                            NULL   -> NAO BARRA

## Por que a correcao e a coluna, e nao o `NOT IN`

Trocar por `NOT EXISTS` no `loja_comprar` tambem resolve -- conferido: com a
linha venenosa plantada, `NOT EXISTS` devolve true (barra) onde `NOT IN`
devolve NULL, e nos casos limpos os dois concordam.

Mas `loja_comprar` tem ~100 linhas e vive em `20260912_05`. Copiar o corpo
inteiro para uma migracao nova, para proteger contra um NULL que a constraint
torna impossivel, acrescenta risco de transcricao maior do que o risco que
remove. Com `classe_id NOT NULL`, `app_classes_do_aluno()` nao tem como
devolver NULL e o `NOT IN` passa a ser seguro por construcao.

Fica registrado, porem, que a seguranca do `loja_comprar` depende DESTA
constraint: ao tocar naquela funcao, troque o `NOT IN` por `NOT EXISTS`, que e
a forma que o repo ja prefere (ver o comentario em `duplicar_topico`,
`20261011_03`: "NOT EXISTS (e nao NOT IN) pelo NULL").

## Por que isso nao quebra ninguem

Todos os gravadores ja fornecem as duas colunas:

  - `inscrever_aluno_em_classe`: INSERT ... (classe_id, aluno_id, ...)
  - console: `.insert({ classe_id: classId, aluno_id: alunoId })`

E nenhuma linha viola hoje: `SELECT count(*) FROM classe_aluno WHERE
aluno_id IS NULL OR classe_id IS NULL` = 0.

`aluno_id` entra junto pelo mesmo motivo: matricula sem aluno e tao sem
sentido quanto matricula sem turma, e todo gravador ja o preenche.

Verificado em transacao revertida: com as duas constraints, o INSERT venenoso
volta 23502.

Revision ID: 20261018_03
Revises: 20261018_02
Create Date: 2026-10-18
"""

from alembic import op

revision = "20261018_03"
down_revision = "20261018_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Guarda explicita: se alguma base ja tiver a linha sem sentido, o
    # ALTER falharia com uma mensagem que nao diz o que fazer. Melhor
    # apontar a linha.
    op.execute(
        """
        DO $$
        DECLARE v_orfas bigint;
        BEGIN
          SELECT count(*) INTO v_orfas FROM public.classe_aluno
           WHERE aluno_id IS NULL OR classe_id IS NULL;
          IF v_orfas > 0 THEN
            RAISE EXCEPTION
              'classe_aluno tem % linha(s) com aluno_id ou classe_id nulo. '
              'Sao matriculas sem sentido e desligam a guarda de loja_comprar: '
              'apague-as antes de aplicar esta migracao.', v_orfas;
          END IF;
        END $$;
        """
    )
    op.execute("ALTER TABLE public.classe_aluno ALTER COLUMN classe_id SET NOT NULL")
    op.execute("ALTER TABLE public.classe_aluno ALTER COLUMN aluno_id  SET NOT NULL")


def downgrade() -> None:
    # Reverter devolve o bypass. E a unica forma honesta de desfazer.
    op.execute("ALTER TABLE public.classe_aluno ALTER COLUMN aluno_id  DROP NOT NULL")
    op.execute("ALTER TABLE public.classe_aluno ALTER COLUMN classe_id DROP NOT NULL")
