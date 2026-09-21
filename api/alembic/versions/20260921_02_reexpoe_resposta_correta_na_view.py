"""Reexpõe resposta_correta em vw_aluno_classe_detalhado

Fecha a issue de "toda resposta aparece errada, até V ou F". A view em
produção tinha `NULL::text AS questao_resposta_correta` — divergente de TODA
migração no repositório (`20260909_04` e `20260913_25` sempre selecionaram
`q.resposta_correta`), ou seja, alguém rodou um `CREATE OR REPLACE VIEW`
manual direto no banco para não vazar o gabarito ao cliente, sem atualizar
`QuestionActivity.tsx` (que só sabe validar comparando localmente contra
`resposta_correta`). Resultado: `correto == null` sempre, toda resposta vira
"errada" independente do que o aluno escolhe.

Decisão registrada aqui (2026-09-21): reexpor o campo agora para destravar a
correção de atividades. Mover a validação para o servidor (RPC que recebe a
resposta e devolve certo/errado sem nunca expor o gabarito, no mesmo padrão
já usado para a validação de dissertativa por IA) fica como dívida conhecida
— o e-mail já foi vazado uma vez (issue #172), então esta tabela merece o
mesmo tratamento eventualmente.

Reaplica o texto exato de `20260913_25` (única mudança: a coluna do gabarito
volta a ser `q.resposta_correta`), então reexecutar é inofensivo — é a mesma
view, incluindo `security_invoker`.

Revision ID: 20260921_02
Revises: 20260921_01
Create Date: 2026-09-21
"""

from alembic import op

revision = "20260921_02"
down_revision = "20260921_01"
branch_labels = None
depends_on = None


VIEW = """
CREATE OR REPLACE VIEW public.vw_aluno_classe_detalhado AS
 SELECT ta.aluno_id,
    t.id AS topico_id,
    t.classe_id,
    t.nome AS topico_nome,
    t.descricao AS topico_descricao,
    t.ordem AS topico_ordem,
    t.next AS topico_next,
    t.depende AS topico_depende,
    ta.status AS topico_status,
    ta.percentual_concluido AS topico_percentual_concluido,
    ta.ultima_atividade AS topico_ultima_atividade,
    ta.ultima_visualizacao AS topico_ultima_visualizacao,
    ta.updated_at AS topico_updated_at,
    co.id AS conteudo_id,
    co.titulo AS conteudo_titulo,
    co.tipo AS conteudo_tipo,
    co.conteudo AS conteudo_conteudo,
    co.ordem AS conteudo_ordem,
    co.metadata AS conteudo_metadata,
    ca2.status AS conteudo_status,
    ca2.percentual_concluido AS conteudo_percentual_concluido,
    ca2.tempo_gasto_min AS conteudo_tempo_gasto_min,
    ca2.ultima_visualizacao AS conteudo_ultima_visualizacao,
    a.id AS atividade_id,
    a.titulo AS atividade_titulo,
    a.descricao AS atividade_descricao,
    a.tipo AS atividade_tipo,
    a.pontuacao_maxima,
    a.data_entrega AS atividade_data_entrega,
    ac.atividade_id AS atividade_conteudo_atividade_id,
    ac.conteudo_id AS atividade_conteudo_conteudo_id,
    q.id AS questao_id,
    q.enunciado AS questao_enunciado,
    q.tipo AS questao_tipo,
    q.alternativas AS questao_alternativas,
    q.resposta_correta AS questao_resposta_correta,
    q.midia_url AS questao_midia_url,
    m.id AS midia_id,
    m.tipo AS midia_tipo,
    m.url AS midia_url,
    m.legenda AS midia_legenda,
    m.ordem AS midia_ordem,
    aa.status AS atividade_status,
    aa.percentual_concluido AS atividade_percentual_concluido,
    aa.acertos_percentual AS atividade_acertos_percentual,
    aa.tempo_gasto_min AS atividade_tempo_gasto_min,
    aa.pontuacao_obtida AS atividade_pontuacao_obtida,
    aa.ultima_visualizacao AS atividade_ultima_visualizacao,
    ta.tempo_gasto_min AS topico_tempo_gasto_min
   FROM topicos t
     JOIN topico_aluno ta ON ta.topico_id = t.id
     LEFT JOIN conteudos co ON co.topico_id = t.id
     LEFT JOIN conteudo_aluno ca2 ON ca2.conteudo_id = co.id AND ca2.aluno_id = ta.aluno_id
     LEFT JOIN atividades a ON a.topico_id = t.id
     LEFT JOIN atividade_conteudos ac ON ac.atividade_id = a.id AND ac.conteudo_id = co.id
     LEFT JOIN questoes q ON q.atividade_id = a.id
     LEFT JOIN midias m ON m.conteudo_id = co.id
     LEFT JOIN atividade_aluno aa ON aa.atividade_id = a.id AND aa.aluno_id = ta.aluno_id;

ALTER VIEW public.vw_aluno_classe_detalhado SET (security_invoker = on);
"""

VIEW_SEM_GABARITO = VIEW.replace(
    "q.resposta_correta AS questao_resposta_correta,",
    "NULL::text AS questao_resposta_correta,",
)


def upgrade() -> None:
    op.execute(VIEW)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(VIEW_SEM_GABARITO)
    op.execute("NOTIFY pgrst, 'reload schema'")
