"""Repara conteudo_aluno.tempo_gasto_min a partir da telemetria

`tempo_gasto_min` nao e derivado da telemetria, ao contrario do que o
CLAUDE.md afirma. Quem o grava e a RPC `trailup_registrar_intervalo_estudo`,
chamada pelo app, que ACUMULA cada intervalo e protege contra duplicata com:

    INSERT INTO estudo_intervalos(...) ON CONFLICT (id) DO NOTHING
      RETURNING id INTO v_id;
    IF v_id IS NULL THEN RETURN; END IF;

A consequencia e que uma chamada que falha perde o intervalo PARA SEMPRE:
nao ha reprocessamento a partir da telemetria. E elas vinham falhando --
em 2026-09-27 o log do app registrava, em sequencia,

    [Tempo] Falha ao salvar intervalo de estudo:
      {"code":"57014","message":"canceling statement due to statement timeout"}

O `statement_timeout` do papel `authenticated` e 8s, e a instancia estava
sob pressao de I/O por bloat na TOAST de `telemetria_lotes` (117 MB para
2,88 MB de dados uteis; corrigido com VACUUM FULL no mesmo dia).

A telemetria, essa, ficou intacta. `trailup_tempo_telemetria_min` soma
`active_sec` de `telemetria_time_metric_entries` filtrando por `scope`, e
media na producao, por conteudo:

    conteudo  gravado  telemetria
        192     2.72      6.02
        193     2.53      2.88
        194     7.50      9.42
        195     2.36      6.28

Esta revisao repara a coluna com o que a telemetria sabe.

## Escopo: so conteudo_aluno, de proposito

Medido antes de escrever, sobre a base inteira:

    tabela           subestimadas  superestimadas  recupera  cairia
    conteudo_aluno        4              0          +9.50     0.00
    atividade_aluno       7             21          +0.56    -9.26
    topico_aluno          0              4           0.00   -89.27

Em `conteudo_aluno` nao ha uma unica linha em que a telemetria diga MENOS
que o gravado -- reparar so pode somar. Nas outras duas, substituir pelo
valor da telemetria DERRUBARIA tempo: 89 minutos em `topico_aluno`, que
cairia de 114 para 24,7.

Essa queda pode ser o tempo em dobro que o `fix/coleta-tempo-estudo`
corrigiu no coletor, ou tempo legitimo de navegacao dentro do topico e
fora de qualquer conteudo/atividade -- a telemetria de `scope='topic'`
nao necessariamente cobre o mesmo intervalo. Decidir isso exige analise
propria e nao cabe num reparo. Ficam como estao.

## Seguranca

O UPDATE usa GREATEST, entao nunca reduz o que ja esta gravado, mesmo que
a base mude entre a medicao e a aplicacao. Rodar duas vezes e inocuo.

Revision ID: 20260927_01
Revises: 20260923_01
Create Date: 2026-09-27
"""

from alembic import op

revision = "20260927_01"
down_revision = "20260923_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE public.conteudo_aluno ca
           SET tempo_gasto_min = GREATEST(
                 COALESCE(ca.tempo_gasto_min, 0),
                 public.trailup_tempo_telemetria_min(
                   ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL
                 )
               )
         WHERE public.trailup_tempo_telemetria_min(
                 ca.aluno_id, 'content', NULL, ca.conteudo_id, NULL
               ) > COALESCE(ca.tempo_gasto_min, 0);
        """
    )


def downgrade() -> None:
    # Sem volta: o valor anterior era justamente o incompleto, e nao ha
    # onde recupera-lo. Reverter seria reintroduzir a perda.
    pass
