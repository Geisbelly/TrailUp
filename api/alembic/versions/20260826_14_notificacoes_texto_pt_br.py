"""corrige o texto das notificacoes: acentuacao pt-BR e promessa falsa da rotina

Dois defeitos meus, introduzidos em `20260826_04`, e os dois chegaram ao aluno.

1. TEXTO SEM ACENTO. Eu escrevi as mensagens em ASCII para fugir de problema de
   codificacao -- "Sua revisao de hoje", "Ha uma sugestao da IA esperando por
   voce na trilha.", "Voce ja estudou bastante hoje". Isso e texto de PRODUTO,
   lido pelo aluno na tela e no push, e o projeto exige pt-BR correto
   (CLAUDE.md: UTF-8 sem BOM, sempre). A migracao `20260826_11` ja tinha
   estabelecido a guarda para escrever acento com seguranca; e ela que uso
   aqui, em vez de fugir do problema.

2. PROMESSA FALSA. A rotina `revisao_diaria` e uma VERIFICACAO: se o
   `agente_notificacao` produziu alguma sugestao nas ultimas 48h, ela promove
   esse texto; se nao produziu, caia no texto fixo da rotina -- que afirmava
   "ha uma sugestao da IA esperando por voce". Ou seja: sem nenhuma sugestao no
   banco, o aluno recebia a notificacao dizendo que havia uma. Foi exatamente o
   que apareceu em producao as 19h.

   O texto fixo passa a ser um lembrete honesto, que nao menciona IA. Quando
   existe sugestao de verdade, o titulo e o corpo dela substituem esse texto de
   qualquer jeito -- entao a mencao a IA so aparece quando ha IA por tras.

Revision ID: 20260826_14
Revises: 20260826_13
Create Date: 2026-08-26
"""

from alembic import op

revision = "20260826_14"
down_revision = "20260826_13"
branch_labels = None
depends_on = None

# Textos de produto, em pt-BR correto. Ficam aqui em cima para a guarda de
# codificacao abaixo poder conferi-los antes de qualquer escrita.
TEXTOS = {
    "revisao_diaria": (
        "Sua revisão de hoje",
        # Sem mencionar IA: quando existe sugestão, ela substitui este texto.
        "Sua trilha continua de onde você parou.",
    ),
    "pausa_saudavel": (
        "Hora de uma pausa",
        "Você já estudou bastante hoje. Uma pausa curta ajuda a fixar.",
    ),
    "retomada_login": (
        "Bem-vindo de volta",
        "Continue de onde parou na sua trilha.",
    ),
}
CORPO_GENERICO = "Você tem novidades na sua trilha."


