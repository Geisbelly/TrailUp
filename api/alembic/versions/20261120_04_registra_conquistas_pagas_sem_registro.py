"""Conquista paga sem registro ganha o registro (invariante I13)

## O estado

A I13 (`20261029_03`, "conquista pontuada sem registro") acusava 10 prêmios `conquista_desbloqueada`
sem linha em `conquistas_aluno`. Medido em produção em 20/11 (`READ ONLY`), todos são de um só aluno:

- 9 são conquistas de perfil que o gatilho antigo deu em 10/09 a quem não era daquele perfil. O
  `28f92cea` (`20260910_11`) parou a concessão e deixou a revogação "como decisão separada". Depois,
  fora do git, os registros foram apagados e os prêmios (pontos no rank) ficaram.
- 1 é da conquista 33, de turma. A conquista foi apagada, e a cascata de `conquistas_aluno` levou o
  registro.

Até a `20261120_01`, esse estado travava o aluno: o gatilho tentava pagar de novo e o índice único
abortava todo evento dele. A `20261120_01` destravou, mas o razão e o registro seguiam discordando.

## A decisão

Fica o que o aluno já viu: o prêmio continua no rank, e a conquista volta a ter registro. A outra saída,
estornar, tiraria pontos que o aluno já viu e já tinha sido notificado de ganhar (a mesma razão por
que a `20260910_11` não revogou).

## O que faz

Para cada prêmio `conquista:<id>` sem registro, cujo `<id>` ainda existe em `conquistas`, insere a
linha concluída, com `progresso = 100` e `data_conquista` = a data do prêmio. Uma linha por aluno e
conquista (o prêmio mais antigo decide a data). Idempotente: só insere onde a linha falta.

- **Não notifica.** A notificação de conquista sai do gatilho de `eventos_aluno`, não deste INSERT. O
  aluno já foi notificado em setembro.
- `trg_conquista_libera_moldura` roda e não entrega nada: as molduras estão ligadas às conquistas
  47 a 64, e as 9 daqui são de 10 a 27.
- **A conquista 33 não entra.** Ela não existe mais, e a FK recusaria a linha. Esse prêmio continua na
  I13, sozinho, e é o único caso que ela deve acusar depois desta migration.
- As conquistas de perfil que não são do perfil representativo do aluno continuam fora da tela dele
  (`conquistaVisivelParaPerfis` no app). O registro existe, mas a tela não as mostra.

`eventos_aluno.criado_em` é `timestamp` sem fuso, gravado em UTC. `AT TIME ZONE 'UTC'` o lê assim.

## Downgrade

Não desfaz. A linha não tem marca de origem, e apagá-la recriaria a divergência da I13 e o laço que a
`20261120_01` fechou.

Revision ID: 20261120_04
Revises: 20261120_03
Create Date: 2026-11-20
"""

from alembic import op

revision = "20261120_04"
down_revision = "20261120_03"
branch_labels = None
depends_on = None

REGISTRA = r"""
INSERT INTO public.conquistas_aluno (aluno_id, conquista_id, data_conquista, progresso, concluida)
SELECT DISTINCT ON (e.aluno_id, c.id)
       e.aluno_id,
       c.id,
       e.criado_em AT TIME ZONE 'UTC',
       100,
       true
  FROM public.eventos_aluno e
  JOIN public.conquistas c
    ON c.id::text = split_part(e.referencia, ':', 2)
 WHERE e.tipo = 'conquista_desbloqueada'
   AND e.referencia ~ '^conquista:[0-9]+$'
   AND NOT EXISTS (
         SELECT 1
           FROM public.conquistas_aluno ca
          WHERE ca.aluno_id = e.aluno_id
            AND ca.conquista_id = c.id
       )
 ORDER BY e.aluno_id, c.id, e.criado_em;
"""


def upgrade() -> None:
    op.execute(REGISTRA)


def downgrade() -> None:
    pass
