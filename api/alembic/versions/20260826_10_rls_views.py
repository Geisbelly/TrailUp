"""views deixam de contornar o RLS; professor passa a ler a telemetria dos seus

Sem isto a posse por tabela de `20260826_09` seria cosmetica. Uma view criada
sem `security_invoker` executa com os privilegios do DONO (`postgres`), e o RLS
das tabelas base **nao se aplica**. Como `anon` tinha SELECT em todas as views,
dava para ler tudo por fora das policies.

Verificado ao vivo, como `anon` e DEPOIS de `20260826_08`: 3 linhas de
`vw_rank_posicoes_por_classe`, metricas de desempenho, telemetria por topico e
segmentos de perfil. Ou seja: fechar as tabelas nao tinha fechado o dado.

Tres tratamentos, porque as views nao sao todas iguais:

1. **Metricas e telemetria** (dashboards do professor) viram
   `security_invoker = on`. Para elas continuarem funcionando, o professor
   ganha SELECT na telemetria dos alunos das classes DELE — que e exatamente a
   posse que faltava: hoje ele nao tem policy nenhuma nessas tabelas e so
   enxergava por causa do bypass.

2. **Ranking** continua com bypass, de proposito: ele SOMA eventos de varios
   alunos, e um aluno nao pode (nem deve) ler `eventos_aluno` dos colegas linha
   a linha. Em vez disso a view e embrulhada num filtro pelas classes do
   chamador — mantem o agregado, corta o vizinho.

3. **GRANTs**: `anon` perde tudo, e `authenticated` perde INSERT/UPDATE/DELETE
   (view nao e para escrita; esses grants vieram do padrao do Supabase).

Revision ID: 20260826_10
Revises: 20260826_09
Create Date: 2026-08-26
"""

from alembic import op

revision = "20260826_10"
down_revision = "20260826_09"
branch_labels = None
depends_on = None

# Telemetria e logs: o aluno ja le o proprio (policies antigas). Falta o
# professor ler o dos alunos dele.
TABELAS_DO_PROFESSOR = [
    "telemetria_eventos_app",
    "telemetria_lotes",
    "telemetria_sessoes",
    "telemetria_time_metric_entries",
    "ia_decision_logs",
    "aluno_mental_state_history",
    "trilha_checkpoint_navegacao",
    "personalizacao_item_progresso",
]

# Passam a respeitar RLS.
VIEWS_INVOKER = [
    "vw_aluno_perfil_segmentos",
    "vw_ia_decision_logs_resumo",
    "vw_metricas_chat_aluno_classe",
    "vw_metricas_comportamento_aluno_classe",
    "vw_metricas_desempenho_aluno_classe",
    "vw_metricas_distribuicao_turma_classe",
    "vw_metricas_engajamento_aluno_classe",
    "vw_metricas_evolucao_desempenho_aluno_dia",
    "vw_metricas_sessoes_aluno_dia",
    "vw_metricas_turma_geral_classe",
    "vw_metricas_turma_perfil_classe",
    "vw_sequencia_navegacao_aluno",
    "vw_telemetria_tempo_atividade_aluno",
    "vw_telemetria_tempo_conteudo_aluno",
    "vw_telemetria_tempo_topico_aluno",
]

RANK_VIEW = "vw_rank_posicoes_por_classe"
RANK_BASE = "vw_rank_posicoes_por_classe_todas"


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Professor le a telemetria dos alunos DELE
    # ------------------------------------------------------------------
    for tabela in TABELAS_DO_PROFESSOR:
        op.execute(f"DROP POLICY IF EXISTS {tabela}_professor_sel ON {tabela}")
        op.execute(
            f"""
            DO $$
            BEGIN
              -- Só cria onde a tabela realmente tem `aluno_id`; a lista e
              -- mantida a mao e nao pode derrubar a migracao se uma tabela
              -- mudar de forma.
              IF EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='{tabela}'
                   AND column_name='aluno_id'
              ) THEN
                EXECUTE 'CREATE POLICY {tabela}_professor_sel ON {tabela} '
                     || 'FOR SELECT TO authenticated '
                     || 'USING (aluno_id IN (SELECT public.app_alunos_do_professor()))';
              END IF;
            END $$
            """
        )

    # ------------------------------------------------------------------
    # 2. Views passam a respeitar RLS
    # ------------------------------------------------------------------
    for view in VIEWS_INVOKER:
        op.execute(f"ALTER VIEW IF EXISTS {view} SET (security_invoker = on)")

    # ------------------------------------------------------------------
    # 3. Ranking: bypass deliberado, mas so das minhas classes
    # ------------------------------------------------------------------
    # O ranking SOMA eventos de varios alunos. Dar ao aluno SELECT em
    # `eventos_aluno` dos colegas para a view funcionar entregaria muito mais
    # do que uma posicao num placar — entregaria o historico deles. Entao a
    # view segue rodando como dona (agrega tudo) e o filtro acontece na saida.
    op.execute(
        f"""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='{RANK_BASE}'
          ) THEN
            ALTER VIEW {RANK_VIEW} RENAME TO {RANK_BASE};
          END IF;
        END $$
        """
    )
    op.execute(
        f"""
        CREATE OR REPLACE VIEW {RANK_VIEW} AS
          SELECT b.rank_id, b.classe_id, b.posicao, b.id_aluno, b.nome_aluno,
                 b.pontuacao, b.progresso, b.medalha
            FROM {RANK_BASE} b
           WHERE b.classe_id IN (SELECT public.app_minhas_classes())
        """
    )
    op.execute(f"REVOKE ALL ON {RANK_BASE} FROM anon, authenticated")
    op.execute(f"GRANT SELECT ON {RANK_VIEW} TO authenticated")

    # ------------------------------------------------------------------
    # 4. GRANTs das views
    # ------------------------------------------------------------------
    # View nao e superficie de escrita. INSERT/UPDATE/DELETE/TRUNCATE nelas
    # vieram do padrao do Supabase para o schema `public` e nunca fizeram
    # sentido aqui.
    op.execute(
        """
        DO $$
        DECLARE v record;
        BEGIN
          FOR v IN
            SELECT c.relname
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'v'
          LOOP
            EXECUTE 'REVOKE ALL ON public.' || quote_ident(v.relname)
                 || ' FROM anon';
            EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER '
                 || 'ON public.' || quote_ident(v.relname) || ' FROM authenticated';
            EXECUTE 'GRANT SELECT ON public.' || quote_ident(v.relname)
                 || ' TO authenticated';
          END LOOP;
        END $$
        """
    )
    # O base do ranking fica fora do alcance direto: so a view filtrada.
    op.execute(f"REVOKE ALL ON {RANK_BASE} FROM anon, authenticated")


def downgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='{RANK_BASE}'
          ) THEN
            DROP VIEW IF EXISTS {RANK_VIEW};
            ALTER VIEW {RANK_BASE} RENAME TO {RANK_VIEW};
          END IF;
        END $$
        """
    )
    for view in VIEWS_INVOKER:
        op.execute(f"ALTER VIEW IF EXISTS {view} SET (security_invoker = off)")
    for tabela in TABELAS_DO_PROFESSOR:
        op.execute(f"DROP POLICY IF EXISTS {tabela}_professor_sel ON {tabela}")
    # Os GRANTs de escrita para `anon` NAO sao restaurados: eram o buraco.