def upgrade() -> None:
    # Guarda de codificacao, mesmo padrao de `20260826_11`: se o arquivo chegar
    # com a codificacao errada, a migracao falha alto aqui em vez de gravar
    # mojibake que so aparece na tela do aluno.
    amostra = TEXTOS["revisao_diaria"][0]
    op.execute(
        f"""
        DO $$
        BEGIN
          IF position('ã' in '{amostra}') = 0 THEN
            RAISE EXCEPTION
              'Texto da notificacao chegou sem acento. O arquivo da migracao '
              'provavelmente foi lido com a codificacao errada (ver CLAUDE.md).';
          END IF;
        END $$
        """
    )

    # 1. Linhas ja criadas para os alunos.
    for tipo, (titulo, corpo) in TEXTOS.items():
        op.execute(
            f"""
            UPDATE notificacoes_agendamentos
               SET titulo = '{titulo}', corpo = '{corpo}', atualizado_em = now()
             WHERE tipo = '{tipo}'
            """
        )

    # 2. Pendentes ainda nao entregues carregam o texto antigo copiado.
    op.execute(
        f"""
        UPDATE notificacoes_pendentes
           SET titulo = '{TEXTOS["revisao_diaria"][0]}',
               corpo  = '{TEXTOS["revisao_diaria"][1]}',
               atualizado_em = now()
         WHERE status = 'pendente'
           AND tipo = 'revisao_diaria'
           AND sugestao_id IS NULL
        """
    )

    # 3. A funcao que cria as rotinas, para aluno novo nascer com o texto certo.
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION public.notificacoes_garantir_rotinas(
          p_aluno uuid, p_timezone text DEFAULT 'UTC'
        )
        RETURNS void LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public, pg_temp AS $fn$
        DECLARE
          v_tz   text := public.notificacoes_tz(p_timezone);
          v_hora smallint := public.notificacoes_cfg_int('rotina_diaria_hora', 19)::smallint;
          v_min  smallint := public.notificacoes_cfg_int('rotina_diaria_minuto', 0)::smallint;
        BEGIN
          -- `proxima_execucao` so e definida quando ainda NAO existe: um upsert
          -- disparado a cada login nao pode empurrar a rotina 24h para a frente
          -- toda vez que o aluno abre o app -- ela nunca dispararia.
          INSERT INTO notificacoes_agendamentos (
            aluno_id, tipo, recorrencia, gatilho, titulo, corpo,
            hora_local, minuto_local, timezone, prioridade, contexto,
            proxima_execucao, horario, ativo
          )
          VALUES (
            p_aluno, 'revisao_diaria', 'diaria', 'horario',
            '{TEXTOS["revisao_diaria"][0]}', '{TEXTOS["revisao_diaria"][1]}',
            v_hora, v_min, v_tz, 1, jsonb_build_object('motivo', 'revisao_diaria'),
            public.notificacoes_proxima_ocorrencia('diaria', now(), v_hora, v_min, v_tz),
            public.notificacoes_proxima_ocorrencia('diaria', now(), v_hora, v_min, v_tz),
            TRUE
          )
          ON CONFLICT (aluno_id, tipo) WHERE aluno_id IS NOT NULL DO UPDATE
            SET timezone = EXCLUDED.timezone,
                titulo = EXCLUDED.titulo,
                corpo = EXCLUDED.corpo,
                atualizado_em = now();

          INSERT INTO notificacoes_agendamentos (
            aluno_id, tipo, recorrencia, gatilho, titulo, corpo, timezone,
            prioridade, contexto, ativo
          )
          VALUES (
            p_aluno, 'pausa_saudavel', 'tempo_uso_diario', 'tempo_uso',
            '{TEXTOS["pausa_saudavel"][0]}', '{TEXTOS["pausa_saudavel"][1]}',
            v_tz, 0,
            jsonb_build_object('motivo', 'tempo_uso',
                               'limiar_min', public.notificacoes_cfg_int('tempo_uso_limiar_min', 25)),
            TRUE
          )
          ON CONFLICT (aluno_id, tipo) WHERE aluno_id IS NOT NULL DO UPDATE
            SET timezone = EXCLUDED.timezone,
                titulo = EXCLUDED.titulo,
                corpo = EXCLUDED.corpo,
                atualizado_em = now();

          INSERT INTO notificacoes_agendamentos (
            aluno_id, tipo, recorrencia, gatilho, titulo, corpo, timezone,
            prioridade, contexto, ativo
          )
          VALUES (
            p_aluno, 'retomada_login', 'login', 'login',
            '{TEXTOS["retomada_login"][0]}', '{TEXTOS["retomada_login"][1]}',
            v_tz, 0, jsonb_build_object('motivo', 'retomada'), TRUE
          )
          ON CONFLICT (aluno_id, tipo) WHERE aluno_id IS NOT NULL DO UPDATE
            SET timezone = EXCLUDED.timezone,
                titulo = EXCLUDED.titulo,
                corpo = EXCLUDED.corpo,
                atualizado_em = now();
        END;
        $fn$
        """
    )

    # 4. O corpo generico do despachante tambem estava sem acento.
    #
    # Recria a funcao trocando so essa string, em vez de reescrever o corpo
    # inteiro aqui: outra sessao pode ter alterado a logica dela, e colar uma
    # copia antiga desfaria esse trabalho em silencio. Mexer em `pg_proc.prosrc`
    # direto nao serviria -- alterar o catalogo nao recompila a funcao.
    op.execute(
        f"""
        DO $do$
        DECLARE
          v_src text;
        BEGIN
          SELECT p.prosrc INTO v_src
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'notificacoes_processar_rotinas';

          IF v_src IS NULL OR position('Voce tem novidades' in v_src) = 0 THEN
            RETURN;  -- ja corrigida, ou a funcao mudou de forma
          END IF;

          EXECUTE
            'CREATE OR REPLACE FUNCTION public.notificacoes_processar_rotinas('
            || 'p_aluno uuid, p_gatilho text, p_uso_seg integer DEFAULT 0) '
            || 'RETURNS integer LANGUAGE plpgsql SECURITY DEFINER '
            || 'SET search_path = public, pg_temp AS $corpo$'
            || replace(v_src,
                       'Voce tem novidades na sua trilha.',
                       '{CORPO_GENERICO}')
            || '$corpo$';
        END $do$
        """
    )


def downgrade() -> None:
    # O texto sem acento e a promessa falsa NAO sao restaurados: eram os bugs.
    op.execute(
        """
        DO $$
        BEGIN
          RAISE NOTICE
            'Downgrade nao restaura o texto sem acento nem a mensagem que prometia '
            'uma sugestao de IA inexistente. Os textos corrigidos permanecem.';
        END $$
        """
    )
