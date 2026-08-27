"""separa conquistas comuns das conquistas exclusivas de cada perfil BrainHex

Revision ID: 20260826_12
Revises: 20260826_11
Create Date: 2026-08-26
"""

from alembic import op

revision = "20260826_12"
down_revision = "20260826_11"
branch_labels = None
depends_on = None


PROFILE_ACHIEVEMENTS = r"""
WITH catalogo(nome, descricao, categoria, tipo, criterio, pontos_recompensa, perfil_alvo) AS (
  VALUES
    ('Primeiras Pegadas', 'Visitou três tópicos diferentes e começou a mapear a trilha.', 'perfil_brainhex', 'brainhex_seeker_primeiras_pegadas', '{"visitados": 3, "resumo": "Visite 3 tópicos diferentes."}'::jsonb, 15, 'seeker'),
    ('Cartógrafo Curioso', 'Explorou cinco tópicos diferentes em busca de novos caminhos.', 'perfil_brainhex', 'brainhex_seeker_cartografo', '{"visitados": 5, "resumo": "Visite 5 tópicos diferentes."}'::jsonb, 25, 'seeker'),
    ('Horizonte Completo', 'Conheceu todos os tópicos disponíveis em uma trilha.', 'perfil_brainhex', 'brainhex_seeker_horizonte', '{"visitados": "todos", "resumo": "Visite todos os tópicos de uma trilha."}'::jsonb, 45, 'seeker'),

    ('Colecionador de Marcos', 'Concluiu cinco atividades e ampliou sua coleção de resultados.', 'perfil_brainhex', 'brainhex_achiever_colecionador', '{"minimo": 5, "resumo": "Conclua 5 atividades."}'::jsonb, 20, 'achiever'),
    ('Sequência de Ouro', 'Concluiu dez atividades mantendo o avanço constante.', 'perfil_brainhex', 'brainhex_achiever_sequencia', '{"minimo": 10, "resumo": "Conclua 10 atividades."}'::jsonb, 35, 'achiever'),
    ('Mestre da Conclusão', 'Levou uma trilha inteira até cem por cento.', 'perfil_brainhex', 'brainhex_achiever_mestre', '{"percentual": 100, "resumo": "Complete 100% de uma trilha."}'::jsonb, 50, 'achiever'),

    ('Retorno Firme', 'Voltou a estudar por três dias seguidos.', 'perfil_brainhex', 'brainhex_survivor_retorno', '{"dias_seguidos": 3, "resumo": "Estude por 3 dias seguidos."}'::jsonb, 15, 'survivor'),
    ('Resiliente', 'Manteve uma sequência de sete dias de estudo.', 'perfil_brainhex', 'brainhex_survivor_resiliente', '{"dias_seguidos": 7, "resumo": "Estude por 7 dias seguidos."}'::jsonb, 35, 'survivor'),
    ('Longa Jornada', 'Acumulou trezentos minutos de estudo ativo.', 'perfil_brainhex', 'brainhex_survivor_jornada', '{"minutos": 300, "resumo": "Acumule 300 minutos de estudo ativo."}'::jsonb, 50, 'survivor'),

    ('Arrancada', 'Concluiu uma atividade em ritmo acelerado.', 'perfil_brainhex', 'brainhex_daredevil_arrancada', '{"max_tempo": 2, "resumo": "Conclua uma atividade em menos de 2 minutos."}'::jsonb, 20, 'daredevil'),
    ('Ritmo Intenso', 'Repetiu cinco conclusões rápidas sem perder o impulso.', 'perfil_brainhex', 'brainhex_daredevil_ritmo', '{"minimo": 5, "max_tempo": 3, "resumo": "Conclua 5 atividades em até 3 minutos cada."}'::jsonb, 35, 'daredevil'),
    ('Sem Freio', 'Concluiu dez atividades rápidas ao longo da jornada.', 'perfil_brainhex', 'brainhex_daredevil_sem_freio', '{"minimo": 10, "max_tempo": 3, "resumo": "Conclua 10 atividades em até 3 minutos cada."}'::jsonb, 50, 'daredevil'),

    ('Estrategista', 'Alcançou alto desempenho em uma atividade.', 'perfil_brainhex', 'brainhex_mastermind_estrategista', '{"percentual": 90, "resumo": "Alcance pelo menos 90% em uma atividade."}'::jsonb, 20, 'mastermind'),
    ('Analista Persistente', 'Revisou cinco atividades para consolidar o aprendizado.', 'perfil_brainhex', 'brainhex_mastermind_analista', '{"minimo": 5, "evento": "atividade_revisada", "resumo": "Revise 5 atividades."}'::jsonb, 35, 'mastermind'),
    ('Plano Magistral', 'Concluiu uma trilha com desempenho de excelência.', 'perfil_brainhex', 'brainhex_mastermind_plano', '{"percentual": 100, "resumo": "Conclua uma trilha com todas as etapas realizadas."}'::jsonb, 50, 'mastermind'),

    ('Primeiro Território', 'Concluiu o primeiro tópico da campanha.', 'perfil_brainhex', 'brainhex_conqueror_territorio', '{"minimo": 1, "evento": "topico_concluido", "resumo": "Conclua 1 tópico."}'::jsonb, 15, 'conqueror'),
    ('Domínio Crescente', 'Concluiu cinco tópicos e ampliou seu domínio.', 'perfil_brainhex', 'brainhex_conqueror_dominio', '{"minimo": 5, "evento": "topico_concluido", "resumo": "Conclua 5 tópicos."}'::jsonb, 35, 'conqueror'),
    ('Soberania', 'Dominou uma trilha completa.', 'perfil_brainhex', 'brainhex_conqueror_soberania', '{"percentual": 100, "resumo": "Complete 100% de uma trilha."}'::jsonb, 50, 'conqueror'),

    ('Presença Marcante', 'Participou da jornada por três dias seguidos.', 'perfil_brainhex', 'brainhex_socializer_presenca', '{"dias_seguidos": 3, "resumo": "Use a plataforma por 3 dias seguidos."}'::jsonb, 15, 'socializer'),
    ('Companheiro de Jornada', 'Manteve presença ativa por cinco dias seguidos.', 'perfil_brainhex', 'brainhex_socializer_companheiro', '{"dias_seguidos": 5, "resumo": "Use a plataforma por 5 dias seguidos."}'::jsonb, 30, 'socializer'),
    ('Elo Duradouro', 'Construiu uma sequência de dez dias de participação.', 'perfil_brainhex', 'brainhex_socializer_elo', '{"dias_seguidos": 10, "resumo": "Use a plataforma por 10 dias seguidos."}'::jsonb, 50, 'socializer')
)
INSERT INTO conquistas (
  nome, descricao, categoria, tipo, criterio, pontos_recompensa, escopo, perfil_alvo
)
SELECT c.nome, c.descricao, c.categoria, c.tipo, c.criterio,
       c.pontos_recompensa, 'perfil', c.perfil_alvo
  FROM catalogo c
 WHERE NOT EXISTS (
   SELECT 1 FROM conquistas existente
    WHERE existente.tipo = c.tipo
      AND existente.perfil_alvo = c.perfil_alvo
 );
"""


