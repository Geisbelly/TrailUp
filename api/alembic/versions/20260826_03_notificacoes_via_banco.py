"""notificacoes inteiramente no banco: fila, rotinas, RPC, RLS e push

As quatro tabelas de notificacao existiam e nenhuma funcionava de ponta a ponta:
`notificacoes_pendentes` e `notificacoes_ia` recebiam o MESMO conteudo e nunca
eram lidas, `notificacoes_agendamentos` nao tinha uma linha de codigo no
monorepo, e `notificacoes` so era escrita pelo proprio app.

Esta migracao poe o motor **dentro do Postgres**, seguindo a regra de fronteira
do projeto (ver CLAUDE.md): a API e para IA; o resto e via banco. Nao e estilo —
a API hiberna no free tier do Render, e um despachante hospedado nela para de
despachar justamente quando ninguem esta olhando. O banco nao hiberna.

Papeis, agora sem sobreposicao:

  notificacoes_ia            -> o que a IA SUGERIU (a API so insere aqui)
  notificacoes_pendentes     -> a FILA, com gatilho de entrega e expiracao
  notificacoes_agendamentos  -> a ROTINA recorrente que abastece a fila
  notificacoes               -> a CAIXA DE ENTRADA, so o que foi entregue

O mobile fala com tudo isso por RPC (`supabase.rpc(...)`), no mesmo caminho
autenticado que ele ja usa para ler `notificacoes`.

Seguranca: as policies existentes eram `USING (true)` para o role `public` em
SELECT/UPDATE/DELETE — qualquer portador da chave anon lia e apagava a
notificacao de QUALQUER aluno. Enquanto a escrita passava pela API isso ja era
ruim; com o mobile escrevendo direto, RLS **e** a autorizacao. As policies sao
refeitas por aluno.

Revision ID: 20260826_03
Revises: 20260826_02
Create Date: 2026-08-26
"""

from alembic import op

