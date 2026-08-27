"""resolve conteudo_id/atividade_id da telemetria a partir do item_key

Fecha a issue #44.

76% das linhas de escopo `content` estavam sem `conteudo_id`, e toda consulta
que juntasse por essa chave perdia tres quartos do tempo medido.

Diagnostico corrigido: NAO e "o cliente esqueceu de mandar o id". As linhas sem
`conteudo_id` descrevem **blocos dentro do material personalizado**, que nao tem
linha propria em `conteudos` — mas o conteudo-PAI esta no `item_key`:

    content:174:personalization:3577:personalized:125:content:8
            ^^^                                  ^^^
       conteudo pai                            topico

Conferido contra o dado real: conteudo 174 pertence ao topico 125, 177 ao 128, e
as personalizacoes 3575/3577 e 3604 pertencem aos mesmos topicos. Onde o id ja
vinha preenchido, ele bate com o prefixo — ou seja, o formato e confiavel.

Por isso este caso E recuperavel retroativamente, ao contrario do que eu havia
registrado na issue: a identidade sempre esteve no dado, so nao estava na
coluna.

O preenchimento vai para um TRIGGER, e nao para o cliente, por dois motivos:
existem DOIS escritores (a API e o caminho direto do mobile, usado quando a API
esta fora), e corrigir so um deixaria metade das linhas quebradas; e a regra de
fronteira do projeto manda encanamento para o banco.

O trigger so preenche o que esta NULO e so quando a linha referenciada existe —
nunca sobrescreve o que o cliente mandou, e nunca cria referencia quebrada.

Revision ID: 20260826_17
Revises: 20260826_16
Create Date: 2026-08-27
"""

from alembic import op

revision = "20260826_17"
down_revision = "20260826_16"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Derruba antes de criar. `CREATE OR REPLACE` parece bastar, mas o pooler do
    # Supabase pode reexecutar o statement, e a segunda passada estoura
    # `duplicate key ... pg_proc_proname_args_nsp_index` — visto ao aplicar esta
    # propria migracao. Derrubar primeiro torna a aplicacao repetivel.
    op.execute(
        "DROP TRIGGER IF EXISTS trg_telemetria_resolver_entidade "
        "ON telemetria_time_metric_entries"
    )
    op.execute("DROP FUNCTION IF EXISTS public.telemetria_resolver_entidade()")
    op.execute("DROP FUNCTION IF EXISTS public.telemetria_id_do_item_key(text, text)")

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.telemetria_id_do_item_key(
          p_item_key text, p_prefixo text
        )
        RETURNS bigint LANGUAGE sql IMMUTABLE AS $fn$
          -- `item_key` segue `<prefixo>:<id>[:...]`. Fora desse formato devolve
          -- NULL, e o chamador mantem o que ja tinha.
          SELECT CASE
            WHEN p_item_key IS NULL THEN NULL
            WHEN split_part(p_item_key, ':', 1) <> p_prefixo THEN NULL
            WHEN split_part(p_item_key, ':', 2) ~ '^[0-9]+$'
              THEN split_part(p_item_key, ':', 2)::bigint
            ELSE NULL
          END
        $fn$
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.telemetria_resolver_entidade()
        RETURNS trigger LANGUAGE plpgsql AS $fn$
        DECLARE
          v_id bigint;
        BEGIN
          -- Preenche SO o que esta nulo: o que o cliente mandou tem precedencia,
          -- porque ele sabe do contexto que a chave nao carrega.
          IF NEW.conteudo_id IS NULL THEN
            v_id := public.telemetria_id_do_item_key(NEW.item_key, 'content');
            -- Confere existencia antes de atribuir: chave de material antigo
            -- pode apontar para conteudo ja removido, e gravar isso criaria
            -- referencia quebrada que so apareceria num JOIN silencioso.
            IF v_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM conteudos c WHERE c.id = v_id) THEN
              NEW.conteudo_id := v_id;
            END IF;
          END IF;

          IF NEW.atividade_id IS NULL THEN
            v_id := public.telemetria_id_do_item_key(NEW.item_key, 'activity');
            IF v_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM atividades a WHERE a.id = v_id) THEN
              NEW.atividade_id := v_id;
            END IF;
          END IF;

          IF NEW.topico_id IS NULL THEN
            v_id := public.telemetria_id_do_item_key(NEW.item_key, 'topic');
            IF v_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM topicos t WHERE t.id = v_id) THEN
              NEW.topico_id := v_id;
            END IF;
          END IF;

          RETURN NEW;
        END;
        $fn$
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_telemetria_resolver_entidade
          BEFORE INSERT OR UPDATE ON telemetria_time_metric_entries
          FOR EACH ROW EXECUTE FUNCTION public.telemetria_resolver_entidade()
        """
    )

    # ------------------------------------------------------------------
    # Backfill do historico
    # ------------------------------------------------------------------
    op.execute(
        """
        UPDATE telemetria_time_metric_entries e
           SET conteudo_id = public.telemetria_id_do_item_key(e.item_key, 'content')
         WHERE e.conteudo_id IS NULL
           AND public.telemetria_id_do_item_key(e.item_key, 'content') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM conteudos c
              WHERE c.id = public.telemetria_id_do_item_key(e.item_key, 'content')
           )
        """
    )
    op.execute(
        """
        UPDATE telemetria_time_metric_entries e
           SET atividade_id = public.telemetria_id_do_item_key(e.item_key, 'activity')
         WHERE e.atividade_id IS NULL
           AND public.telemetria_id_do_item_key(e.item_key, 'activity') IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM atividades a
              WHERE a.id = public.telemetria_id_do_item_key(e.item_key, 'activity')
           )
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_telemetria_resolver_entidade "
        "ON telemetria_time_metric_entries"
    )
    op.execute("DROP FUNCTION IF EXISTS public.telemetria_resolver_entidade()")
    op.execute("DROP FUNCTION IF EXISTS public.telemetria_id_do_item_key(text, text)")
    # O backfill NAO e desfeito: os ids gravados sao corretos e conferidos
    # contra as tabelas de destino. Apaga-los devolveria o dado incompleto.
