"""telemetria: RLS e views entram no Alembic, e a limpeza de classe vira CASCADE

Fecha A6 e #95 da revisao de telemetria de ponta a ponta. Os dois juntos porque
sao a mesma raiz: o RLS e os objetos de telemetria viviam FORA da cadeia
versionada, e foi por isso que a limpeza de classe pode ser um no-op silencioso
por meses sem ninguem notar.

## A6 -- o RLS nao era reproduzivel

As policies das quatro tabelas de telemetria existem no banco, mas vinham de
`frontend/supabase/migrations/20260413113000_fix_telemetria_rls.sql` -- fora do
Alembic, sem runner conhecido. Na cadeia Alembic:

  - `20260826_08` so troca o role de `public` para `authenticated` em policies
    que JA existiam;
  - `20260826_09` monta a posse por tabela, e a lista `DADO_DO_ALUNO` nao inclui
    nenhuma tabela de telemetria;
  - `20260826_10` cria so `_professor_sel`, e faz `ALTER VIEW IF EXISTS` sobre
    `vw_telemetria_tempo_*` -- views que nao existem em arquivo nenhum do
    repositorio.

Nenhuma delas dava `ENABLE ROW LEVEL SECURITY` nessas tabelas. Num ambiente
provisionado so pelo Alembic elas nascem SEM RLS, e o CLAUDE.md registra que RLS
e a unica barreira: qualquer aluno logado leria a telemetria de todos.

Esta migracao porta o SQL do frontend (era idempotente, reaplicar e seguro) e
versiona as tres views. Confirmado no banco de dev que as definicoes abaixo sao
as que estao em vigor, capturadas com `pg_get_viewdef`.

> Nota que vale registrar: as views sempre usaram `sum(dwell_sec)`, a soma
> direta. Era `trailup_tempo_telemetria_min` que somava incrementos -- duas
> leituras diferentes do mesmo dado no mesmo banco. A `20260830_01` alinhou a
> funcao com as views, e nao o contrario.

## 95 -- a limpeza de classe era um no-op silencioso

`deleteClasseCascade` chama `.delete()` em `telemetria_lotes` e
`telemetria_sessoes` antes de apagar a `classe`. Com RLS ligado e SEM policy de
DELETE, o PostgREST filtra todas as linhas: afeta ZERO linhas e nao retorna
erro. `tryDeleteEq` so registra quando ha `error`, entao a falha era invisivel.

Por que so `telemetria_sessoes` acumulava: das quatro tabelas, apenas
`telemetria_eventos_app` e `telemetria_time_metric_entries` tem FK para `classe`,
e as duas com ON DELETE CASCADE. Quando a classe morria, o banco limpava essas
duas e as outras duas ficavam. Medido: 299 sessoes orfas de 469, de 2026-04-20 a
2026-07-25 (ja removidas, com backup).

A correcao vai na raiz, e nao no cliente: `telemetria_sessoes` e
`telemetria_lotes` ganham a MESMA FK com CASCADE. A limpeza deixa de depender de
o cliente lembrar de faze-la, de ter permissao para isso, e de alguem notar
quando nao tem -- a mesma logica que `20260827_03` aplicou ao mover o
enfileiramento para o banco.

A policy de DELETE para o professor dono entra tambem, para que a limpeza
explicita que o console ja faz pare de ser enfeite. Aluno continua sem DELETE,
seguindo o que `20260826_09` decidiu para o dado do aluno.

Revision ID: 20260831_01
Revises: 20260830_01
Create Date: 2026-08-31
"""

from alembic import op

revision = "20260831_01"
down_revision = "20260830_01"
branch_labels = None
depends_on = None


TABELAS = (
    "telemetria_sessoes",
    "telemetria_lotes",
    "telemetria_eventos_app",
    "telemetria_time_metric_entries",
)

# Onde a FK para `classe` precisa nascer. As outras duas ja tem, com CASCADE.
SEM_FK_DE_CLASSE = ("telemetria_sessoes", "telemetria_lotes")

