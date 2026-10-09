"""guarda a MEDIDA do perfil BrainHex, nao so' o resultado dela

Hoje `aluno_perfil` guarda `(aluno, perfil, afinidade)` -- o resultado. A ordem
que o aluno declarou no bloco ipsativo, a confianca da medida e a concordancia
entre os dois metodos se perdem no caminho.

Isso impede exatamente o que a issue #1 quer na fase 3: comparar o que o aluno
DISSE preferir com o que ele FAZ no app. Sem guardar o prior nao ha' com o que
comparar, e a atualizacao bayesiana nao tem de onde partir.

Tabela de MEDIDA, nao de estado: append-only, uma linha por vez que o
questionario e' respondido. `aluno_perfil` continua sendo o estado atual e seu
contrato nao muda -- todo o sistema le dali.

RETENCAO DECLARADA NA PROPRIA MIGRACAO. A issue #195 (LGPD) pede: "dado uma
tabela nova de dado de aluno, quando ela e' criada, entao a migracao ja' vem com
a janela de retencao definida". Esta e' a primeira tabela do repositorio a
cumprir isso, e serve de molde.

Janela: 2 anos a partir da resposta. O racional e' o ciclo academico -- a medida
serve para comparar prior com comportamento ao longo do uso, e perde valor
quando o aluno ja' nao esta' mais na turma. `expira_em` e' coluna de verdade, e
nao comentario: da' para consultar quanto falta, e o expurgo e' uma funcao que
qualquer um pode ler.

Revision ID: 20261003_02
Revises: 20261002_03

Era 20261002_01 parenteada em 20260930_01. Entre a escrita e a reaplicacao, as
correcoes de seguranca (#318, #319) entraram na main e levaram a cabeca para
20261002_03. Manter o parent antigo criaria DUAS CABECAS -- o estado que derruba
`alembic upgrade head` e, com DATABASE_MIGRATIONS_ON_STARTUP ligado, impede a
API de subir (ver #303/#308). Reparenteada no fim da cadeia atual.

Segunda reparentagem (2026-10-06): o PR #322 tambem declarava
`down_revision = 20261002_03`. Os dois passavam o teste de cabeca unica
ISOLADAMENTE -- e mesclados dariam duas cabecas na main, derrubando a API no
boot pelo mesmo caminho descrito acima. Agora a cadeia e
20261002_03 -> 20261003_01 (#322) -> 20261003_02 (este), e o branch do #322
esta mesclado aqui para o parent resolver.
Create Date: 2026-10-02
"""

from alembic import op