def upgrade() -> None:
    op.execute("ALTER TABLE conquistas ADD COLUMN IF NOT EXISTS escopo text")
    op.execute("ALTER TABLE conquistas ADD COLUMN IF NOT EXISTS perfil_alvo text")
    op.execute("UPDATE conquistas SET escopo = 'comum' WHERE escopo IS NULL")
    op.execute("ALTER TABLE conquistas ALTER COLUMN escopo SET DEFAULT 'comum'")
    op.execute("ALTER TABLE conquistas ALTER COLUMN escopo SET NOT NULL")

    op.execute(
        r"""
        ALTER TABLE conquistas DROP CONSTRAINT IF EXISTS conquistas_escopo_check;
        ALTER TABLE conquistas ADD CONSTRAINT conquistas_escopo_check
          CHECK (escopo IN ('comum', 'perfil'));
        ALTER TABLE conquistas DROP CONSTRAINT IF EXISTS conquistas_perfil_alvo_check;
        ALTER TABLE conquistas ADD CONSTRAINT conquistas_perfil_alvo_check
          CHECK (
            (escopo = 'comum' AND perfil_alvo IS NULL)
            OR
            (escopo = 'perfil' AND perfil_alvo IN (
              'seeker', 'achiever', 'survivor', 'daredevil',
              'mastermind', 'conqueror', 'socializer'
            ))
          );
        """
    )

    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS conquistas_tipo_comum_uq
          ON conquistas (tipo) WHERE escopo = 'comum';
        CREATE UNIQUE INDEX IF NOT EXISTS conquistas_tipo_perfil_uq
          ON conquistas (perfil_alvo, tipo) WHERE escopo = 'perfil';
        """
    )
    op.execute(PROFILE_ACHIEVEMENTS)


def downgrade() -> None:
    op.execute(
        r"""
        DELETE FROM conquistas_aluno
         WHERE conquista_id IN (
           SELECT id FROM conquistas WHERE tipo LIKE 'brainhex\_%' ESCAPE '\'
         );
        DELETE FROM conquistas WHERE tipo LIKE 'brainhex\_%' ESCAPE '\';
        DROP INDEX IF EXISTS conquistas_tipo_perfil_uq;
        DROP INDEX IF EXISTS conquistas_tipo_comum_uq;
        ALTER TABLE conquistas DROP CONSTRAINT IF EXISTS conquistas_perfil_alvo_check;
        ALTER TABLE conquistas DROP CONSTRAINT IF EXISTS conquistas_escopo_check;
        ALTER TABLE conquistas DROP COLUMN IF EXISTS perfil_alvo;
        ALTER TABLE conquistas DROP COLUMN IF EXISTS escopo;
        """
    )
