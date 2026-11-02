"""O lote gravado direto pelo app entra na fila de análise vencido, sem a folga de 5 min (#96)

## O que estava errado

A `20261029_09` põe todo lote novo na fila com `proxima_tentativa_em = now() + 5 min` (a P2). A folga
existe por causa do caminho da API: `POST /api/v1/telemetria/lotes` analisa o lote dentro do próprio
pedido, e o worker não pode pegá-lo ao mesmo tempo. Mas a folga vale para os dois caminhos, e o lote
gravado direto pelo app (`via = 'direta'`) não tem pedido nenhum analisando. Ele esperava os 5 min à
toa, e só depois o worker (que varre a cada 30 s) o pegava. Medido em 02/11: do lote ao início do ciclo
de análise passavam de 6 a 44 min. O resto da conta eram ciclos lentos por retry do SDK do Gemini,
tratados na #811.

## O que muda

Só o corpo de `fn_telemetria_lote_enfileira_analise()`: `via = 'direta'` entra com folga 0 (vence na
hora); qualquer outra via, inclusive nula, mantém os 5 min. O gatilho, a tabela e as funções do worker
não mudam.

### Por que `NEW.via` já está certa aqui

`trg_telemetria_lote_via` (`20261029_01`) é **BEFORE** INSERT e é quem decide a via: `direta` para
quem escreve como `authenticated`, senão a informada ou `api`. O enfileiramento é **AFTER** INSERT
(`trg_telemetria_lotes_enfileira_analise`), e todo gatilho BEFORE roda antes de todo AFTER, qualquer
que seja o nome. Então o AFTER vê a via já gravada, e o cliente não consegue escolhê-la: um aluno que
declare `'api'` grava `'direta'` e vence na hora, como deve (não há pedido analisando o lote dele).

### Por que o lote direto não corre contra a análise do pedido

O pedido só analisa o lote que ele mesmo inseriu (`insert_or_get_lote` devolve `created = False` no
`ON CONFLICT DO NOTHING`, e a rota sai sem analisar). Se o app desistiu da API e gravou direto, ou a API
gravou antes (o INSERT direto bate no índice único e não dispara o gatilho), ou o app gravou antes (e o
pedido não analisa). Nos dois casos, só o worker analisa um lote com `via = 'direta'`.

### O que não muda

- Itens que já estão na fila ficam com a folga com que entraram: são no máximo 5 min de espera, e
  reescrevê-los não paga uma migration que mexe em dado.
- `via` nula (linha de antes da `20261029_01`, ou escrita sem passar pelo gatilho) fica com a folga:
  sem saber o caminho, o seguro é supor que um pedido pode estar analisando.

### Regra de fronteira

Enfileirar continua sendo encanamento, no banco. A decisão de quando o worker pega é só o vencimento.

## Downgrade

Volta o corpo da `20261029_09`: 5 min para toda via.

Revision ID: 20261102_09
Revises: 20261102_08
Create Date: 2026-11-02
"""

from alembic import op

revision = "20261102_09"
down_revision = "20261102_08"
branch_labels = None
depends_on = None

FOLGA = "5 minutes"  # P2 da 20261029_09, agora só para o lote que pode estar sendo analisado pelo pedido


def _enfileira(proxima_tentativa_em: str, comentario: str) -> str:
    return f"""
CREATE OR REPLACE FUNCTION public.fn_telemetria_lote_enfileira_analise()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  IF NEW.analysis_ciclo_id IS NULL AND NEW.analysis_error IS NULL THEN
    -- {comentario}
    INSERT INTO public.telemetria_analise_fila (lote_id, proxima_tentativa_em)
    VALUES (NEW.id, {proxima_tentativa_em})
    ON CONFLICT (lote_id) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_telemetria_lote_enfileira_analise() FROM PUBLIC, anon, authenticated;
"""


UPGRADE = _enfileira(
    f"CASE WHEN NEW.via = 'direta' THEN now() ELSE now() + interval '{FOLGA}' END",
    "via direta: nenhum pedido analisa o lote, vence na hora. API (ou via nula): folga, a analise do"
    "\n    -- pedido termina antes e tira o item, sem analise em dobro. NEW.via vem do gatilho BEFORE.",
)

DOWNGRADE = _enfileira(
    f"now() + interval '{FOLGA}'",
    "folga: a analise do pedido termina antes e tira o item, sem analise em dobro",
)


def upgrade() -> None:
    op.execute(UPGRADE)


def downgrade() -> None:
    op.execute(DOWNGRADE)
