"""DELETE do Realtime chega ao app: REPLICA IDENTITY FULL onde o filtro precisa

O mobile assina 8 tabelas com `event: '*'` e filtro em coluna NAO-PK
(`aluno_id`, `classe_id`). Com `REPLICA IDENTITY DEFAULT` -- que e o caso das
8, verificado em producao -- o payload de DELETE carrega **so a replica
identity**, isto e, so a chave primaria. O filtro por `aluno_id` nao tem o que
casar, e o evento nunca e entregue.

A unica que escapa e `classe_mapa_tema`, por acidente feliz: ela filtra por
`classe_id`, que E a PK dela.

    tabela                  PK          filtro da assinatura   DELETE chega?
    classe_mapa_tema        classe_id   classe_id              sim
    classe_aluno            id          aluno_id               NAO
    notificacoes            id          aluno_id               NAO
    eventos_aluno           id          aluno_id               NAO
    topico_aluno            id          aluno_id               NAO
    conteudo_aluno          id          aluno_id               NAO
    atividade_aluno         id          aluno_id               NAO
    conteudo_personalizado  id          classe_id              NAO

E `supabase-js` nao reclama: o canal assina, `.subscribe()` devolve
`SUBSCRIBED`, e evento nenhum chega -- o mesmo silencio da tabela sem policy
descrito no CLAUDE.md.

## O que quebra hoje

- **`classe_aluno`**: o professor tira o aluno da turma (`removeClassStudent`
  apaga a linha) e o app do aluno nao fica sabendo. Segue mostrando a turma
  ate um refresh frio.
- **`eventos_aluno`**: `20261017_06` criou `trg_eventos_aluno_after_iud`, ou
  seja, DELETE virou operacao esperada no motor de conquistas. O ranking do
  aluno nao reage a ela. Ja ha 408 deletes nesta base.
- **`notificacoes`**: notificacao apagada continua na caixa de entrada.

## Por que SO estas tres

`FULL` faz o WAL carregar a linha antiga inteira em todo UPDATE e DELETE
(INSERT nao muda). Nas tabelas de progresso isso cai no caminho mais quente do
app: elas sao reescritas por trigger a cada evento. Contadores desta base
(`pg_stat_user_tables`), que e pequena mas ja mostra a proporcao:

    tabela                  inserts  updates  deletes
    conteudo_personalizado      224     8881      715   <- fora
    topico_aluno                124     6589       51   <- fora
    classe_aluno                 39     4112       12   <- DENTRO, ver abaixo
    eventos_aluno               534     1539      408   <- dentro
    atividade_aluno             210     1313      250   <- fora
    conteudo_aluno               88      730       58   <- fora
    notificacoes                434      151        4   <- dentro

`classe_aluno` entra apesar de ser a terceira mais quente: e a unica em que a
perda e visivel para o aluno (a turma some ou nao some da tela dele), e nao
existe outro caminho -- sem `FULL`, nem o filtro casa nem a RLS consegue ser
avaliada sobre um old record que so tem a PK. O custo e dobrar o WAL por
UPDATE numa linha estreita (meia duzia de colunas numericas e dois uuid).

As quatro de fora perdem DELETE de propósito, por ora. Elas so sao apagadas
em cascata (professor exclui topico/conteudo, ou aluno sai da turma) -- e o
evento de `classe_aluno` cobre o caso do aluno sair. Ver #331 antes de ligar
`FULL` nelas: aquela issue decidiu esperar dado real antes de mexer em
performance, e esta e uma troca de performance.

Revision ID: 20261018_01
Revises: 20261017_10
Create Date: 2026-10-18
"""

from alembic import op

revision = "20261018_01"
down_revision = "20261017_10"
branch_labels = None
depends_on = None


# Tabelas assinadas com filtro em coluna nao-PK e cujo DELETE o cliente precisa
# ver. Mexer nesta lista e decisao de produto + performance: leia o cabecalho.
COM_DELETE_OBSERVAVEL = ("classe_aluno", "notificacoes", "eventos_aluno")


def upgrade() -> None:
    for tabela in COM_DELETE_OBSERVAVEL:
        op.execute(f"ALTER TABLE public.{tabela} REPLICA IDENTITY FULL")


def downgrade() -> None:
    # DEFAULT e o padrao do Postgres: volta a logar so a PK no old record, e
    # com isso o DELETE volta a nao chegar ao app. Reverter devolve o defeito,
    # que e a unica forma honesta de desfazer.
    for tabela in COM_DELETE_OBSERVAVEL:
        op.execute(f"ALTER TABLE public.{tabela} REPLICA IDENTITY DEFAULT")
