"""O lote de telemetria diz por onde chegou (`via`) e, quando não foi pela API, por quê (`fallback_motivo`)

F0 da spec de métricas ("medir antes de mexer").

## O que faltava

O mobile tem dois caminhos para gravar um lote de telemetria: `POST /api/v1/telemetria/lotes` (a API
persiste e dispara o pipeline de análise) e, quando a API não responde, a gravação **direta** no
Supabase (`telemetria_lotes` via PostgREST). Os dois produzem a mesma linha. Não havia como saber,
depois, quantos lotes saíram por cada caminho — nem por que o app desistiu da API. Sem esse número,
"a API cai muito?" e "o fallback está funcionando?" eram opinião. Esta migration põe a resposta na
própria linha:

- `via`: `'api'` ou `'direta'`.
- `fallback_motivo`: só faz sentido quando `via = 'direta'`. Um de `sem_url`, `rede`, `timeout`,
  `http_4xx`, `http_5xx`, `sem_sessao`, `desconhecido`. Quem preenche é o app.

## `via` é decidida pelo banco, não pelo cliente

O gatilho `trg_telemetria_lote_via` (BEFORE INSERT) olha quem escreve. A API conecta como `postgres`,
sem claims de JWT (`app/repositories/telemetria.py`); o mobile escreve pelo PostgREST como
`authenticated`, que preenche `request.jwt.claims`. Então `role = 'authenticated'` nas claims significa
via direta e **o valor que o cliente mandou é ignorado**: um aluno que declare `'api'` grava
`'direta'`. Se o cliente pudesse escolher, um build com defeito (ou quem chama o PostgREST na mão)
falsearia a medida de quanto tráfego cai no fallback. Para o resto (API, `service_role`, script,
backfill) a via informada vale, e a ausente vira `'api'`. Assim um build antigo do app, que nunca ouviu
falar de `via`, é classificado do mesmo jeito que um build novo — e a invariante que vai conferir
`via = 'direta' AND fallback_motivo IS NULL` consegue apontá-lo.

`current_setting('request.jwt.claims', true)` devolve `''` (não NULL) numa conexão que já passou por
um `SET`/`SET LOCAL` dessa chave; `''::jsonb` levanta erro, e levantar aqui perderia o lote. Por isso o
`NULLIF(..., '')`.

## CHECK sem `NOT NULL`, de propósito

As duas colunas aceitam nulo e os CHECKs valem para o que for informado. Build antigo do app grava
pela via direta **sem** `fallback_motivo`: recusar esse lote perderia telemetria de estudo, que é o
pior desfecho possível. O que fica registrado é a falta (`via = 'direta'` com motivo nulo), e é a
invariante I18 que a denuncia. Linhas anteriores a esta migration ficam com as duas colunas nulas:
não há como saber por onde chegaram, e inventar `'api'` para elas falsearia a medida.

A função do gatilho não é `SECURITY DEFINER` (só lê uma configuração de sessão) e não tem EXECUTE para
papel de cliente; o gatilho dispara com o privilégio de quem escreve.
"""

from alembic import op

revision = "20261029_01"
down_revision = "20261027_01"
branch_labels = None
depends_on = None

MOTIVOS = ("sem_url", "rede", "timeout", "http_4xx", "http_5xx", "sem_sessao", "desconhecido")
_LISTA_MOTIVOS = ", ".join(f"'{m}'" for m in MOTIVOS)

COLUNAS = """
ALTER TABLE public.telemetria_lotes
  ADD COLUMN IF NOT EXISTS via text,
  ADD COLUMN IF NOT EXISTS fallback_motivo text;
"""

CHECKS = f"""
ALTER TABLE public.telemetria_lotes
  DROP CONSTRAINT IF EXISTS telemetria_lotes_via_valida;
ALTER TABLE public.telemetria_lotes
  ADD CONSTRAINT telemetria_lotes_via_valida
  CHECK (via IN ('api','direta'));
ALTER TABLE public.telemetria_lotes
  DROP CONSTRAINT IF EXISTS telemetria_lotes_fallback_motivo_valido;
ALTER TABLE public.telemetria_lotes
  ADD CONSTRAINT telemetria_lotes_fallback_motivo_valido
  CHECK (fallback_motivo IN ({_LISTA_MOTIVOS}));
"""

COMENTARIOS = """
COMMENT ON COLUMN public.telemetria_lotes.via IS
  'Por onde o lote chegou: api (POST /telemetria/lotes) ou direta (mobile escrevendo no Supabase). '
  'Decidida pelo gatilho trg_telemetria_lote_via: direta para authenticated (o cliente não escolhe), senão a informada ou api. Nula = anterior a 20261029_01.';
COMMENT ON COLUMN public.telemetria_lotes.fallback_motivo IS
  'Por que o app desistiu da API e gravou direto. Preenchida pelo app; nula com via = direta indica build antigo.';
"""

FUNCAO = """
CREATE OR REPLACE FUNCTION public.fn_telemetria_lote_via()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF (NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'authenticated' THEN
    NEW.via := 'direta';
  ELSE
    NEW.via := COALESCE(NEW.via, 'api');
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_telemetria_lote_via() FROM PUBLIC, anon, authenticated;
"""

GATILHO = """
DROP TRIGGER IF EXISTS trg_telemetria_lote_via ON public.telemetria_lotes;
CREATE TRIGGER trg_telemetria_lote_via
  BEFORE INSERT ON public.telemetria_lotes
  FOR EACH ROW EXECUTE FUNCTION public.fn_telemetria_lote_via();
"""

DOWNGRADE = """
DROP TRIGGER IF EXISTS trg_telemetria_lote_via ON public.telemetria_lotes;
DROP FUNCTION IF EXISTS public.fn_telemetria_lote_via();
ALTER TABLE public.telemetria_lotes DROP CONSTRAINT IF EXISTS telemetria_lotes_via_valida;
ALTER TABLE public.telemetria_lotes DROP CONSTRAINT IF EXISTS telemetria_lotes_fallback_motivo_valido;
ALTER TABLE public.telemetria_lotes DROP COLUMN IF EXISTS via;
ALTER TABLE public.telemetria_lotes DROP COLUMN IF EXISTS fallback_motivo;
"""


def upgrade() -> None:
    op.execute(COLUNAS)
    op.execute(CHECKS)
    op.execute(COMENTARIOS)
    op.execute(FUNCAO)
    op.execute(GATILHO)


def downgrade() -> None:
    op.execute(DOWNGRADE)
