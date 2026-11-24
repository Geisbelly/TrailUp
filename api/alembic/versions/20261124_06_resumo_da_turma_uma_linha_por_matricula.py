"""`vw_aluno_classe_resumo` devolve uma linha por matrícula, mesmo com `iaDescricao` repetida

## O defeito, medido em produção em 2026-11-24

O aluno de teste da turma 3 concluiu o tópico 11. O banco gravou tudo: `topico_aluno` 100% e
`classe_aluno."porcentagemConcluida"` = 20. O app continuou mostrando o percentual antigo.

A view juntava `iaDescricao` só por `aluno_id`. A tabela não tem unicidade por aluno, e o ciclo da IA
(`IaDescricaoRepository.upsert_cycle_summary`) faz "lê a mais recente; se não há, insere": dois
ciclos ao mesmo tempo inserem duas linhas. Foi o que aconteceu com esse aluno (15:12:00 e 15:12:01).
Com duas linhas em `iaDescricao`, a view devolvia DUAS linhas para a mesma matrícula. No app:

- `Classe.loadResumo` pede `.single()`; duas linhas dão `PGRST116`, que o app trata como "sem resumo"
  e devolve `null`. A recarga depois de cada progresso (`refreshResumo`) mantinha então o resumo
  antigo na tela, e o percentual da campanha não andava até recarregar a página;
- `Classe.findAllByAluno` montava a turma duas vezes.

## A correção

A junção vira `LEFT JOIN LATERAL` com a linha mais recente de `iaDescricao` do aluno (a mesma que o
repositório da API atualiza: `ORDER BY created_at DESC`). A view continua `security_invoker`, com as
mesmas colunas, na mesma ordem, e os mesmos GRANTs (`CREATE OR REPLACE` os preserva).

Nenhuma linha é apagada: a linha repetida de `iaDescricao` fica onde está, só deixa de multiplicar a
matrícula. O app também passou a tolerar a repetição (`mobile/src/models/Classe.ts`), para o caso de
outra junção da view voltar a multiplicar.

Revision ID: 20261124_06
Revises: 20261124_05
Create Date: 2026-11-24
"""

from alembic import op

revision = "20261124_06"
down_revision = "20261124_05"
branch_labels = None
depends_on = None

COLUNAS_DA_VIEW = """
    ca.aluno_id,
    c.id AS classe_id,
    m.nome AS materia_nome,
    m.descricao AS materia_descricao,
    p.nome AS professor_nome,
    p.descricao AS professor_descricao,
    ca."notaMedia",
    ca."tempoMedioPorAtividade",
    ca."acertosPercentual",
    ca."porcentagemConcluida",
    ca."ultimaAtividade",
    ca."tempoGastoMin",
    ca."isComplete",
    ca."atividadesConcluidas",
    iad."recomendacaoTrilha",
    iad."modoOperacao",
    iad.insights,
    iad."perfisDetectados",
    c.descricao AS classe_nome
"""

JUNCOES_COMUNS = """
     JOIN public.classe c ON c.id = ca.classe_id
     LEFT JOIN public.materia m ON m.id = c.materia_id
     LEFT JOIN LATERAL public.trailup_professor_da_turma(c.id) p ON true
"""

UPGRADE_SQL = f"""
CREATE OR REPLACE VIEW public.vw_aluno_classe_resumo WITH (security_invoker = on) AS
 SELECT {COLUNAS_DA_VIEW}
   FROM public.classe_aluno ca
     {JUNCOES_COMUNS}
     LEFT JOIN LATERAL (
       SELECT i."recomendacaoTrilha", i."modoOperacao", i.insights, i."perfisDetectados"
         FROM public."iaDescricao" i
        WHERE i.aluno_id = ca.aluno_id
        ORDER BY i.created_at DESC NULLS LAST, i.id DESC
        LIMIT 1
     ) iad ON true;

COMMENT ON VIEW public.vw_aluno_classe_resumo IS
  'Resumo da matricula, uma linha por (aluno, turma). iaDescricao entra pela linha mais recente do aluno (20261124_06).';
"""

DOWNGRADE_SQL = f"""
CREATE OR REPLACE VIEW public.vw_aluno_classe_resumo WITH (security_invoker = on) AS
 SELECT {COLUNAS_DA_VIEW}
   FROM public.classe_aluno ca
     {JUNCOES_COMUNS}
     LEFT JOIN public."iaDescricao" iad ON iad.aluno_id = ca.aluno_id;

COMMENT ON VIEW public.vw_aluno_classe_resumo IS NULL;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
