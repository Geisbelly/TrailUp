"""fixa o search_path das duas funcoes de telemetria que ainda nao o tinham

Revision ID: 20260920_02
Revises: 20260920_01
Create Date: 2026-09-20

`telemetria_id_do_item_key` e `telemetria_resolver_entidade` eram as **unicas
duas** funcoes do banco sem `search_path` fixo -- o linter aponta exatamente
duas em `function_search_path_mutable`, e sao elas. Todo o resto do projeto usa
`SET search_path TO 'public', 'pg_temp'`; elas nasceram na `20260826_17` sem a
clausula e atravessaram a `20260830_01` e a `20260920_01` assim, porque
`CREATE OR REPLACE` mantem o que nao foi redeclarado -- e a clausula tem de ser
redeclarada a cada replace.

O risco e menor que o de uma `SECURITY DEFINER` exposta: sao trigger functions,
`INVOKER`, e nao ha como chama-las por RPC. Mas o `search_path` de quem dispara
o gatilho e que valia, e no Supabase ele inclui `extensions`.

## Por que e seguro, e nao so' provavel

`telemetria_resolver_entidade` chama `gen_random_uuid()`, que existe nos DOIS
lugares nesta base:

    pg_catalog    (nucleo, desde o PG13)
    extensions    (pgcrypto)

Fixar o caminho em `public, pg_temp` tira `extensions` da busca. A resolucao
continua funcionando porque `pg_catalog` e pesquisado implicitamente ANTES de
tudo, a menos que apareca explicito no `search_path` -- entao a versao do
nucleo e que ja respondia, e continua respondendo. Conferido executando o ramo
que usa a funcao, com o caminho fixo, antes de aplicar.

O resto do corpo ja estava qualificado ou e de `public`:
`public.telemetria_id_do_item_key` (explicita), e as tabelas `questoes`,
`atividades`, `conteudos` e `topicos`.

`telemetria_id_do_item_key` e `LANGUAGE sql IMMUTABLE` e so usa `split_part`, o
operador `~` e um cast -- tudo de `pg_catalog`.

Efeito colateral aceito: funcao com clausula `SET` **nao e mais inlined** pelo
planner. Ela e chamada por linha no gatilho e nos `UPDATE` de backfill da
`20260826_17`, sobre uma tabela de centenas de linhas. Nao paga a pena manter o
inline ao custo do caminho mutavel.
"""

from alembic import op

revision = "20260920_02"
down_revision = "20260920_01"
branch_labels = None
depends_on = None


_CORPO_ID_DO_ITEM_KEY = """
  -- `item_key` segue `<prefixo>:<id>[:...]`. Fora desse formato devolve
  -- NULL, e o chamador mantem o que ja tinha.
  SELECT CASE
    WHEN p_item_key IS NULL THEN NULL
    WHEN split_part(p_item_key, ':', 1) <> p_prefixo THEN NULL
    WHEN split_part(p_item_key, ':', 2) ~ '^[0-9]+$'
      THEN split_part(p_item_key, ':', 2)::bigint
    ELSE NULL
  END
"""


