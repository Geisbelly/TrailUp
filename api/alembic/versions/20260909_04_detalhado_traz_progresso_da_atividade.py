"""o detalhe da classe passa a trazer o progresso da atividade

`vw_aluno_classe_detalhado` e' a arvore que o app monta (`Classe.loadDetalhado`).
Ela junta `topico_aluno` e `conteudo_aluno` -- e **nao junta `atividade_aluno`**.

O efeito, medido no aluno de demonstracao da classe 32: o banco tem **9
atividades concluidas** de 12, e o app mostra **0 de 12**. O tempo de atividade
aparece como `0 min` pelo mesmo motivo. Nao ha como o cliente saber que uma
atividade foi feita: a informacao nunca chega ate' ele.

O dano nao parava na contagem. `Classe.updateTopicoProgress` calculava o
percentual do topico a partir dessas atividades -- que ele via como todas
pendentes -- e **gravava o resultado por cima** de `topico_aluno`, depois do
trigger. Era o quinto gravador do tipo que a `20260826_18` removeu, e ele nascia
errado porque a view nao lhe dava o dado. O gravador ja saiu do app; esta
migracao fecha a origem.

Colunas acrescentadas no fim (`CREATE OR REPLACE VIEW` so' permite acrescentar
no fim). `security_invoker` e' reafirmado de proposito: sem ele a view voltaria a
rodar como dona e ignorar o RLS das tabelas base.

Revision ID: 20260909_04
Revises: 20260909_03
Create Date: 2026-09-09
"""

from alembic import op

revision = "20260909_04"
down_revision = "20260909_03"
branch_labels = None
depends_on = None


COLUNAS_NOVAS = """
    aa.status AS atividade_status,
    aa.percentual_concluido AS atividade_percentual_concluido,
    aa.acertos_percentual AS atividade_acertos_percentual,
    aa.tempo_gasto_min AS atividade_tempo_gasto_min,
    aa.pontuacao_obtida AS atividade_pontuacao_obtida,
    aa.ultima_visualizacao AS atividade_ultima_visualizacao"""

JUNCAO_NOVA = """
     LEFT JOIN atividade_aluno aa ON aa.atividade_id = a.id AND aa.aluno_id = ta.aluno_id"""


def _view(com_atividade: bool) -> str:
    colunas = f",{COLUNAS_NOVAS}" if com_atividade else ""
    juncao = JUNCAO_NOVA if com_atividade else ""
    return f"""
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
    m.ordem AS midia_ordem{colunas}
   FROM topicos t
     JOIN topico_aluno ta ON ta.topico_id = t.id
     LEFT JOIN conteudos co ON co.topico_id = t.id
     LEFT JOIN conteudo_aluno ca2 ON ca2.conteudo_id = co.id AND ca2.aluno_id = ta.aluno_id
     LEFT JOIN atividades a ON a.topico_id = t.id
     LEFT JOIN atividade_conteudos ac ON ac.atividade_id = a.id AND ac.conteudo_id = co.id
     LEFT JOIN questoes q ON q.atividade_id = a.id
     LEFT JOIN midias m ON m.conteudo_id = co.id{juncao};

ALTER VIEW public.vw_aluno_classe_detalhado SET (security_invoker = on);
"""


def upgrade() -> None:
    op.execute(_view(com_atividade=True))


def downgrade() -> None:
    # `CREATE OR REPLACE` nao remove coluna; a view precisa cair antes de voltar
    # ao formato antigo.
    op.execute("DROP VIEW IF EXISTS public.vw_aluno_classe_detalhado")
    op.execute(_view(com_atividade=False))