# `pg_get_viewdef` do banco de dev, com `security_invoker = on` explicito --
# "toda view nova nasce com security_invoker", e estas nasciam sem passar por
# aqui.
VIEWS = {
    "vw_telemetria_tempo_topico_aluno": """
        SELECT aluno_id,
               classe_id,
               topico_id,
               count(DISTINCT lote_id) AS total_lotes,
               sum(active_sec) AS tempo_ativo_seg,
               sum(idle_sec) AS tempo_ocioso_seg,
               sum(dwell_sec) AS tempo_total_seg,
               sum(touch_count) AS total_toques,
               sum(scroll_distance_px) AS scroll_px,
               max(captured_at) AS ultima_captura_em
          FROM telemetria_time_metric_entries
         WHERE scope = 'topic' AND topico_id IS NOT NULL
         GROUP BY aluno_id, classe_id, topico_id
    """,
    "vw_telemetria_tempo_conteudo_aluno": """
        SELECT aluno_id,
               classe_id,
               topico_id,
               conteudo_id,
               sum(active_sec) AS tempo_ativo_seg,
               sum(idle_sec) AS tempo_ocioso_seg,
               sum(dwell_sec) AS tempo_total_seg,
               sum(touch_count) AS total_toques,
               sum(scroll_distance_px) AS scroll_px,
               max(captured_at) AS ultima_captura_em
          FROM telemetria_time_metric_entries
         WHERE scope = 'content' AND conteudo_id IS NOT NULL
         GROUP BY aluno_id, classe_id, topico_id, conteudo_id
    """,
    "vw_telemetria_tempo_atividade_aluno": """
        SELECT aluno_id,
               classe_id,
               topico_id,
               atividade_id,
               sum(active_sec) AS tempo_ativo_seg,
               sum(idle_sec) AS tempo_ocioso_seg,
               sum(dwell_sec) AS tempo_total_seg,
               sum(touch_count) AS total_toques,
               sum(scroll_distance_px) AS scroll_px,
               max(captured_at) AS ultima_captura_em
          FROM telemetria_time_metric_entries
         WHERE scope = 'activity' AND atividade_id IS NOT NULL
         GROUP BY aluno_id, classe_id, topico_id, atividade_id
    """,
}


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. RLS ligado e declarado AQUI (A6)
    # ------------------------------------------------------------------
    for tabela in TABELAS:
        op.execute(
            f"""
            DO $$
            BEGIN
              IF to_regclass('public.{tabela}') IS NOT NULL THEN
                EXECUTE 'ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY';
              END IF;
            END $$
            """
        )

    # ------------------------------------------------------------------
    # 2. Posse: o aluno le e escreve o proprio; o professor le o dos alunos dele
    # ------------------------------------------------------------------
    # `DROP ... IF EXISTS` antes de criar, como `20260826_09`: determinístico e
    # idempotente, e reaplicar nao acumula policy duplicada.
    for tabela in TABELAS:
        op.execute(
            f"""
            DO $$
            BEGIN
              IF to_regclass('public.{tabela}') IS NULL THEN
                RETURN;
              END IF;

              EXECUTE 'DROP POLICY IF EXISTS {tabela}_select_own ON public.{tabela}';
              EXECUTE 'CREATE POLICY {tabela}_select_own ON public.{tabela} '
                   || 'FOR SELECT TO authenticated USING (aluno_id = auth.uid())';

              EXECUTE 'DROP POLICY IF EXISTS {tabela}_insert_own ON public.{tabela}';
              EXECUTE 'CREATE POLICY {tabela}_insert_own ON public.{tabela} '
                   || 'FOR INSERT TO authenticated WITH CHECK (aluno_id = auth.uid())';

              -- UPDATE so onde o cliente de fato atualiza: `telemetria_sessoes`
              -- fecha a sessao (`ended_at`) e `telemetria_eventos_app` reenvia
              -- evento pelo upsert de `client_event_id`. Lote e metrica sao
              -- append-only.
              IF '{tabela}' IN ('telemetria_sessoes', 'telemetria_eventos_app') THEN
                EXECUTE 'DROP POLICY IF EXISTS {tabela}_update_own ON public.{tabela}';
                EXECUTE 'CREATE POLICY {tabela}_update_own ON public.{tabela} '
                     || 'FOR UPDATE TO authenticated USING (aluno_id = auth.uid()) '
                     || 'WITH CHECK (aluno_id = auth.uid())';
              END IF;

              EXECUTE 'DROP POLICY IF EXISTS {tabela}_professor_sel ON public.{tabela}';
              EXECUTE 'CREATE POLICY {tabela}_professor_sel ON public.{tabela} '
                   || 'FOR SELECT TO authenticated '
                   || 'USING (aluno_id IN (SELECT public.app_alunos_do_professor()))';
            END $$
            """
        )

    # ------------------------------------------------------------------
    # 3. DELETE para o professor dono da classe (95)
    # ------------------------------------------------------------------
    # Sem isto o `.delete()` que o console ja chama afeta zero linhas e NAO
    # retorna erro -- a falha fica invisivel. O predicado e por classe, nao por
    # aluno: apagar a telemetria e consequencia de apagar a trilha da classe.
    #
    # Aluno continua sem DELETE, como `20260826_09` decidiu para o dado do aluno:
    # nada no app apaga a propria telemetria.
    for tabela in TABELAS:
        op.execute(
            f"""
            DO $$
            BEGIN
              IF to_regclass('public.{tabela}') IS NULL THEN
                RETURN;
              END IF;
              EXECUTE 'DROP POLICY IF EXISTS {tabela}_professor_del ON public.{tabela}';
              EXECUTE 'CREATE POLICY {tabela}_professor_del ON public.{tabela} '
                   || 'FOR DELETE TO authenticated '
                   || 'USING (classe_id IN (SELECT public.app_classes_do_professor()))';
            END $$
            """
        )

    # ------------------------------------------------------------------
    # 4. A raiz: FK com CASCADE, para a limpeza nao depender do cliente (95)
    # ------------------------------------------------------------------
    # Orfaos remanescentes primeiro: a FK nao pode ser criada com linha apontando
    # para classe inexistente. Sao linhas de uma classe que nao existe mais --
    # nao ha nada a preservar, e a partir daqui elas deixam de acontecer.
    for tabela in SEM_FK_DE_CLASSE:
        op.execute(
            f"""
            DELETE FROM {tabela} x
             WHERE x.classe_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM classe c WHERE c.id = x.classe_id)
            """
        )

    for tabela in SEM_FK_DE_CLASSE:
        op.execute(
            f"""
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                 WHERE conname = 'fk_{tabela}_classe'
                   AND conrelid = 'public.{tabela}'::regclass
              ) THEN
                EXECUTE 'ALTER TABLE public.{tabela} '
                     || 'ADD CONSTRAINT fk_{tabela}_classe '
                     || 'FOREIGN KEY (classe_id) REFERENCES classe(id) ON DELETE CASCADE';
              END IF;
            END $$
            """
        )

    # ------------------------------------------------------------------
    # 5. As views entram no versionamento (A6)
    # ------------------------------------------------------------------
    for nome, corpo in VIEWS.items():
        op.execute(f"CREATE OR REPLACE VIEW {nome} AS {corpo}")
        op.execute(f"ALTER VIEW {nome} SET (security_invoker = on)")
        op.execute(f"REVOKE ALL ON {nome} FROM anon")
        op.execute(f"GRANT SELECT ON {nome} TO authenticated")


def downgrade() -> None:
    # As FKs saem: sao o que esta migracao acrescenta de estrutura.
    for tabela in SEM_FK_DE_CLASSE:
        op.execute(
            f"ALTER TABLE public.{tabela} DROP CONSTRAINT IF EXISTS fk_{tabela}_classe"
        )

    # A policy de DELETE sai, e a limpeza do console volta a ser no-op.
    for tabela in TABELAS:
        op.execute(f"DROP POLICY IF EXISTS {tabela}_professor_del ON public.{tabela}")

    # RLS e as policies de posse FICAM ligados de proposito. Desliga-los aqui
    # abriria a telemetria de todos os alunos para qualquer autenticado, e um
    # downgrade nao deve criar um buraco de acesso -- as policies sao as mesmas
    # que o banco ja tinha antes desta migracao, vindas do SQL do frontend.
