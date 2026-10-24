"""O recálculo de progresso passa a rodar uma vez por COMANDO, não por linha

## O sintoma

`{"statusCode":"544","error":"DatabaseTimeout"}` chegando ao cliente, e no banco três
`UPDATE personalizacao_item_progresso` simultâneos levando de 0,6 a 3,8 s, com 32 de 60
conexões ocupadas.

## O que foi medido, inclusive o que NÃO era

Três hipóteses caíram antes de sobrar a certa:

| suspeita | medida |
| --- | --- |
| volume da tabela | **19 linhas, 224 kB** — não é dado |
| RLS cara (5 policies) | UPDATE sem RLS **49,3 ms**, com RLS **44,6 ms** — igual |
| lote amplificando o custo | 1 linha **168 ms**; 20 linhas num INSERT só, **88,7 ms** (4,4 ms por linha) — o lote é mais barato, não mais caro |

O que sobra é o que o trigger faz: `trailup_progresso_after_item` é `FOR EACH ROW` e, a cada
linha, chama `trailup_recalcular_topico_aluno` **e** `trailup_recalcular_classe_aluno` —
medidos em 43,5 ms e 50,8 ms. Esses dois ESCREVEM em `topico_aluno` e em `classe_aluno`.

Num upsert de N itens do mesmo tópico, a mesma linha de `topico_aluno` é reescrita N vezes.
Sozinho isso é só desperdício (o recálculo é idempotente por aluno+tópico). Com escritas
concorrentes — e o app manda em rajada ao semear o percurso e ao sincronizar a fila — cada
transação segura a trava daquela linha durante todas as suas N reescritas, e as outras esperam.
É daí que vêm os segundos, e é daí que vem o timeout: o pool satura esperando trava, e quem
chega depois (inclusive o Storage, que divide o mesmo banco) toma `DatabaseTimeout`.

## A mudança

O trigger de `personalizacao_item_progresso` passa a ser **por comando**, com tabelas de
transição: ele junta os pares `(aluno, tópico)` DISTINTOS tocados e recalcula uma vez cada.
N reescritas da mesma linha viram uma.

Três triggers e não um: no Postgres, um trigger com tabela de transição cobre **um** evento.
INSERT e UPDATE leem `novas`; DELETE lê `antigas`.

`conteudo_aluno` e `atividade_aluno` continuam por linha, de propósito: o app escreve nelas uma
de cada vez, não em lote, então não há rajada para amortizar — e mudar as três de uma vez
multiplicaria por três a superfície de uma correção que ainda não viu produção. A função antiga
fica onde está, atendendo as duas.

## O que esta migration NÃO muda

O resultado. `trailup_recalcular_topico_aluno` e `trailup_recalcular_classe_aluno` não são
tocadas, e continuam sendo a única fonte do percentual — nenhum cliente escreve essas colunas.
Recalcular uma vez por comando dá o mesmo número que recalcular N vezes, porque a conta lê o
estado final da tabela, não o delta.

## Downgrade

Volta o trigger por linha. Reversão fiel, e devolve a contenção descrita acima.

Revision ID: 20261022_04
Revises: 20261022_03
Create Date: 2026-10-22
"""

from alembic import op

revision = "20261022_04"
down_revision = "20261022_03"
branch_labels = None
depends_on = None


FUNCAO = """
CREATE OR REPLACE FUNCTION public.trailup_progresso_after_item_stmt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  par record;
BEGIN
  -- Os pares DISTINTOS tocados pelo comando. O recálculo é idempotente por (aluno, tópico):
  -- repetir para a mesma linha só reescreve `topico_aluno` de novo e alonga a trava.
  --
  -- A ramificação por TG_OP não é estilo: no Postgres a tabela de transição só EXISTE no
  -- evento que a declarou. Ler `antigas` num INSERT levanta "relation does not exist" em tempo
  -- de execução — não de criação —, então um corpo único com UNION das duas passaria na
  -- migration e quebraria no primeiro insert do aluno.
  CREATE TEMP TABLE pares_tocados (aluno_id uuid, topico_id bigint) ON COMMIT DROP;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO pares_tocados SELECT aluno_id, topico_id FROM novas;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    INSERT INTO pares_tocados SELECT aluno_id, topico_id FROM antigas;
  END IF;

  FOR par IN
    SELECT DISTINCT aluno_id, topico_id FROM pares_tocados
     WHERE aluno_id IS NOT NULL AND topico_id IS NOT NULL
  LOOP
    PERFORM public.trailup_recalcular_topico_aluno(par.aluno_id, par.topico_id);

    PERFORM public.trailup_recalcular_classe_aluno(par.aluno_id, t.classe_id)
       FROM public.topicos t
      WHERE t.id = par.topico_id AND t.classe_id IS NOT NULL;
  END LOOP;

  DROP TABLE pares_tocados;
  RETURN NULL;
END;
$function$;
"""

# Tabela de transição vale para UM evento por trigger. Cada um declara só a que existe, e um
# SELECT sobre tabela não declarada nem chega a ser planejado porque o ramo não roda.
TRIGGERS = """
DROP TRIGGER IF EXISTS trg_personalizacao_item_progresso_progresso
    ON public.personalizacao_item_progresso;
DROP TRIGGER IF EXISTS trg_pip_progresso_insert ON public.personalizacao_item_progresso;
DROP TRIGGER IF EXISTS trg_pip_progresso_update ON public.personalizacao_item_progresso;
DROP TRIGGER IF EXISTS trg_pip_progresso_delete ON public.personalizacao_item_progresso;

CREATE TRIGGER trg_pip_progresso_insert
 AFTER INSERT ON public.personalizacao_item_progresso
 REFERENCING NEW TABLE AS novas
 FOR EACH STATEMENT EXECUTE FUNCTION public.trailup_progresso_after_item_stmt();

CREATE TRIGGER trg_pip_progresso_update
 AFTER UPDATE ON public.personalizacao_item_progresso
 REFERENCING NEW TABLE AS novas OLD TABLE AS antigas
 FOR EACH STATEMENT EXECUTE FUNCTION public.trailup_progresso_after_item_stmt();

CREATE TRIGGER trg_pip_progresso_delete
 AFTER DELETE ON public.personalizacao_item_progresso
 REFERENCING OLD TABLE AS antigas
 FOR EACH STATEMENT EXECUTE FUNCTION public.trailup_progresso_after_item_stmt();
"""


def upgrade() -> None:
    op.execute(FUNCAO)
    op.execute(TRIGGERS)


def downgrade() -> None:
    # Volta o trigger por linha, com a contencao que o docstring descreve.
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_pip_progresso_insert ON public.personalizacao_item_progresso;
        DROP TRIGGER IF EXISTS trg_pip_progresso_update ON public.personalizacao_item_progresso;
        DROP TRIGGER IF EXISTS trg_pip_progresso_delete ON public.personalizacao_item_progresso;
        DROP FUNCTION IF EXISTS public.trailup_progresso_after_item_stmt();

        CREATE TRIGGER trg_personalizacao_item_progresso_progresso
         AFTER INSERT OR DELETE OR UPDATE ON public.personalizacao_item_progresso
         FOR EACH ROW EXECUTE FUNCTION public.trailup_progresso_after_item();
        """
    )