revision = "20260826_03"
down_revision = "20260826_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ==================================================================
    # 1. Configuracao — uma linha por parametro, nada espalhado por SQL
    # ==================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS notificacoes_config (
          chave      text        PRIMARY KEY,
          valor      text        NOT NULL,
          descricao  text        NULL,
          atualizado_em timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        INSERT INTO notificacoes_config (chave, valor, descricao) VALUES
          ('max_por_dia', '6',
           'Teto diario de notificacoes por aluno. Uma rotina mal configurada nao pode virar spam.'),
          ('janela_silencio_inicio', '22',
           'Hora LOCAL do aluno em que o push fica silencioso. A notificacao entra na caixa de entrada mesmo assim.'),
          ('janela_silencio_fim', '7',
           'Hora LOCAL em que o silencio termina.'),
          ('expiracao_padrao_horas', '48',
           'TTL da pendente. Entregar "volte a estudar hoje" tres dias depois e pior que nao entregar.'),
          ('tempo_uso_limiar_min', '25',
           'Limiar padrao (minutos de uso no dia) do gatilho tempo_uso.'),
          ('rotina_diaria_hora', '19',
           'Hora local padrao da rotina diaria de revisao.'),
          ('rotina_diaria_minuto', '0', 'Minuto local padrao da rotina diaria.'),
          ('sessao_ociosa_min', '15',
           'Sessao sem heartbeat por este tempo e considerada encerrada — o app pode ser morto pelo SO sem avisar.'),
          ('push_url', 'https://exp.host/--/api/v2/push/send',
           'Expo Push API. E o que entrega a notificacao pelo SO com o app FECHADO (FCM/APNs).'),
          ('push_access_token', '',
           'So necessario se o projeto Expo ativar "Enhanced Security" nas credenciais de push.'),
          ('push_timeout_ms', '15000', 'Timeout do POST para a Expo, em milissegundos.')
        ON CONFLICT (chave) DO NOTHING
        """
    )

    # ==================================================================
    # 2. Colunas de papel
    # ==================================================================
    op.execute(
        """
        ALTER TABLE notificacoes
          ADD COLUMN IF NOT EXISTS origem          text        NULL,
          ADD COLUMN IF NOT EXISTS origem_id       bigint      NULL,
          ADD COLUMN IF NOT EXISTS contexto        jsonb       NOT NULL DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS push_enviado_em timestamptz NULL,
          ADD COLUMN IF NOT EXISTS push_erro       text        NULL
        """
    )
    op.execute(
        """
        ALTER TABLE notificacoes_pendentes
          ADD COLUMN IF NOT EXISTS gatilho        text        NOT NULL DEFAULT 'horario',
          ADD COLUMN IF NOT EXISTS agendamento_id bigint      NULL,
          ADD COLUMN IF NOT EXISTS sugestao_id    bigint      NULL,
          ADD COLUMN IF NOT EXISTS notificacao_id bigint      NULL,
          ADD COLUMN IF NOT EXISTS entregue_em    timestamptz NULL,
          ADD COLUMN IF NOT EXISTS expira_em      timestamptz NULL,
          -- Por que a pendente NAO virou notificacao (teto diario, cancelada).
          -- Sem isso, uma supressao e indistinguivel de um bug: a linha some da
          -- fila e ninguem sabe dizer se foi decisao ou falha.
          ADD COLUMN IF NOT EXISTS ultimo_erro    text        NULL,
          ADD COLUMN IF NOT EXISTS dedupe_key     text        NULL,
          ADD COLUMN IF NOT EXISTS atualizado_em  timestamptz NOT NULL DEFAULT now()
        """
    )
    op.execute(
        """
        ALTER TABLE notificacoes_ia
          ADD COLUMN IF NOT EXISTS status       text        NOT NULL DEFAULT 'sugerida',
          ADD COLUMN IF NOT EXISTS origem       text        NOT NULL DEFAULT 'ciclo',
          ADD COLUMN IF NOT EXISTS prioridade   integer     NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS motivo       text        NULL,
          ADD COLUMN IF NOT EXISTS promovida_em timestamptz NULL,
          ADD COLUMN IF NOT EXISTS pendente_id  bigint      NULL
        """
    )
    op.execute(
        """
        ALTER TABLE notificacoes_agendamentos
          ADD COLUMN IF NOT EXISTS titulo           text        NULL,
          ADD COLUMN IF NOT EXISTS corpo            text        NULL,
          ADD COLUMN IF NOT EXISTS gatilho          text        NOT NULL DEFAULT 'horario',
          ADD COLUMN IF NOT EXISTS prioridade       integer     NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS hora_local       smallint    NULL,
          ADD COLUMN IF NOT EXISTS minuto_local     smallint    NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS timezone         text        NOT NULL DEFAULT 'UTC',
          ADD COLUMN IF NOT EXISTS proxima_execucao timestamptz NULL,
          ADD COLUMN IF NOT EXISTS ultima_execucao  timestamptz NULL,
          ADD COLUMN IF NOT EXISTS execucoes        integer     NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS atualizado_em    timestamptz NOT NULL DEFAULT now()
        """
    )
    op.execute("UPDATE notificacoes_agendamentos SET recorrencia = 'diaria' WHERE recorrencia IS NULL")
    op.execute("ALTER TABLE notificacoes_agendamentos ALTER COLUMN recorrencia SET DEFAULT 'diaria'")
    op.execute("ALTER TABLE notificacoes_agendamentos ALTER COLUMN recorrencia SET NOT NULL")

    for tabela in ("notificacoes_pendentes", "notificacoes_agendamentos"):
        op.execute(f"ALTER TABLE {tabela} DROP CONSTRAINT IF EXISTS {tabela}_gatilho_check")
        op.execute(
            f"""
            ALTER TABLE {tabela}
              ADD CONSTRAINT {tabela}_gatilho_check
              CHECK (gatilho IN ('horario', 'login', 'tempo_uso'))
            """
        )
    op.execute(
        "ALTER TABLE notificacoes_pendentes DROP CONSTRAINT IF EXISTS notificacoes_pendentes_status_check"
    )
    op.execute(
        """
        ALTER TABLE notificacoes_pendentes
          ADD CONSTRAINT notificacoes_pendentes_status_check
          CHECK (status IN ('pendente', 'entregue', 'expirada', 'cancelada', 'suprimida'))
        """
    )
    op.execute("ALTER TABLE notificacoes_ia DROP CONSTRAINT IF EXISTS notificacoes_ia_status_check")
    op.execute(
        """
        ALTER TABLE notificacoes_ia
          ADD CONSTRAINT notificacoes_ia_status_check
          CHECK (status IN ('sugerida', 'promovida', 'suprimida'))
        """
    )

    # ==================================================================
    # 3. Indices
    # ==================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS notificacoes_aluno_horario_idx
          ON notificacoes (aluno_id, horario_envio DESC)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS notificacoes_pendentes_claim_idx
          ON notificacoes_pendentes (aluno_id, gatilho, prioridade DESC, horario)
          WHERE status = 'pendente'
        """
    )
    # O dedupe NAO filtra por status de proposito: filtrando so 'pendente', a
    # linha sairia do indice ao ser entregue e a mesma rotina passaria de novo
    # na varredura seguinte. Como a chave carrega o dia, "unico por (aluno,
    # chave)" significa "uma vez por dia por motivo", que e a semantica querida.
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_pendentes_dedupe_uidx
          ON notificacoes_pendentes (aluno_id, dedupe_key)
          WHERE dedupe_key IS NOT NULL
        """
    )
    # A coluna sempre prometeu dedupe e nunca entregou (nao havia indice).
    op.execute(
        """
        DELETE FROM notificacoes_ia a USING notificacoes_ia b
         WHERE a.resposta_hash IS NOT NULL
           AND a.resposta_hash = b.resposta_hash
           AND a.id < b.id
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_ia_resposta_hash_uidx
          ON notificacoes_ia (resposta_hash) WHERE resposta_hash IS NOT NULL
        """
    )
    op.execute(
        """
        DELETE FROM notificacoes_agendamentos a USING notificacoes_agendamentos b
         WHERE a.aluno_id IS NOT NULL AND a.aluno_id = b.aluno_id
           AND a.tipo = b.tipo AND a.id < b.id
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_agendamentos_aluno_tipo_uidx
          ON notificacoes_agendamentos (aluno_id, tipo) WHERE aluno_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS notificacoes_agendamentos_due_idx
          ON notificacoes_agendamentos (proxima_execucao) WHERE ativo
        """
    )

    # ==================================================================
    # 4. Tabelas novas
    # ==================================================================
    # Sem token de aparelho nao existe push do SO. O conflito e no TOKEN e nao
    # em (aluno, token): num aparelho compartilhado o token e o mesmo e precisa
    # MUDAR de dono, senao o aluno anterior segue recebendo push no celular do
    # colega.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS notificacoes_dispositivos (
          id                  bigserial   PRIMARY KEY,
          aluno_id            uuid        NOT NULL,
          push_token          text        NOT NULL,
          plataforma          text        NOT NULL DEFAULT 'desconhecida',
          device_id           text        NULL,
          app_version         text        NULL,
          timezone            text        NOT NULL DEFAULT 'UTC',
          ativo               boolean     NOT NULL DEFAULT TRUE,
          desativado_motivo   text        NULL,
          ultima_atividade_em timestamptz NOT NULL DEFAULT now(),
          criado_em           timestamptz NOT NULL DEFAULT now(),
          atualizado_em       timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_dispositivos_token_uidx
          ON notificacoes_dispositivos (push_token)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS notificacoes_dispositivos_aluno_idx
          ON notificacoes_dispositivos (aluno_id) WHERE ativo
        """
    )

    # Duas tabelas de atividade porque as perguntas sao diferentes:
    # "quando logou" (append-only) e "quanto usou hoje" (O(1)). Derivar a
    # segunda de `telemetria_lotes` daria a resposta errada — telemetria e por
    # material aberto, e quem navegou meia hora sem abrir material apareceria
    # com uso zero.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS aluno_sessoes_app (
          id            bigserial   PRIMARY KEY,
          aluno_id      uuid        NOT NULL,
          origem        text        NOT NULL DEFAULT 'login',
          plataforma    text        NOT NULL DEFAULT 'desconhecida',
          device_id     text        NULL,
          timezone      text        NOT NULL DEFAULT 'UTC',
          iniciada_em   timestamptz NOT NULL DEFAULT now(),
          encerrada_em  timestamptz NULL,
          duracao_seg   integer     NOT NULL DEFAULT 0,
          atualizado_em timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS aluno_sessoes_app_abertas_idx
          ON aluno_sessoes_app (aluno_id, iniciada_em DESC) WHERE encerrada_em IS NULL
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS aluno_atividade_diaria (
          id                 bigserial   PRIMARY KEY,
          aluno_id           uuid        NOT NULL,
          dia                date        NOT NULL,
          timezone           text        NOT NULL DEFAULT 'UTC',
          tempo_uso_seg      integer     NOT NULL DEFAULT 0,
          aberturas          integer     NOT NULL DEFAULT 0,
          notificacoes_dia   integer     NOT NULL DEFAULT 0,
          primeiro_acesso_em timestamptz NULL,
          ultimo_acesso_em   timestamptz NULL,
          atualizado_em      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS aluno_atividade_diaria_uidx
          ON aluno_atividade_diaria (aluno_id, dia)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS aluno_atividade_diaria")
    op.execute("DROP TABLE IF EXISTS aluno_sessoes_app")
    op.execute("DROP TABLE IF EXISTS notificacoes_dispositivos")
    op.execute("DROP TABLE IF EXISTS notificacoes_config")

    op.execute("DROP INDEX IF EXISTS notificacoes_agendamentos_due_idx")
    op.execute("DROP INDEX IF EXISTS notificacoes_agendamentos_aluno_tipo_uidx")
    op.execute("DROP INDEX IF EXISTS notificacoes_ia_resposta_hash_uidx")
    op.execute("DROP INDEX IF EXISTS notificacoes_pendentes_dedupe_uidx")
    op.execute("DROP INDEX IF EXISTS notificacoes_pendentes_claim_idx")
    op.execute("DROP INDEX IF EXISTS notificacoes_aluno_horario_idx")

    op.execute(
        "ALTER TABLE notificacoes_ia DROP CONSTRAINT IF EXISTS notificacoes_ia_status_check"
    )
    op.execute(
        """
        ALTER TABLE notificacoes_pendentes
          DROP CONSTRAINT IF EXISTS notificacoes_pendentes_status_check,
          DROP CONSTRAINT IF EXISTS notificacoes_pendentes_gatilho_check
        """
    )
    op.execute(
        """
        ALTER TABLE notificacoes_agendamentos
          DROP CONSTRAINT IF EXISTS notificacoes_agendamentos_gatilho_check
        """
    )

    op.execute(
        """
        ALTER TABLE notificacoes_agendamentos
          DROP COLUMN IF EXISTS titulo, DROP COLUMN IF EXISTS corpo,
          DROP COLUMN IF EXISTS gatilho, DROP COLUMN IF EXISTS prioridade,
          DROP COLUMN IF EXISTS hora_local, DROP COLUMN IF EXISTS minuto_local,
          DROP COLUMN IF EXISTS timezone, DROP COLUMN IF EXISTS proxima_execucao,
          DROP COLUMN IF EXISTS ultima_execucao, DROP COLUMN IF EXISTS execucoes,
          DROP COLUMN IF EXISTS atualizado_em
        """
    )
    op.execute(
        """
        ALTER TABLE notificacoes_ia
          DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS origem,
          DROP COLUMN IF EXISTS prioridade, DROP COLUMN IF EXISTS motivo,
          DROP COLUMN IF EXISTS promovida_em, DROP COLUMN IF EXISTS pendente_id
        """
    )
    op.execute(
        """
        ALTER TABLE notificacoes_pendentes
          DROP COLUMN IF EXISTS gatilho, DROP COLUMN IF EXISTS agendamento_id,
          DROP COLUMN IF EXISTS sugestao_id, DROP COLUMN IF EXISTS notificacao_id,
          DROP COLUMN IF EXISTS entregue_em, DROP COLUMN IF EXISTS expira_em,
          DROP COLUMN IF EXISTS ultimo_erro, DROP COLUMN IF EXISTS dedupe_key,
          DROP COLUMN IF EXISTS atualizado_em
        """
    )
    op.execute(
        """
        ALTER TABLE notificacoes
          DROP COLUMN IF EXISTS origem, DROP COLUMN IF EXISTS origem_id,
          DROP COLUMN IF EXISTS contexto, DROP COLUMN IF EXISTS push_enviado_em,
          DROP COLUMN IF EXISTS push_erro
        """
    )
