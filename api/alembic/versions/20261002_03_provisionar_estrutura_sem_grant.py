"""provisionar_estrutura_aluno_classe deixa de ser chamavel por aluno

`provisionar_estrutura_aluno_classe(p_aluno_id, p_classe_id)` e' SECURITY
DEFINER, cria `topico_aluno` e demais estruturas de progresso para o aluno e a
classe que receber por parametro, e nao checa NADA -- nem `auth.uid()`, nem os
helpers de posse. `authenticated` tem EXECUTE.

Efeito: qualquer aluno logado cria estrutura de progresso para QUALQUER aluno em
QUALQUER classe. E' poluicao de dado e de metrica, nao vazamento -- a RLS de
`topico_aluno` continua governando a leitura. Ver issue #317.

POR QUE NAO DA' PARA SO' REVOGAR. A funcao e' chamada por
`trg_classe_aluno_after_insert`, que NAO era SECURITY DEFINER: gatilho sem isso
roda com o privilegio de quem disparou o INSERT, entao revogar quebraria a
matricula do aluno.

Por isso sao DOIS passos, nesta ordem:

1. o gatilho vira SECURITY DEFINER -- ele e' minimo (so' repassa
   `NEW.aluno_id`/`NEW.classe_id` e devolve NEW), entao nada mais dependia do
   privilegio do chamador;
2. so' entao o EXECUTE sai de `authenticated`.

O QUE ISTO FECHA, exatamente. Pelo gatilho, a policy de INSERT de `classe_aluno`
(`aluno_id = auth.uid() OR classe_id IN app_classes_do_professor()`) ja' limita
o aluno a provisionar PARA SI. Pela RPC direta, ele provisiona para qualquer um.
Esta migracao tira a RPC; o que sobra e' o que a RLS ja' governa.

(Observacao separada, fora do escopo: aquela policy permite o aluno se matricular
sozinho em QUALQUER classe, bastando `aluno_id = auth.uid()`. E' decisao de
desenho existente, nao regressao, e merece discussao propria.)

Revision ID: 20261002_03
Revises: 20261002_02
Create Date: 2026-10-02
"""

from alembic import op

revision = "20261002_03"
down_revision = "20261002_02"
branch_labels = None
depends_on = None

_FUNCAO = "public.provisionar_estrutura_aluno_classe(uuid, bigint)"


def upgrade() -> None:
    # Passo 1: o gatilho passa a rodar como dono. `CREATE OR REPLACE` preserva
    # o vinculo com o trigger existente -- nao e' preciso recriar o trigger.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.trg_classe_aluno_after_insert()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path TO 'public', 'pg_temp'
        AS $function$
        BEGIN
          PERFORM public.provisionar_estrutura_aluno_classe(
            NEW.aluno_id,
            NEW.classe_id
          );
          RETURN NEW;
        END;
        $function$
        """
    )

    # Passo 2: agora da' para revogar sem quebrar a matricula.
    op.execute(
        f"""
        DO $$
        BEGIN
          EXECUTE 'REVOKE EXECUTE ON FUNCTION {_FUNCAO} FROM PUBLIC, anon, authenticated';
        EXCEPTION WHEN undefined_function THEN
          RAISE NOTICE 'funcao ausente, nada a revogar: {_FUNCAO}';
        END $$
        """
    )


def downgrade() -> None:
    raise RuntimeError(
        "downgrade reabriria o provisionamento de estrutura para qualquer aluno "
        "(issue #317); reverta a mao se for mesmo necessario"
    )
