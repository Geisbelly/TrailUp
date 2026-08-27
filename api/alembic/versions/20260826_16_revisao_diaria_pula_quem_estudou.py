"""rotina diaria nao avisa quem ja estudou hoje, quando a IA nao tem nada a dizer

Fecha a issue #40.

A rotina `revisao_diaria` disparava no horario configurado sem olhar se o aluno
ja tinha usado o app naquele dia. Mandar "sua revisao de hoje" as 19h para quem
estudou as 18h e ruido -- e ruido corroi a confianca no canal, o mesmo motivo
pelo qual a pendente expira em vez de ser entregue atrasada.

A guarda e condicional de proposito: ela so pula quando **a IA nao tem nada**.
Se o `agente_notificacao` produziu uma sugestao nas ultimas 48h, ela vale a
notificacao mesmo para quem ja estudou -- o conteudo e novo, nao e lembrete.

Detalhe de plpgsql que decide a implementacao: `FOUND` reflete o ULTIMO comando
SQL executado. Consultar o uso do dia entre o `SELECT ... INTO v_sug` e o teste
sobrescreveria esse `FOUND`, e a rotina passaria a se comportar pelo resultado
da consulta errada. Por isso o resultado da busca por sugestao e capturado em
`v_tem_sugestao` imediatamente, e e essa variavel que decide dali em diante.

A funcao e alterada por substituicao no proprio corpo (mesma tecnica de
`20260826_14`), e nao recolada por inteiro: outra sessao pode ter mexido na
logica, e uma copia antiga desfaria esse trabalho em silencio.

O dado ja existe e ja e mantido: `aluno_atividade_diaria.tempo_uso_seg`,
alimentada pelo heartbeat.

Revision ID: 20260826_16
Revises: 20260826_15
Create Date: 2026-08-27
"""

from alembic import op

revision = "20260826_16"
down_revision = "20260826_15"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Limiar em configuracao, nao fixo na funcao — mesma regra do resto do motor.
    op.execute(
        """
        INSERT INTO notificacoes_config (chave, valor, descricao) VALUES
          ('revisao_pular_se_uso_min', '10',
           'Minutos de uso no dia a partir dos quais a rotina de revisao diaria e '
           'pulada, QUANDO a IA nao tem sugestao pendente. Zero desliga a guarda.')
        ON CONFLICT (chave) DO NOTHING
        """
    )

    op.execute(
        """
        DO $do$
        DECLARE
          v_src text;
          v_novo text;
        BEGIN
          SELECT p.prosrc INTO v_src
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'notificacoes_processar_rotinas';

          IF v_src IS NULL THEN
            RAISE EXCEPTION 'notificacoes_processar_rotinas nao encontrada';
          END IF;

          IF position('v_tem_sugestao' in v_src) > 0 THEN
            RETURN;  -- ja aplicada
          END IF;

          -- 1. declara a variavel que guarda o resultado da busca por sugestao
          v_novo := replace(
            v_src,
            '  v_sug_id   bigint;',
            '  v_sug_id   bigint;' || chr(10) ||
            '  v_tem_sugestao boolean;'
          );

          -- 2. captura FOUND na hora e insere a guarda antes de usar a sugestao
          v_novo := replace(
            v_novo,
            '       LIMIT 1;' || chr(10) || chr(10) || '      IF FOUND THEN',
            '       LIMIT 1;' || chr(10) ||
            '      -- FOUND reflete o ULTIMO comando SQL: capturar aqui, antes de' || chr(10) ||
            '      -- consultar o uso do dia, senao o teste abaixo olharia a consulta errada.' || chr(10) ||
            '      v_tem_sugestao := FOUND;' || chr(10) || chr(10) ||
            '      -- Ja estudou hoje E a IA nao tem nada a dizer: nao ha o que' || chr(10) ||
            '      -- lembrar, e insistir vira ruido. Com sugestao da IA a' || chr(10) ||
            '      -- notificacao vale mesmo para quem estudou, porque e conteudo' || chr(10) ||
            '      -- novo e nao lembrete.' || chr(10) ||
            '      IF NOT v_tem_sugestao' || chr(10) ||
            '         AND public.notificacoes_cfg_int(''revisao_pular_se_uso_min'', 10) > 0' || chr(10) ||
            '         AND COALESCE((SELECT a.tempo_uso_seg FROM aluno_atividade_diaria a' || chr(10) ||
            '                        WHERE a.aluno_id = p_aluno' || chr(10) ||
            '                          AND a.dia = public.notificacoes_dia_local(v_reg.timezone)), 0)' || chr(10) ||
            '             >= public.notificacoes_cfg_int(''revisao_pular_se_uso_min'', 10) * 60 THEN' || chr(10) ||
            '        CONTINUE;' || chr(10) ||
            '      END IF;' || chr(10) || chr(10) ||
            '      IF v_tem_sugestao THEN'
          );

          IF v_novo = v_src THEN
            RAISE EXCEPTION
              'Nao encontrei o ponto de insercao em notificacoes_processar_rotinas. '
              'A funcao mudou de forma; reveja a migracao antes de aplicar.';
          END IF;

          EXECUTE
            'CREATE OR REPLACE FUNCTION public.notificacoes_processar_rotinas('
            || 'p_aluno uuid, p_gatilho text, p_uso_seg integer DEFAULT 0) '
            || 'RETURNS integer LANGUAGE plpgsql SECURITY DEFINER '
            || 'SET search_path = public, pg_temp AS $corpo$' || v_novo || '$corpo$';
        END $do$
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM notificacoes_config WHERE chave = 'revisao_pular_se_uso_min'")
    op.execute(
        """
        DO $do$
        DECLARE v_src text; v_novo text;
        BEGIN
          SELECT p.prosrc INTO v_src FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname='public' AND p.proname='notificacoes_processar_rotinas';
          IF v_src IS NULL OR position('v_tem_sugestao' in v_src) = 0 THEN
            RETURN;
          END IF;
          -- Desfaz so a guarda, devolvendo o teste direto por FOUND.
          v_novo := regexp_replace(
            v_src,
            E'      -- FOUND reflete.*?      IF v_tem_sugestao THEN',
            E'      IF FOUND THEN',
            'ns'
          );
          v_novo := replace(v_novo, E'  v_tem_sugestao boolean;\\n', '');
          EXECUTE
            'CREATE OR REPLACE FUNCTION public.notificacoes_processar_rotinas('
            || 'p_aluno uuid, p_gatilho text, p_uso_seg integer DEFAULT 0) '
            || 'RETURNS integer LANGUAGE plpgsql SECURITY DEFINER '
            || 'SET search_path = public, pg_temp AS $corpo$' || v_novo || '$corpo$';
        END $do$
        """
    )