# O corpo e o mesmo da `20260920_01`, palavra por palavra. Repeti-lo aqui e o
# preco de `CREATE OR REPLACE` nao aceitar "so acrescente esta clausula": o que
# nao for redeclarado se perde. Antes de mexer nele, compare com o da
# `20260920_01` -- as duas tem de contar a mesma historia.
_CORPO_RESOLVER_ENTIDADE = """
DECLARE
  v_id bigint;
BEGIN
  -- A QUESTAO primeiro: ela e o unico escopo cuja ancestralidade da para
  -- descobrir no banco (a atividade da questao, o topico da atividade), e os
  -- passos de baixo dependem dela ja estar resolvida.
  IF NEW.questao_id IS NULL AND NEW.scope = 'question' THEN
    v_id := public.telemetria_id_do_item_key(NEW.item_key, 'question');
    IF v_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM questoes q WHERE q.id = v_id) THEN
      NEW.questao_id := v_id;
    END IF;
  END IF;

  IF NEW.questao_id IS NOT NULL AND NEW.atividade_id IS NULL THEN
    SELECT q.atividade_id INTO NEW.atividade_id
      FROM questoes q WHERE q.id = NEW.questao_id;
  END IF;

  IF NEW.atividade_id IS NOT NULL AND NEW.topico_id IS NULL THEN
    SELECT a.topico_id INTO NEW.topico_id
      FROM atividades a WHERE a.id = NEW.atividade_id;
  END IF;

  -- Daqui para baixo, o `item_key` so preenche o que e do escopo ou ANCESTRAL
  -- dele. A guarda de escopo e a correcao desta migracao: sem ela, a linha de
  -- `content` cujo `item_key` era `activity:1063` recebia `atividade_id =
  -- 1063`, e o escopo que agrega as atividades do conteudo passava a alegar
  -- que pertencia a uma.
  IF NEW.conteudo_id IS NULL AND NEW.scope <> 'topic' THEN
    v_id := public.telemetria_id_do_item_key(NEW.item_key, 'content');
    IF v_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM conteudos c WHERE c.id = v_id) THEN
      -- Confere existencia antes de atribuir: chave de material antigo pode
      -- apontar para conteudo ja removido, e gravar isso criaria referencia
      -- quebrada que so apareceria num JOIN silencioso.
      NEW.conteudo_id := v_id;
    END IF;
  END IF;

  IF NEW.atividade_id IS NULL
     AND NEW.scope IN ('activity', 'question', 'material') THEN
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

  -- Identidade da entrada dentro do lote. Derivada aqui, e nao no cliente,
  -- para valer tambem para os apps ja publicados, que escrevem direto no
  -- Supabase pelo fallback e nunca vao mandar esta coluna. `id` ainda nao
  -- existe num BEFORE INSERT, entao o ELSE final usa a propria chave do
  -- cliente; se nem ela houver, um valor unico por linha, que preserva em vez
  -- de fundir.
  IF NEW.entry_key IS NULL THEN
    NEW.entry_key := CASE
      WHEN NEW.scope = 'topic'    AND NEW.topico_id    IS NOT NULL
        THEN 'topic:'    || NEW.topico_id::text
      WHEN NEW.scope = 'content'  AND NEW.conteudo_id  IS NOT NULL
        THEN 'content:'  || NEW.conteudo_id::text
      WHEN NEW.scope = 'activity' AND NEW.atividade_id IS NOT NULL
        THEN 'activity:' || NEW.atividade_id::text
      WHEN NEW.scope = 'question' AND NEW.questao_id   IS NOT NULL
        THEN 'question:' || NEW.questao_id::text
      WHEN NEW.material_key IS NOT NULL THEN NEW.material_key
      WHEN NEW.item_key     IS NOT NULL THEN NEW.item_key
      ELSE 'row:' || gen_random_uuid()::text
    END;
  END IF;

  RETURN NEW;
END;
"""


def _replace(com_search_path: bool) -> None:
    clausula = "\n  SET search_path TO 'public', 'pg_temp'" if com_search_path else ""

    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION public.telemetria_id_do_item_key(
          p_item_key text, p_prefixo text
        )
        RETURNS bigint LANGUAGE sql IMMUTABLE{clausula} AS $fn$
        {_CORPO_ID_DO_ITEM_KEY}
        $fn$
        """
    )

    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION public.telemetria_resolver_entidade()
        RETURNS trigger LANGUAGE plpgsql{clausula} AS $fn$
        {_CORPO_RESOLVER_ENTIDADE}
        $fn$
        """
    )


def upgrade() -> None:
    _replace(com_search_path=True)

    # O gatilho continua apontando para a mesma funcao -- `CREATE OR REPLACE`
    # nao o derruba --, mas conferir e barato e o silencio aqui custaria toda a
    # telemetria: sem o gatilho, `entry_key` fica NULO e a chave unica
    # `(lote_id, scope, entry_key)` deixa de deduplicar.
    op.execute(
        """
        DO $guarda$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger t
              JOIN pg_proc p ON p.oid = t.tgfoid
             WHERE t.tgrelid = 'public.telemetria_time_metric_entries'::regclass
               AND t.tgname = 'trg_telemetria_resolver_entidade'
               AND p.proname = 'telemetria_resolver_entidade'
               AND NOT t.tgisinternal
          ) THEN
            RAISE EXCEPTION
              'trg_telemetria_resolver_entidade sumiu do telemetria_time_metric_entries';
          END IF;
        END
        $guarda$
        """
    )


def downgrade() -> None:
    _replace(com_search_path=False)
