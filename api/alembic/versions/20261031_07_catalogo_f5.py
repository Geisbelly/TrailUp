"""Catálogo da F5: os cards legados saem, entram os de tempo ativo, retorno e abandono por etapa (F5, Task 5)

`legado.tempo_uso` e `legado.abandono` (`20261029_02`) eram os cards sobre a definição antiga de
`vw_metricas_engajamento_aluno_classe`, presos à I16 "até a F5 trocá-los". A F5 trocou
(`20261031_04` e `_05`), então eles saem e entram as chaves das definições novas.

| chave | fonte | invariantes |
|---|---|---|
| `prof.tempo_ativo` | `vw_metricas_engajamento_aluno_classe.tempo_ativo_seg` | I01, I02, I03, I16 |
| `prof.retorno_semanal` | `vw_metricas_turma_geral_classe.retorno_semanal_pct` | I01, I02, I03 |
| `prof.abandono_por_etapa` | `metricas_engajamento_turma.por_topico` | I01, I04, I05 |

`prof.inatividade` e `prof.estagnado` passam a apontar para as colunas novas da view
(`inativo_desde` e `estagnado_desde`) e sobem para `formula_versao = 2`. A estagnação ganha a I01,
porque o "sem avanço" passou a vir da telemetria.

## Por que acerto não entra

O plano previa uma chave `legado.acerto` sem invariante. Pela regra de `vw_metricas_disponibilidade`
(`20261029_02`), métrica **sem invariante e sem validação é sempre disponível**: o card de acerto, que a
spec §1 mostra errado (quatro livros-caixa), apareceria como confiável. Ele fica fora do catálogo, como
estava, até a F4b criar a invariante do livro único de respostas (I19 estendida ou uma nova).

## Downgrade

Devolve as duas linhas `legado.*` com o texto da `20261029_02`, remove as três novas e volta as fontes.

Revision ID: 20261031_07
Revises: 20261031_06
Create Date: 2026-10-31
"""

from alembic import op

revision = "20261031_07"
down_revision = "20261031_06"
branch_labels = None
depends_on = None

UPGRADE = """
DELETE FROM public.metricas_catalogo WHERE chave IN ('legado.tempo_uso', 'legado.abandono');

INSERT INTO public.metricas_catalogo
  (chave, nome, descricao, publico, unidade, janela, fonte, nulo_significa, requer_validacao, invariantes)
VALUES
  ('prof.tempo_ativo', 'Tempo ativo',
   'Minutos em que os alunos interagiram com o material, só do escopo de tópico, por aluno e por turma.',
   '{professor}', 'minutos', 'período escolhido', 'vw_metricas_engajamento_aluno_classe.tempo_ativo_seg',
   'sem telemetria no período', 'nenhuma', '{I01,I02,I03,I16}'),
  ('prof.retorno_semanal', 'Retorno semanal',
   'Dos alunos ativos numa semana completa, quantos voltaram a estudar na semana seguinte.',
   '{professor}', 'percentual', '8 semanas completas', 'vw_metricas_turma_geral_classe.retorno_semanal_pct',
   'nenhum aluno ativo em semanas completas', 'nenhuma', '{I01,I02,I03}'),
  ('prof.abandono_por_etapa', 'Abandono por etapa',
   'Por tópico da trilha, quantos alunos iniciaram, concluíram e estão parados há 14 dias abaixo da mediana.',
   '{professor}', 'contagem', 'estado atual', 'metricas_engajamento_turma.por_topico',
   'turma sem tópicos', 'nenhuma', '{I01,I04,I05}')
ON CONFLICT (chave) DO UPDATE SET
  nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, publico = EXCLUDED.publico, unidade = EXCLUDED.unidade,
  janela = EXCLUDED.janela, fonte = EXCLUDED.fonte, nulo_significa = EXCLUDED.nulo_significa,
  requer_validacao = EXCLUDED.requer_validacao, invariantes = EXCLUDED.invariantes;

UPDATE public.metricas_catalogo
   SET fonte = 'vw_metricas_engajamento_aluno_classe.inativo_desde', formula_versao = 2
 WHERE chave = 'prof.inatividade';
UPDATE public.metricas_catalogo
   SET fonte = 'vw_metricas_engajamento_aluno_classe.estagnado_desde', formula_versao = 2,
       invariantes = '{I01,I04,I05}'
 WHERE chave = 'prof.estagnado';
"""

DOWNGRADE = """
DELETE FROM public.metricas_catalogo
 WHERE chave IN ('prof.tempo_ativo', 'prof.retorno_semanal', 'prof.abandono_por_etapa');

INSERT INTO public.metricas_catalogo
  (chave, nome, descricao, publico, unidade, janela, fonte, nulo_significa, requer_validacao, invariantes)
VALUES
  ('legado.tempo_uso', 'Tempo de uso (card atual)',
   'Card atual do console sobre vw_metricas_engajamento_aluno_classe. Mantido até a F5 trocá-lo.',
   '{professor}', 'minutos', '7 dias', 'vw_metricas_engajamento_aluno_classe',
   'sem telemetria no período', 'nenhuma', '{I16}'),
  ('legado.abandono', 'Abandono (card atual)',
   'Card atual do console sobre vw_metricas_engajamento_aluno_classe. Mantido até a F5 trocá-lo.',
   '{professor}', 'percentual', '7 dias', 'vw_metricas_engajamento_aluno_classe',
   'sem telemetria no período', 'nenhuma', '{I16}')
ON CONFLICT (chave) DO NOTHING;

UPDATE public.metricas_catalogo SET fonte = 'aluno_atividade_diaria', formula_versao = 1
 WHERE chave = 'prof.inatividade';
UPDATE public.metricas_catalogo
   SET fonte = 'topico_aluno.percentual_concluido', formula_versao = 1, invariantes = '{I04,I05}'
 WHERE chave = 'prof.estagnado';
"""


def upgrade() -> None:
    op.execute(UPGRADE)


def downgrade() -> None:
    op.execute(DOWNGRADE)
