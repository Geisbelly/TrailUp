"""Coleta das respostas do pg_net pelo índice de `created`, e expurgo do histórico do pg_cron

## Por quê

`net._http_response` só tem índice em `created`. Três funções juntam a resposta pelo `id` do pedido
(`h.id = <pedido_id>`), e o Postgres não tem como achar a linha a não ser lendo a tabela inteira:

- `fn_monitor_colher`, dentro de `fn_monitor_tick`, **todo minuto**;
- `fn_monitor_enviar_alertas`, também no tick;
- `retencao_avisos_email`, a cada 30 minutos.

A tabela tem ~1.300 linhas vivas (o pg_net apaga o que passou do TTL de 6 h), mas o arquivo ficou com
47 MB, 27% do banco. O seq scan de cada minuto poda as linhas mortas, e a poda não devolve espaço,
então o autovacuum quase não dispara (duas vezes desde 06/11) e nada encolhe. Medido em produção em
16/11/2026: a coleta lia 6.034 páginas para achar 3 respostas.

Pelo `pg_stat_statements`, `fn_monitor_tick()` era a consulta que mais gastava tempo no banco
inteiro: 19.590 s desde 06/11, 1,35 s de média, 99 s de máximo, cerca de 8.500 páginas por chamada.
`retencao_avisos_email()` era a terceira (630 ms de média, 50 s de máximo). Isso é numa instância
que já trabalha em swap acima da RAM: o IOwait subiu o dia todo em 15/11, com o tick indo de 0,65 s
para 9 a 10 s de mediana, até o banco parar às 22:39 (resolvido com restart). Esta migration não
prova que o monitor sozinho derrubou o banco; ela tira o maior leitor de páginas do caminho.

## O que muda

Cada junção ganha um limite inferior em `created`, a partir do pedido pendente mais antigo:

    AND h.created >= (SELECT min(<hora do pedido>) FROM <tabela> WHERE <pendente>)

Medido com a consulta da coleta: 6.034 páginas viram 11, 16,5 ms viram 1 ms, as mesmas 3 linhas.

**Por que não perde resposta.** A hora do pedido (`monitor_sonda.enviada_em`,
`monitor_alerta.pedido_em`, `retencao_avisos_inatividade.email_solicitado_em`) é o `now()` da
transação que chama o pg_net. O worker do pg_net só faz o pedido depois desse COMMIT e grava
`created` quando a resposta chega, então `created` nunca é menor. Conferido em produção: zero
respostas anteriores ao pedido e zero pedidos pendentes sem a hora. Sem pendente, o `min` é NULL e a
junção não devolve nada, que é o resultado certo.

**Troca no texto VIVO.** Cada função é lida com `pg_get_functiondef` e o trecho é trocado ali, como
em `20260920_02`: vale para a versão que estiver em produção, que pode estar à frente do repo. Sem
o trecho esperado, a migration falha alto em vez de seguir sem o filtro. Já aplicada, não aplica de
novo.

## Expurgo de `cron.job_run_details`

O pg_cron grava uma linha por execução e nunca apaga: 114 mil linhas desde 26/08, 21 MB, sem
índice em `start_time`. A contagem de falhas do monitor (a cada 10 min) faz seq scan nela: 1,25 s.
Novo job diário `trailup_cron_historico_expurgo` apaga o que tem mais de 7 dias. Quem lê o
histórico olha no máximo 24 h (`fn_painel_tecnico`) e 60 min (`fn_monitor_varrer_sinais`).

## Fora do alcance

- O espaço já inchado de `net._http_response` não volta: encolher pede `VACUUM FULL`, e a tabela é
  do `supabase_admin`. Com a leitura pelo índice, o tamanho deixa de pesar a cada minuto.
- `notificacoes_conciliar_push` e `notificacoes_conciliar_recibos_push` também leem
  `net._http_response`, sem junção por `id`. Ficam para outra medição.

Revision ID: 20261116_02
Revises: 20261115_06
Create Date: 2026-11-16
"""

from alembic import op

revision = "20261116_02"
down_revision = "20261115_06"
branch_labels = None
depends_on = None

JOB_EXPURGO_CRON = "trailup_cron_historico_expurgo"
DIAS_DE_HISTORICO = 7

# (função, trecho de hoje, trecho com o limite em `created`)
TROCAS = [
    (
        "fn_monitor_colher",
        "JOIN net._http_response h ON h.id = s.pedido_id",
        "JOIN net._http_response h ON h.id = s.pedido_id"
        " AND h.created >= (SELECT min(p.enviada_em) FROM public.monitor_sonda p WHERE p.colhida_em IS NULL)",
    ),
    (
        "fn_monitor_enviar_alertas",
        "JOIN net._http_response h ON h.id = a.pedido_id",
        "JOIN net._http_response h ON h.id = a.pedido_id"
        " AND h.created >= (SELECT min(x.pedido_em) FROM public.monitor_alerta x"
        " WHERE x.pedido_id IS NOT NULL AND x.enviado_em IS NULL)",
    ),
    (
        "retencao_avisos_email",
        "JOIN net._http_response hr ON hr.id = v.email_request_id",
        "JOIN net._http_response hr ON hr.id = v.email_request_id"
        " AND hr.created >= (SELECT min(x.email_solicitado_em) FROM public.retencao_avisos_inatividade x"
        " WHERE x.email_request_id IS NOT NULL AND x.email_enviado_em IS NULL)",
    ),
]


def _troca(funcao: str, de: str, para: str, *, desfazer: bool = False) -> str:
    """Troca `de` por `para` no texto vivo de `funcao`.

    Aplicando: já com o filtro, não faz nada; sem o trecho de hoje, falha alto.
    Desfazendo (`de` é o trecho com filtro): sem ele, já está desfeito e não faz nada. A checagem é
    sempre pelo trecho COM filtro, porque o de hoje é parte dele e estaria presente nos dois casos.
    """
    if desfazer:
        guarda = f"""
  IF position($de${de}$de$ IN v_def) = 0 THEN
    RETURN;
  END IF;"""
    else:
        guarda = f"""
  IF position($para${para}$para$ IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF position($de${de}$de$ IN v_def) = 0 THEN
    RAISE EXCEPTION '{funcao}: trecho esperado não encontrado no texto vivo';
  END IF;"""
    return f"""
DO $troca$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  SELECT p.oid INTO STRICT v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '{funcao}';
  v_def := pg_get_functiondef(v_oid);{guarda}
  EXECUTE replace(v_def, $de${de}$de$, $para${para}$para$);
END
$troca$;
"""


AGENDAR = f"""
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(j.jobname) FROM cron.job j WHERE j.jobname = '{JOB_EXPURGO_CRON}';
    PERFORM cron.schedule(
      '{JOB_EXPURGO_CRON}', '29 4 * * *',
      $job$DELETE FROM cron.job_run_details
            WHERE coalesce(end_time, start_time) < now() - interval '{DIAS_DE_HISTORICO} days'$job$);
  END IF;
END
$cron$;
"""

DESAGENDAR = f"""
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(j.jobname) FROM cron.job j WHERE j.jobname = '{JOB_EXPURGO_CRON}';
  END IF;
END
$cron$;
"""


def upgrade() -> None:
    for funcao, de, para in TROCAS:
        op.execute(_troca(funcao, de, para))
    op.execute(AGENDAR)


def downgrade() -> None:
    op.execute(DESAGENDAR)
    for funcao, de, para in TROCAS:
        op.execute(_troca(funcao, para, de, desfazer=True))