revision = "20261003_02"
down_revision = "20261003_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.aluno_perfil_medida (
          id                  bigserial PRIMARY KEY,
          aluno_id            uuid        NOT NULL,
          versao_instrumento  text        NOT NULL,
          respondido_em       timestamptz NOT NULL DEFAULT now(),
          -- Os 7 perfis na ordem declarada: posicao 1 = o que mais move.
          ordenacao           text[]      NOT NULL,
          -- Afinidade por perfil no momento da medida (o prior).
          afinidade           jsonb       NOT NULL,
          -- 0..1. Qualidade da resposta x concordancia entre os dois metodos.
          confianca           numeric(4,3) NOT NULL,
          -- Correlacao de postos entre escala e ordenacao: -1..1.
          concordancia        numeric(4,3),
          -- Indice, desvio, aquiescencia e MOTIVOS escritos, para a confianca
          -- ser auditavel depois em vez de ser um numero sem procedencia.
          qualidade           jsonb        NOT NULL DEFAULT '{}'::jsonb,
          expira_em           timestamptz  NOT NULL
                              DEFAULT (now() + interval '2 years'),
          CONSTRAINT aluno_perfil_medida_ordenacao_chk
            CHECK (array_length(ordenacao, 1) = 7),
          CONSTRAINT aluno_perfil_medida_confianca_chk
            CHECK (confianca >= 0 AND confianca <= 1),
          CONSTRAINT aluno_perfil_medida_concordancia_chk
            CHECK (concordancia IS NULL OR (concordancia >= -1 AND concordancia <= 1))
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_aluno_perfil_medida_aluno "
        "ON public.aluno_perfil_medida (aluno_id, respondido_em DESC)"
    )
    # Indice para o expurgo nao varrer a tabela inteira a cada passada.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_aluno_perfil_medida_expira "
        "ON public.aluno_perfil_medida (expira_em)"
    )

    op.execute("ALTER TABLE public.aluno_perfil_medida ENABLE ROW LEVEL SECURITY")

    # Mesma forma das policies de `aluno_perfil`: o aluno ve o proprio dado, e o
    # professor ve o dos alunos das classes dele. Usa o helper SECURITY DEFINER
    # em vez de repetir o EXISTS, como manda o CLAUDE.md.
    op.execute("DROP POLICY IF EXISTS aluno_perfil_medida_sel ON public.aluno_perfil_medida")
    op.execute(
        """
        CREATE POLICY aluno_perfil_medida_sel ON public.aluno_perfil_medida
          FOR SELECT TO authenticated
          USING (
            aluno_id = auth.uid()
            OR aluno_id IN (SELECT app_alunos_do_professor())
          )
        """
    )
    # INSERT so' do proprio aluno: a medida e' a resposta DELE ao questionario.
    op.execute("DROP POLICY IF EXISTS aluno_perfil_medida_ins ON public.aluno_perfil_medida")
    op.execute(
        """
        CREATE POLICY aluno_perfil_medida_ins ON public.aluno_perfil_medida
          FOR INSERT TO authenticated
          WITH CHECK (aluno_id = auth.uid())
        """
    )
    # Sem UPDATE e sem DELETE de proposito: append-only. Corrigir uma medida e'
    # responder de novo, o que gera outra linha e preserva o historico.
    op.execute(
        "GRANT SELECT, INSERT ON public.aluno_perfil_medida TO authenticated"
    )
    op.execute(
        "GRANT USAGE, SELECT ON SEQUENCE public.aluno_perfil_medida_id_seq TO authenticated"
    )

    # Expurgo: funcao legivel, nao comentario. Devolve quantas linhas apagou
    # para dar para medir se o job esta' mesmo rodando.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.trailup_expurgar_medidas_de_perfil()
        RETURNS integer
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $$
        DECLARE
          v_apagadas integer;
        BEGIN
          DELETE FROM public.aluno_perfil_medida WHERE expira_em <= now();
          GET DIAGNOSTICS v_apagadas = ROW_COUNT;
          RETURN v_apagadas;
        END;
        $$
        """
    )
    op.execute(
        "REVOKE EXECUTE ON FUNCTION public.trailup_expurgar_medidas_de_perfil() "
        "FROM PUBLIC, anon, authenticated"
    )

    # Agenda diaria, se o pg_cron existir neste ambiente. Guardado porque o
    # banco local de teste nao tem a extensao, e a migracao nao pode depender
    # dela para rodar.
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
            PERFORM cron.unschedule('trailup_expurgo_medidas_perfil')
              WHERE EXISTS (
                SELECT 1 FROM cron.job WHERE jobname = 'trailup_expurgo_medidas_perfil'
              );
            PERFORM cron.schedule(
              'trailup_expurgo_medidas_perfil',
              '17 3 * * *',
              'SELECT public.trailup_expurgar_medidas_de_perfil()'
            );
          END IF;
        END $$
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
            PERFORM cron.unschedule('trailup_expurgo_medidas_perfil')
              WHERE EXISTS (
                SELECT 1 FROM cron.job WHERE jobname = 'trailup_expurgo_medidas_perfil'
              );
          END IF;
        END $$
        """
    )
    op.execute("DROP FUNCTION IF EXISTS public.trailup_expurgar_medidas_de_perfil()")
    op.execute("DROP TABLE IF EXISTS public.aluno_perfil_medida")
