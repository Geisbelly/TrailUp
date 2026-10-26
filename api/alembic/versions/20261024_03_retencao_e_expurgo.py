"""Retencao e expurgo de dado pessoal (#195, itens 1 e 2)

O que faltava da #195 depois do consentimento (`20261024_02`): nada no banco
dizia por quanto tempo cada dado de aluno vive. Os unicos expurgos eram o de
`ia_decision_logs` (`20261003_09`), o de `aluno_perfil_medida` (`20261003_02`)
e o dos checkpoints (loop da API). O resto crescia para sempre.

## O que esta migracao cria

1. `retencao_politica` -- UMA linha por (tabela, acao) com dado de pessoa: o
   prazo, a coluna de tempo e o motivo. Tabela sem linha aqui nao passa no CI
   (`tests/test_retencao_politica.py`), que e o item (2) da issue.
2. `trailup_retencao(p_aplicar)` -- o job (pg_cron `trailup_retencao`, 03:23
   UTC). **Nasce em `simular`**: conta o que apagaria, grava em
   `retencao_execucoes` e nao apaga nada. So apaga com
   `app_config.retencao_modo = 'aplicar'`.
3. Prazos (decisao de 2026-10-24):

   | dado | todos | quem consentiu pesquisa |
   |---|---|---|
   | telemetria bruta (payload dos lotes, eventos do app) | 90 dias | 180 dias |
   | telemetria derivada (lotes, sessoes, metricas de tempo, estudo) | 13 meses (395 d) | 24 meses (730 d) |
   | inferencia emocional (`aluno_mental_state_history`) | 30 dias | 30 dias |
   | prova minima de consentimento depois da conta apagada | 5 anos | 5 anos |
   | conta inativa | 24 meses, aviso, +30 dias | igual |
   | saida da turma: conteudo gerado | +90 dias | igual |
   | saida da turma: notas, moedas, ranking | +365 dias | igual |

   "Quem consentiu pesquisa" e `aluno_finalidade_permitida(aluno, 'pesquisa')`
   no momento da varredura: revogou, o prazo longo cai na proxima.
4. Metricas de tempo sao **agregadas por turma/topico/dia** em
   `telemetria_agregado_turma_dia` (sem aluno) antes de sair.
5. `classe_aluno_saidas` -- registro de saida da turma. Sair continua sendo
   DELETE em `classe_aluno` (app e console nao mudam); um trigger anota a
   saida, e voltar para a turma apaga a anotacao.
6. Prova de consentimento sobrevive a conta: as tres tabelas de consentimento
   passam a `ON DELETE SET NULL`. Quando o aluno some, um trigger guarda so o
   hash do id (`titular_hash`), carimba `anonimizado_em` e apaga nome do
   responsavel e `origem`. A data de nascimento (`aluno_nascimento`) continua
   `CASCADE`: sai com a conta.
7. `retencao_fila_externa` -- o que mora fora do Postgres (R2, Storage, OpenAI,
   usuario do Auth). Triggers enfileiram; o worker da API
   (`app/services/retencao_externa.py`, desligado por padrao) apaga.
8. Chaves estrangeiras: as que estavam NO ACTION/RESTRICT para `alunos`
   impediam apagar a conta (e portanto qualquer expurgo); viram CASCADE ou
   SET NULL. As colunas `aluno_id` sem FK ganham FK `NOT VALID` + VALIDATE
   (fica NOT VALID se achar orfao, com WARNING; em 2026-10-24 eram 0).

Nada aqui foi aplicado em producao.

Revision ID: 20261024_03
Revises: 20261024_02
Create Date: 2026-10-24
"""

from __future__ import annotations

from alembic import op

revision = "20261024_03"
down_revision = "20261024_02"
branch_labels = None
depends_on = None

_JOB = "trailup_retencao"

DIAS_BRUTA = 90
DIAS_BRUTA_PESQUISA = 180
DIAS_DERIVADA = 395  # 13 meses
DIAS_DERIVADA_PESQUISA = 730  # 24 meses
DIAS_INFERENCIA = 30
DIAS_PROVA = 1826  # 5 anos
DIAS_SAIDA_CONTEUDO = 90
DIAS_SAIDA_HISTORICO = 365
DIAS_CONTA_INATIVA = 730
DIAS_AVISO = 30

CONSENTIMENTOS = ("consentimento_telemetria", "consentimento_responsavel", "consentimento_pesquisa")

# (tabela, coluna, tabela_ref, acao). Todas para a PK `id` da referencia.
# NO ACTION/RESTRICT viram CASCADE ou SET NULL; colunas sem FK ganham uma.
FKS: tuple[tuple[str, str, str, str], ...] = (
    # Telemetria: a conta apaga tudo; o lote sai com a sessao.
    ("telemetria_sessoes", "aluno_id", "alunos", "CASCADE"),
    ("telemetria_lotes", "aluno_id", "alunos", "CASCADE"),
    ("telemetria_lotes", "sessao_id", "telemetria_sessoes", "CASCADE"),
    ("aluno_mental_state_history", "aluno_id", "alunos", "CASCADE"),
    # Personalizacao e conteudo gerado.
    ("materiais_gerados", "aluno_id", "alunos", "CASCADE"),
    ("conteudo_personalizado", "aluno_id", "alunos", "CASCADE"),
    ("cards_personalizados", "aluno_id", "alunos", "CASCADE"),
    ("fontes_personalizacao", "aluno_id", "alunos", "CASCADE"),
    ("fontes_personalizacao", "professor_id", "professor", "SET NULL"),
    ("personalizacao_percurso", "aluno_id", "alunos", "CASCADE"),
    ("bag_itens", "aluno_id", "alunos", "CASCADE"),
    # Social e guildas: quem bloqueou/criou sai, o registro dos outros fica.
    ("social_relacionamentos", "blocked_by_id", "alunos", "SET NULL"),
    ("guildas", "criado_por", "alunos", "SET NULL"),
    # A tentativa paga com item da loja nao segura a compra.
    ("atividade_tentativa", "compra_id", "loja_compras", "SET NULL"),
    # Colunas aluno_id que nunca tiveram FK.
    ("aluno_atividade_diaria", "aluno_id", "alunos", "CASCADE"),
    ("aluno_sessoes_app", "aluno_id", "alunos", "CASCADE"),
    ("aluno_perfil_medida", "aluno_id", "alunos", "CASCADE"),
    ("aluno_topico_dominio", "aluno_id", "alunos", "CASCADE"),
    ("intervencoes", "aluno_id", "alunos", "CASCADE"),
    ("professor_intervencoes_passo", "aluno_id", "alunos", "CASCADE"),
    ("missao_aluno", "aluno_id", "alunos", "CASCADE"),
    ("personalizacao_sugestao", "aluno_id", "alunos", "CASCADE"),
    ("personalizacao_sugestao_log", "aluno_id", "alunos", "CASCADE"),
    ("notificacoes_push_envios", "aluno_id", "alunos", "CASCADE"),
    ("rag_chunks", "aluno_id", "alunos", "CASCADE"),
    ("rag_openai_files", "aluno_id", "alunos", "CASCADE"),
    ("rank_podio_congelado", "aluno_id", "alunos", "CASCADE"),
    ("ranqueada_elo", "aluno_id", "alunos", "CASCADE"),
    ("ranqueada_elo_partida", "aluno_id", "alunos", "CASCADE"),
    ("eventos_classe_resultado", "aluno_id", "alunos", "CASCADE"),
    ("economia_auditoria", "aluno_id", "alunos", "SET NULL"),
    # Prova de consentimento: sobrevive a conta (ver trigger de anonimizacao).
    ("consentimento_telemetria", "aluno_id", "alunos", "SET NULL"),
    ("consentimento_responsavel", "aluno_id", "alunos", "SET NULL"),
    ("consentimento_pesquisa", "aluno_id", "alunos", "SET NULL"),
)

# Politicas. ordem: redigir antes de apagar, filhas antes das maes.
# (tabela, acao, coluna_tempo, dias, dias_pesquisa, filtro, ajuste, ordem, categoria, motivo)
_P = tuple[str, str, str | None, int | None, int | None, str | None, str | None, int, str, str]
POLITICAS: tuple[_P, ...] = (
    # --- telemetria bruta
    (
        "telemetria_lotes",
        "redigir",
        "created_at",
        DIAS_BRUTA,
        DIAS_BRUTA_PESQUISA,
        "NOT (t.payload ? 'redigido_em')",
        "payload = jsonb_build_object('redigido_em', now()), analysis_error = NULL",
        10,
        "telemetria_bruta",
        "payload bruto (e ponteiro do R2) sai; colunas estruturadas ficam",
    ),
    (
        "telemetria_eventos_app",
        "apagar",
        "created_at",
        DIAS_BRUTA,
        DIAS_BRUTA_PESQUISA,
        None,
        None,
        20,
        "telemetria_bruta",
        "eventos crus do app",
    ),
    # --- telemetria derivada
    (
        "telemetria_time_metric_entries",
        "agregar_e_apagar",
        "created_at",
        DIAS_DERIVADA,
        DIAS_DERIVADA_PESQUISA,
        None,
        None,
        30,
        "telemetria_derivada",
        "agregada por turma/topico/dia, sem aluno, antes de sair",
    ),
    (
        "telemetria_lotes",
        "apagar",
        "created_at",
        DIAS_DERIVADA,
        DIAS_DERIVADA_PESQUISA,
        None,
        None,
        40,
        "telemetria_derivada",
        "metricas estruturadas do lote",
    ),
    (
        "telemetria_sessoes",
        "apagar",
        "created_at",
        DIAS_DERIVADA,
        DIAS_DERIVADA_PESQUISA,
        None,
        None,
        50,
        "telemetria_derivada",
        "sessao de estudo; lotes e eventos saem junto",
    ),
    (
        "estudo_sessoes",
        "apagar",
        "criado_em",
        DIAS_DERIVADA,
        DIAS_DERIVADA_PESQUISA,
        None,
        None,
        60,
        "telemetria_derivada",
        "tempo de estudo por item",
    ),
    (
        "estudo_intervalos",
        "apagar",
        "criado_em",
        DIAS_DERIVADA,
        DIAS_DERIVADA_PESQUISA,
        None,
        None,
        60,
        "telemetria_derivada",
        "intervalos de estudo",
    ),
    (
        "aluno_atividade_diaria",
        "apagar",
        "atualizado_em",
        DIAS_DERIVADA,
        DIAS_DERIVADA_PESQUISA,
        None,
        None,
        60,
        "telemetria_derivada",
        "uso diario do app",
    ),
    # --- inferencia emocional
    (
        "aluno_mental_state_history",
        "apagar",
        "created_at",
        DIAS_INFERENCIA,
        None,
        None,
        None,
        70,
        "inferencia_emocional",
        "inferencia emocional: 30 dias para todos",
    ),
    # --- dispositivo e envio
    (
        "aluno_sessoes_app",
        "apagar",
        "iniciada_em",
        180,
        None,
        None,
        None,
        80,
        "dispositivo",
        "sessao do app com device_id",
    ),
    (
        "expo_tokens",
        "apagar",
        "atualizado_em",
        60,
        None,
        "t.ativo IS FALSE",
        None,
        80,
        "dispositivo",
        "token de push desativado",
    ),
    (
        "notificacoes_push_envios",
        "apagar",
        "criado_em",
        180,
        None,
        None,
        None,
        80,
        "dispositivo",
        "recibo de envio de push",
    ),
    ("notificacoes", "apagar", "created_at", 90, None, None, None, 85, "notificacao", "caixa de notificacoes do aluno"),
    (
        "notificacoes_pendentes",
        "apagar",
        "atualizado_em",
        90,
        None,
        None,
        None,
        85,
        "notificacao",
        "fila do motor de notificacoes",
    ),
    (
        "notificacoes_ia",
        "apagar",
        "created_at",
        90,
        None,
        None,
        None,
        85,
        "notificacao",
        "sugestoes de notificacao da IA",
    ),
    # --- alertas pedagogicos
    (
        "intervencoes",
        "apagar",
        "created_at",
        365,
        None,
        None,
        None,
        90,
        "alerta_pedagogico",
        "alerta para o professor; vale o ano letivo",
    ),
    (
        "professor_intervencoes_passo",
        "apagar",
        "created_at",
        365,
        None,
        None,
        None,
        90,
        "alerta_pedagogico",
        "passo de intervencao do professor",
    ),
    # --- conversas
    ("guilda_mensagens", "apagar", "created_at", 365, None, None, None, 95, "conversa", "chat da guilda"),
    ("social_mensagens", "apagar", "created_at", 365, None, None, None, 95, "conversa", "mensagem direta entre alunos"),
    (
        "guilda_convites",
        "apagar",
        "created_at",
        180,
        None,
        None,
        None,
        95,
        "conversa",
        "convite de guilda (respondido ou nao)",
    ),
    # --- jobs
    (
        "personalizacao_jobs",
        "apagar",
        "finished_at",
        180,
        None,
        "t.finished_at IS NOT NULL",
        None,
        100,
        "operacional",
        "job terminado; targets saem junto (CASCADE)",
    ),
    # --- direitos do titular
    ("contato_envios", "apagar", "criado_em", 365, None, None, None, 110, "direitos_titular", "registro de contato"),
    (
        "solicitacoes_exclusao",
        "apagar",
        "created_at",
        DIAS_PROVA,
        None,
        None,
        None,
        110,
        "direitos_titular",
        "prova de que o pedido de exclusao foi atendido",
    ),
    (
        "consentimento_telemetria",
        "apagar",
        "anonimizado_em",
        DIAS_PROVA,
        None,
        "t.aluno_id IS NULL",
        None,
        120,
        "prova_consentimento",
        "prova minima depois da conta apagada",
    ),
    (
        "consentimento_responsavel",
        "apagar",
        "anonimizado_em",
        DIAS_PROVA,
        None,
        "t.aluno_id IS NULL",
        None,
        120,
        "prova_consentimento",
        "prova minima depois da conta apagada",
    ),
    (
        "consentimento_pesquisa",
        "apagar",
        "anonimizado_em",
        DIAS_PROVA,
        None,
        "t.aluno_id IS NULL",
        None,
        120,
        "prova_consentimento",
        "prova minima depois da conta apagada",
    ),
    # --- saida da turma: conteudo gerado (+90 dias)
    *(
        (
            t,
            "saida_turma",
            None,
            DIAS_SAIDA_CONTEUDO,
            None,
            None,
            None,
            130,
            "saida_turma",
            "conteudo gerado para o aluno naquela turma",
        )
        for t in (
            "conteudo_personalizado",
            "cards_personalizados",
            "personalizacao_item_progresso",
            "personalizacao_percurso",
            "personalizacao_sugestao",
            "personalizacao_sugestao_log",
            "bag_itens",
            "trilha_checkpoint_navegacao",
        )
    ),
    # --- saida da turma: notas, moedas, ranking (+365 dias)
    *(
        (
            t,
            "saida_turma",
            None,
            DIAS_SAIDA_HISTORICO,
            None,
            None,
            None,
            140,
            "saida_turma",
            "historico do aluno naquela turma; vale o ano letivo",
        )
        for t in (
            "atividade_aprovacao",
            "loja_uso_log",
            "loja_compras",
            "moedas_ledger",
            "eventos_aluno",
            "ranqueada_elo_partida",
            "ranqueada_elo",
            "rank_podio_congelado",
            "guilda_evento_snapshot",
            "trilha_aluno",
            "economia_auditoria",
            "guilda_membros",
        )
    ),
    (
        "classe_aluno_saidas",
        "apagar",
        "saiu_em",
        400,
        None,
        None,
        None,
        150,
        "saida_turma",
        "o registro de saida vive mais que a maior janela de saida",
    ),
    # --- tratadas em outro lugar
    (
        "ia_decision_logs",
        "dedicada",
        None,
        None,
        None,
        None,
        None,
        0,
        "ia",
        "job trailup_retencao_ia_decision_logs (20261003_09): redige 90 d, apaga 365 d",
    ),
    (
        "aluno_perfil_medida",
        "dedicada",
        None,
        None,
        None,
        None,
        None,
        0,
        "inferencia",
        "job trailup_expurgo_medidas_perfil (20261003_02): expira_em de 2 anos",
    ),
    (
        "checkpoints",
        "dedicada",
        None,
        None,
        None,
        None,
        None,
        0,
        "ia",
        "loop checkpoint_retention da API (3 dias); thread_id carrega o aluno",
    ),
    ("checkpoint_writes", "dedicada", None, None, None, None, None, 0, "ia", "idem checkpoints"),
    ("checkpoint_blobs", "dedicada", None, None, None, None, None, 0, "ia", "idem checkpoints"),
    (
        "personalizacao_job_targets",
        "dedicada",
        None,
        None,
        None,
        None,
        None,
        0,
        "operacional",
        "sai com personalizacao_jobs (CASCADE)",
    ),
    (
        "retencao_avisos_inatividade",
        "dedicada",
        None,
        None,
        None,
        None,
        None,
        0,
        "conta",
        "passo de conta inativa do proprio trailup_retencao",
    ),
    (
        "retencao_fila_externa",
        "dedicada",
        None,
        None,
        None,
        None,
        None,
        0,
        "conta",
        "trailup_retencao apaga o processado ha mais de retencao_fila_dias",
    ),
    # --- vida da conta: saem com a conta (CASCADE de alunos/auth.users)
    *(
        (
            t,
            "vida_da_conta",
            None,
            None,
            None,
            None,
            None,
            0,
            "vida_da_conta",
            "dado de uso do produto enquanto a conta existe; sai com ela",
        )
        for t in (
            "alunos",
            "aluno_perfil",
            "aluno_nascimento",
            "aluno_topico_dominio",
            "atividade_aluno",
            "atividade_prazo_aluno",
            "atividade_tempo_aluno",
            "atividade_tentativa",
            "classe_aluno",
            "conquistas_aluno",
            "conteudo_aluno",
            "desafio_participantes",
            "eventos_classe_resultado",
            "guilda_desafio_respostas",
            "loja_dica_liberada",
            "loja_formato_escolhido",
            "missao_aluno",
            "notificacoes_agendamentos",
            "professor_aluno",
            "questao_aluno",
            "questao_gabarito_revelado",
            "topico_aluno",
            "social_relacionamentos",
            "materiais_gerados",
            "fontes_personalizacao",
            "rag_chunks",
            "rag_openai_files",
            "iaDescricao",
            "professor",
            "classe",
            "plataforma_dev",
            "guildas",
            "guilda_desafios",
        )
    ),
)


def _q(valor: object) -> str:
    if valor is None:
        return "NULL"
    if isinstance(valor, int):
        return str(valor)
    return "'" + str(valor).replace("'", "''") + "'"


def _nome_fk(tabela: str, coluna: str) -> str:
    nome = f"{tabela}_{coluna}_fkey"
    if len(nome) > 63:
        nome = f"fk_{tabela[:40]}_{coluna}"[:63]
    return nome


def _sql_fk(tabela: str, coluna: str, ref: str, acao: str) -> str:
    nome = _nome_fk(tabela, coluna)
    solta_not_null = (
        f"EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', '{tabela}', '{coluna}');"
        if acao == "SET NULL"
        else ""
    )
    return f"""
DO $fk$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.{tabela}') IS NULL OR to_regclass('public.{ref}') IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = '{coluna}'
     WHERE c.conrelid = 'public.{tabela}'::regclass
       AND c.contype = 'f'
       AND c.confrelid = 'public.{ref}'::regclass
       AND c.conkey = ARRAY[a.attnum]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', '{tabela}', r.conname);
  END LOOP;
  {solta_not_null}
  EXECUTE format(
    'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I (id) ON DELETE {acao} NOT VALID',
    '{tabela}', '{nome}', '{coluna}', '{ref}');
  BEGIN
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', '{tabela}', '{nome}');
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE WARNING USING MESSAGE = format('%s fica NOT VALID: ha linha orfa', '{nome}');
  END;
END $fk$
"""


TABELAS_SQL = """
CREATE TABLE IF NOT EXISTS public.retencao_politica (
  tabela        text NOT NULL,
  acao          text NOT NULL,
  coluna_tempo  text,
  coluna_aluno  text NOT NULL DEFAULT 'aluno_id',
  dias          integer,
  dias_pesquisa integer,
  filtro        text,
  ajuste        text,
  ordem         integer NOT NULL DEFAULT 0,
  ativo         boolean NOT NULL DEFAULT true,
  categoria     text NOT NULL,
  motivo        text NOT NULL,
  revisado_em   date NOT NULL DEFAULT current_date,
  PRIMARY KEY (tabela, acao),
  CONSTRAINT retencao_politica_acao_chk CHECK (acao IN
    ('apagar', 'redigir', 'agregar_e_apagar', 'saida_turma', 'vida_da_conta', 'dedicada')),
  CONSTRAINT retencao_politica_nomes_chk CHECK (
    tabela ~ '^[A-Za-z_][A-Za-z0-9_]*$'
    AND coluna_aluno ~ '^[a-z_][a-z0-9_]*$'
    AND (coluna_tempo IS NULL OR coluna_tempo ~ '^[a-z_][a-z0-9_]*$')),
  CONSTRAINT retencao_politica_prazo_chk CHECK (
    CASE WHEN acao IN ('apagar', 'redigir', 'agregar_e_apagar')
           THEN coluna_tempo IS NOT NULL AND dias > 0
         WHEN acao = 'saida_turma' THEN dias > 0
         ELSE dias IS NULL END
    AND (dias_pesquisa IS NULL OR dias_pesquisa >= dias)),
  CONSTRAINT retencao_politica_ajuste_chk CHECK ((acao = 'redigir') = (ajuste IS NOT NULL)),
  -- filtro e ajuste viram SQL dinamico: uma instrucao so, sem comentario.
  CONSTRAINT retencao_politica_sql_chk CHECK (
    coalesce(filtro, '') !~ '(;|--|/\\*)' AND coalesce(ajuste, '') !~ '(;|--|/\\*)'),
  CONSTRAINT retencao_politica_agregar_chk CHECK (
    acao <> 'agregar_e_apagar' OR tabela = 'telemetria_time_metric_entries')
);
COMMENT ON TABLE public.retencao_politica IS
  'Prazo de retencao de cada tabela com dado de pessoa (#195). Tabela nova sem linha aqui reprova no CI.';

CREATE TABLE IF NOT EXISTS public.retencao_execucoes (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  modo         text NOT NULL CHECK (modo IN ('simular', 'aplicar')),
  iniciado_em  timestamptz NOT NULL,
  terminado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  resultado    jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.retencao_fila_externa (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  destino              text NOT NULL CHECK (destino IN ('r2', 'storage', 'openai', 'auth_user')),
  bucket               text NOT NULL DEFAULT '',
  caminho              text NOT NULL CHECK (length(caminho) BETWEEN 1 AND 1024),
  ref                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  tentativas           integer NOT NULL DEFAULT 0,
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  processado_em        timestamptz,
  resultado            text,
  ultimo_erro          text,
  CONSTRAINT retencao_fila_externa_objeto_uq UNIQUE (destino, bucket, caminho)
);
CREATE INDEX IF NOT EXISTS retencao_fila_externa_pendentes_idx
  ON public.retencao_fila_externa (proxima_tentativa_em) WHERE processado_em IS NULL;

CREATE TABLE IF NOT EXISTS public.retencao_avisos_inatividade (
  aluno_id                uuid PRIMARY KEY REFERENCES public.alunos (id) ON DELETE CASCADE,
  ultimo_acesso_em        timestamptz,
  avisado_em              timestamptz NOT NULL DEFAULT now(),
  exclusao_enfileirada_em timestamptz
);

CREATE TABLE IF NOT EXISTS public.classe_aluno_saidas (
  classe_id bigint NOT NULL,
  aluno_id  uuid NOT NULL,
  entrou_em timestamptz,
  saiu_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (classe_id, aluno_id)
);
COMMENT ON TABLE public.classe_aluno_saidas IS
  'Quando o aluno saiu da turma (DELETE em classe_aluno). Base do prazo de saida da retencao (#195).';

CREATE TABLE IF NOT EXISTS public.telemetria_agregado_turma_dia (
  classe_id  bigint NOT NULL,
  topico_id  bigint,
  scope      text NOT NULL,
  dia        date NOT NULL,
  entradas   bigint NOT NULL DEFAULT 0,
  visits     bigint NOT NULL DEFAULT 0,
  dwell_sec  numeric NOT NULL DEFAULT 0,
  active_sec numeric NOT NULL DEFAULT 0,
  idle_sec   numeric NOT NULL DEFAULT 0,
  touch_count bigint NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS telemetria_agregado_turma_dia_uq
  ON public.telemetria_agregado_turma_dia (classe_id, (coalesce(topico_id, 0)), scope, dia);
COMMENT ON TABLE public.telemetria_agregado_turma_dia IS
  'Metricas de tempo agregadas por turma/topico/dia, sem aluno, antes do expurgo (#195).';

CREATE INDEX IF NOT EXISTS telemetria_lotes_created_at_idx ON public.telemetria_lotes (created_at);
CREATE INDEX IF NOT EXISTS telemetria_eventos_app_created_at_idx ON public.telemetria_eventos_app (created_at);
CREATE INDEX IF NOT EXISTS telemetria_time_metric_entries_created_at_idx
  ON public.telemetria_time_metric_entries (created_at);
CREATE INDEX IF NOT EXISTS telemetria_sessoes_created_at_idx ON public.telemetria_sessoes (created_at);
CREATE INDEX IF NOT EXISTS aluno_mental_state_history_created_at_idx
  ON public.aluno_mental_state_history (created_at);
CREATE INDEX IF NOT EXISTS telemetria_lotes_r2_idx
  ON public.telemetria_lotes ((payload ->> '_r2')) WHERE payload ? '_r2';
"""

_INTERNAS = (
    "retencao_politica",
    "retencao_execucoes",
    "retencao_fila_externa",
    "retencao_avisos_inatividade",
    "classe_aluno_saidas",
    "telemetria_agregado_turma_dia",
)

ACL_TABELAS_SQL = "".join(
    f"""
ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.{t} FROM PUBLIC, anon, authenticated;
"""
    for t in _INTERNAS
)

CONFIG_SQL = f"""
INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('retencao_modo', 'simular',
   'simular: trailup_retencao so conta. aplicar: apaga de verdade (#195).', false),
  ('retencao_conta_inativa_dias', '{DIAS_CONTA_INATIVA}',
   'Dias sem acesso ate o aviso de conta inativa.', false),
  ('retencao_conta_aviso_dias', '{DIAS_AVISO}',
   'Dias entre o aviso e a exclusao da conta inativa.', false),
  ('retencao_conta_max_exclusoes', '20',
   'Teto de contas inativas enfileiradas para exclusao por execucao.', false),
  ('retencao_lote_max', '50000',
   'Teto de linhas por tabela por execucao (o resto sai nas proximas).', false),
  ('retencao_fila_dias', '30',
   'Dias ate apagar da fila externa o item ja processado.', false)
ON CONFLICT (chave) DO NOTHING
"""


def _politicas_sql() -> str:
    valores = ",\n  ".join("(" + ", ".join(_q(v) for v in p) + ")" for p in POLITICAS)
    return f"""
INSERT INTO public.retencao_politica
  (tabela, acao, coluna_tempo, dias, dias_pesquisa, filtro, ajuste, ordem, categoria, motivo)
VALUES
  {valores}
ON CONFLICT (tabela, acao) DO NOTHING
"""


CONSENTIMENTO_SQL = (
    "".join(
        f"""
ALTER TABLE public.{t} ADD COLUMN IF NOT EXISTS titular_hash text;
ALTER TABLE public.{t} ADD COLUMN IF NOT EXISTS anonimizado_em timestamptz;
DROP TRIGGER IF EXISTS trg_{t}_anonimiza ON public.{t};
CREATE TRIGGER trg_{t}_anonimiza
  BEFORE UPDATE OF aluno_id ON public.{t}
  FOR EACH ROW
  WHEN (OLD.aluno_id IS NOT NULL AND NEW.aluno_id IS NULL)
  EXECUTE FUNCTION public.trg_consentimento_anonimiza();
"""
        for t in CONSENTIMENTOS
    )
    + """
ALTER TABLE public.consentimento_responsavel ALTER COLUMN registrado_por DROP NOT NULL;
ALTER TABLE public.consentimento_responsavel
  DROP CONSTRAINT IF EXISTS consentimento_responsavel_aceite_identificado;
ALTER TABLE public.consentimento_responsavel
  ADD CONSTRAINT consentimento_responsavel_aceite_identificado CHECK (
    status = 'rejected'
    OR anonimizado_em IS NOT NULL
    OR (nome_responsavel IS NOT NULL AND relacao IS NOT NULL));
"""
)

FUNCOES_SQL = r"""
CREATE OR REPLACE FUNCTION public.trg_consentimento_anonimiza()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_novo jsonb;
BEGIN
  -- Fica a prova minima: que versao, que decisao, quando e por qual metodo.
  -- Sai o que identifica: o id vira hash, o nome do responsavel e a origem
  -- (aparelho, IP) somem. Quem registrou, se era o proprio aluno, tambem.
  NEW.titular_hash := encode(sha256(convert_to(OLD.aluno_id::text, 'UTF8')), 'hex');
  NEW.anonimizado_em := now();
  NEW.origem := '{}'::jsonb;
  IF TG_TABLE_NAME = 'consentimento_responsavel' THEN
    v_novo := to_jsonb(NEW) || jsonb_build_object('nome_responsavel', NULL);
    IF (v_novo ->> 'registrado_por') = OLD.aluno_id::text THEN
      v_novo := v_novo || jsonb_build_object('registrado_por', NULL);
    END IF;
    NEW := jsonb_populate_record(NEW, v_novo);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.trg_consentimento_anonimiza() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_classe_aluno_saida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Cascata da conta ou da turma apagada nao e "saida": nao ha o que reter.
    IF EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = OLD.aluno_id)
       AND EXISTS (SELECT 1 FROM public.classe c WHERE c.id = OLD.classe_id) THEN
      INSERT INTO public.classe_aluno_saidas (classe_id, aluno_id, entrou_em, saiu_em)
      VALUES (OLD.classe_id, OLD.aluno_id, OLD.created_at, now())
      ON CONFLICT (classe_id, aluno_id)
        DO UPDATE SET saiu_em = EXCLUDED.saiu_em, entrou_em = EXCLUDED.entrou_em;
    END IF;
    RETURN OLD;
  END IF;
  DELETE FROM public.classe_aluno_saidas s
   WHERE s.classe_id = NEW.classe_id AND s.aluno_id = NEW.aluno_id;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.trg_classe_aluno_saida() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_classe_aluno_saida ON public.classe_aluno;
CREATE TRIGGER trg_classe_aluno_saida
  AFTER INSERT OR DELETE ON public.classe_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trg_classe_aluno_saida();

-- Fila externa. Gatilhos de comando com tabela de transicao: um INSERT por
-- comando, nao por linha (a varredura apaga milhares de eventos de uma vez).
CREATE OR REPLACE FUNCTION public.trg_retencao_fila_telemetria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref)
    SELECT DISTINCT ON (v.payload ->> '_r2') 'r2', coalesce(v.payload ->> '_bucket', ''),
           v.payload ->> '_r2', jsonb_build_object('tabela', TG_TABLE_NAME, 'sessao_id', v.sessao_id)
      FROM velhas v
     WHERE v.payload ? '_r2'
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref)
    SELECT DISTINCT ON (v.payload ->> '_r2') 'r2', coalesce(v.payload ->> '_bucket', ''),
           v.payload ->> '_r2', jsonb_build_object('tabela', TG_TABLE_NAME, 'sessao_id', v.sessao_id)
      FROM velhas v
      JOIN novas n ON n.id = v.id
     WHERE v.payload ? '_r2'
       AND (n.payload ->> '_r2') IS DISTINCT FROM (v.payload ->> '_r2')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_retencao_fila_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- O material gerado vive nos DOIS lugares, com a mesma chave: Storage
  -- (bucket conteudo_aluno) e R2 (ver storage-redirect).
  INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref)
  SELECT DISTINCT d.destino, d.bucket, v.storage_path,
         jsonb_build_object('tabela', TG_TABLE_NAME)
    FROM velhas v
   CROSS JOIN (VALUES ('storage', 'conteudo_aluno'), ('r2', '')) AS d (destino, bucket)
   WHERE v.storage_path IS NOT NULL AND v.storage_path !~ '^https?://'
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_retencao_fila_fonte()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- So a fonte do ALUNO: a do professor o console ja apaga (classDeletion.ts).
  INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref)
  SELECT DISTINCT d.destino,
         CASE WHEN d.destino = 'storage' THEN coalesce(v.metadata ->> 'bucket', 'conteudo_aluno') ELSE '' END,
         v.storage_path, jsonb_build_object('tabela', TG_TABLE_NAME)
    FROM velhas v
   CROSS JOIN (VALUES ('storage'), ('r2')) AS d (destino)
   WHERE v.aluno_id IS NOT NULL AND v.storage_path IS NOT NULL AND v.storage_path !~ '^https?://'
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_retencao_fila_openai()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, ref)
  SELECT DISTINCT 'openai', v.vector_store_id, v.openai_file_id,
         jsonb_build_object('tabela', TG_TABLE_NAME)
    FROM velhas v
   WHERE v.openai_file_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$function$;

DO $t$
BEGIN
  IF to_regclass('public.telemetria_lotes') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_retencao_fila_lotes_del ON public.telemetria_lotes;
    CREATE TRIGGER trg_retencao_fila_lotes_del AFTER DELETE ON public.telemetria_lotes
      REFERENCING OLD TABLE AS velhas
      FOR EACH STATEMENT EXECUTE FUNCTION public.trg_retencao_fila_telemetria();
    DROP TRIGGER IF EXISTS trg_retencao_fila_lotes_upd ON public.telemetria_lotes;
    CREATE TRIGGER trg_retencao_fila_lotes_upd AFTER UPDATE ON public.telemetria_lotes
      REFERENCING OLD TABLE AS velhas NEW TABLE AS novas
      FOR EACH STATEMENT EXECUTE FUNCTION public.trg_retencao_fila_telemetria();
  END IF;
  IF to_regclass('public.telemetria_eventos_app') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_retencao_fila_eventos_del ON public.telemetria_eventos_app;
    CREATE TRIGGER trg_retencao_fila_eventos_del AFTER DELETE ON public.telemetria_eventos_app
      REFERENCING OLD TABLE AS velhas
      FOR EACH STATEMENT EXECUTE FUNCTION public.trg_retencao_fila_telemetria();
  END IF;
  IF to_regclass('public.materiais_gerados') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_retencao_fila_materiais ON public.materiais_gerados;
    CREATE TRIGGER trg_retencao_fila_materiais AFTER DELETE ON public.materiais_gerados
      REFERENCING OLD TABLE AS velhas
      FOR EACH STATEMENT EXECUTE FUNCTION public.trg_retencao_fila_material();
  END IF;
  IF to_regclass('public.fontes_personalizacao') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_retencao_fila_fontes ON public.fontes_personalizacao;
    CREATE TRIGGER trg_retencao_fila_fontes AFTER DELETE ON public.fontes_personalizacao
      REFERENCING OLD TABLE AS velhas
      FOR EACH STATEMENT EXECUTE FUNCTION public.trg_retencao_fila_fonte();
  END IF;
  IF to_regclass('public.rag_openai_files') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_retencao_fila_openai ON public.rag_openai_files;
    CREATE TRIGGER trg_retencao_fila_openai AFTER DELETE ON public.rag_openai_files
      REFERENCING OLD TABLE AS velhas
      FOR EACH STATEMENT EXECUTE FUNCTION public.trg_retencao_fila_openai();
  END IF;
END $t$;

CREATE OR REPLACE FUNCTION public.retencao_config_int(p_chave text, p_padrao integer)
RETURNS integer
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
       FROM public.app_config WHERE chave = p_chave),
    p_padrao)
$function$;

CREATE OR REPLACE FUNCTION public.retencao_predicado(p public.retencao_politica)
RETURNS text
LANGUAGE plpgsql STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pred text;
BEGIN
  IF p.acao = 'saida_turma' THEN
    -- Saiu ha mais de N dias e nao voltou.
    v_pred := format(
      'EXISTS (SELECT 1 FROM public.classe_aluno_saidas s'
      ' WHERE s.aluno_id = t.%1$I AND s.classe_id = t.classe_id'
      ' AND s.saiu_em < now() - make_interval(days => %2$s))'
      ' AND NOT EXISTS (SELECT 1 FROM public.classe_aluno ca'
      ' WHERE ca.aluno_id = t.%1$I AND ca.classe_id = t.classe_id)',
      p.coluna_aluno, p.dias);
  ELSIF p.dias_pesquisa IS NOT NULL THEN
    -- Prazo curto para todos; o longo so para quem consentiu pesquisa.
    v_pred := format(
      '((t.%1$I < now() - make_interval(days => %2$s)'
      ' AND NOT EXISTS (SELECT 1 FROM pg_temp.retencao_pesquisa rp WHERE rp.aluno_id = t.%4$I))'
      ' OR t.%1$I < now() - make_interval(days => %3$s))',
      p.coluna_tempo, p.dias, p.dias_pesquisa, p.coluna_aluno);
  ELSE
    v_pred := format('t.%I < now() - make_interval(days => %s)', p.coluna_tempo, p.dias);
  END IF;
  IF p.filtro IS NOT NULL THEN
    v_pred := v_pred || ' AND (' || p.filtro || ')';
  END IF;
  RETURN v_pred;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trailup_retencao(p_aplicar boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inicio    timestamptz := clock_timestamp();
  v_aplicar   boolean;
  v_lote      integer;
  v_pol       public.retencao_politica;
  v_pred      text;
  v_alvo      text;
  v_n         bigint;
  v_tabelas   jsonb := '[]'::jsonb;
  v_contas    jsonb;
  v_inativa   integer;
  v_aviso     integer;
  v_max       integer;
  v_voltaram  bigint;
  v_avisos    bigint;
  v_exclusoes bigint;
  v_fila      bigint := 0;
  v_resultado jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('trailup_retencao')) THEN
    RETURN jsonb_build_object('pulado', 'outra execucao em andamento');
  END IF;

  v_aplicar := coalesce(
    p_aplicar,
    (SELECT valor = 'aplicar' FROM public.app_config WHERE chave = 'retencao_modo'),
    false);
  v_lote := greatest(public.retencao_config_int('retencao_lote_max', 50000), 1);

  -- Quem pode ficar no prazo longo. Calculado uma vez por execucao.
  CREATE TEMP TABLE IF NOT EXISTS retencao_pesquisa (aluno_id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE pg_temp.retencao_pesquisa;
  IF to_regclass('public.consentimento_pesquisa') IS NOT NULL THEN
    INSERT INTO pg_temp.retencao_pesquisa (aluno_id)
    SELECT DISTINCT cp.aluno_id
      FROM public.consentimento_pesquisa cp
     WHERE cp.aluno_id IS NOT NULL
       AND public.aluno_finalidade_permitida(cp.aluno_id, 'pesquisa');
  END IF;

  FOR v_pol IN
    SELECT * FROM public.retencao_politica
     WHERE ativo AND acao IN ('apagar', 'redigir', 'agregar_e_apagar', 'saida_turma')
     ORDER BY ordem, tabela, acao
  LOOP
    BEGIN
      IF to_regclass(format('public.%I', v_pol.tabela)) IS NULL THEN
        v_tabelas := v_tabelas || jsonb_build_object(
          'tabela', v_pol.tabela, 'acao', v_pol.acao, 'erro', 'tabela inexistente');
        CONTINUE;
      END IF;
      v_pred := public.retencao_predicado(v_pol);
      v_alvo := format(
        't.ctid = ANY (ARRAY(SELECT t.ctid FROM public.%I t WHERE %s LIMIT %s))',
        v_pol.tabela, v_pred, v_lote);

      IF NOT v_aplicar THEN
        EXECUTE format('SELECT count(*) FROM public.%I t WHERE %s', v_pol.tabela, v_pred) INTO v_n;
      ELSIF v_pol.acao = 'redigir' THEN
        EXECUTE format('UPDATE public.%I t SET %s WHERE %s', v_pol.tabela, v_pol.ajuste, v_alvo);
        GET DIAGNOSTICS v_n = ROW_COUNT;
      ELSIF v_pol.acao = 'agregar_e_apagar' THEN
        EXECUTE format(
          'WITH saiu AS (DELETE FROM public.%I t WHERE %s'
          ' RETURNING t.classe_id, t.topico_id, t.scope, t.captured_at, t.visits, t.dwell_sec,'
          ' t.active_sec, t.idle_sec, t.touch_count),'
          ' somou AS (INSERT INTO public.telemetria_agregado_turma_dia AS a'
          ' (classe_id, topico_id, scope, dia, entradas, visits, dwell_sec, active_sec, idle_sec, touch_count)'
          ' SELECT classe_id, topico_id, scope, (captured_at AT TIME ZONE ''America/Sao_Paulo'')::date,'
          ' count(*), sum(visits), sum(dwell_sec), sum(active_sec), sum(idle_sec), sum(touch_count)'
          ' FROM saiu GROUP BY 1, 2, 3, 4'
          ' ON CONFLICT (classe_id, (coalesce(topico_id, 0)), scope, dia) DO UPDATE SET'
          ' entradas = a.entradas + EXCLUDED.entradas, visits = a.visits + EXCLUDED.visits,'
          ' dwell_sec = a.dwell_sec + EXCLUDED.dwell_sec, active_sec = a.active_sec + EXCLUDED.active_sec,'
          ' idle_sec = a.idle_sec + EXCLUDED.idle_sec, touch_count = a.touch_count + EXCLUDED.touch_count'
          ' RETURNING 1)'
          ' SELECT count(*) FROM saiu',
          v_pol.tabela, v_alvo) INTO v_n;
      ELSE
        EXECUTE format('DELETE FROM public.%I t WHERE %s', v_pol.tabela, v_alvo);
        GET DIAGNOSTICS v_n = ROW_COUNT;
      END IF;

      v_tabelas := v_tabelas || jsonb_build_object(
        'tabela', v_pol.tabela, 'acao', v_pol.acao, 'linhas', v_n);
    EXCEPTION WHEN OTHERS THEN
      -- Uma tabela com problema nao segura as outras; o erro fica no registro.
      v_tabelas := v_tabelas || jsonb_build_object(
        'tabela', v_pol.tabela, 'acao', v_pol.acao, 'erro', SQLERRM);
    END;
  END LOOP;

  -- Conta inativa: 24 meses sem acesso -> aviso; +30 dias ainda sem acesso ->
  -- exclusao do usuario do Auth (fila externa; a cascata apaga o resto).
  v_inativa := public.retencao_config_int('retencao_conta_inativa_dias', 730);
  v_aviso := public.retencao_config_int('retencao_conta_aviso_dias', 30);
  v_max := public.retencao_config_int('retencao_conta_max_exclusoes', 20);

  CREATE TEMP TABLE IF NOT EXISTS retencao_ultimo_acesso (
    aluno_id uuid PRIMARY KEY, ultimo timestamptz) ON COMMIT DROP;
  TRUNCATE pg_temp.retencao_ultimo_acesso;
  INSERT INTO pg_temp.retencao_ultimo_acesso (aluno_id, ultimo)
  SELECT a.id, greatest(u.created_at, u.last_sign_in_at, d.ultimo)
    FROM public.alunos a
    JOIN auth.users u ON u.id = a.id
    LEFT JOIN (
      SELECT aluno_id, max(coalesce(ultimo_acesso_em, atualizado_em)) AS ultimo
        FROM public.aluno_atividade_diaria GROUP BY aluno_id) d ON d.aluno_id = a.id
   WHERE NOT EXISTS (SELECT 1 FROM public.professor p WHERE p.id = a.id);

  SELECT count(*) INTO v_voltaram
    FROM public.retencao_avisos_inatividade v
    JOIN pg_temp.retencao_ultimo_acesso ua ON ua.aluno_id = v.aluno_id
   WHERE v.exclusao_enfileirada_em IS NULL AND ua.ultimo > v.avisado_em;

  SELECT count(*) INTO v_avisos
    FROM pg_temp.retencao_ultimo_acesso ua
   WHERE ua.ultimo < now() - make_interval(days => v_inativa)
     AND NOT EXISTS (SELECT 1 FROM public.retencao_avisos_inatividade v WHERE v.aluno_id = ua.aluno_id);

  SELECT count(*) INTO v_exclusoes FROM (
    SELECT 1
      FROM public.retencao_avisos_inatividade v
      JOIN pg_temp.retencao_ultimo_acesso ua ON ua.aluno_id = v.aluno_id
     WHERE v.exclusao_enfileirada_em IS NULL
       AND v.avisado_em < now() - make_interval(days => v_aviso)
       AND ua.ultimo <= v.avisado_em
     LIMIT v_max) x;

  IF v_aplicar THEN
    DELETE FROM public.retencao_avisos_inatividade v
     USING pg_temp.retencao_ultimo_acesso ua
     WHERE ua.aluno_id = v.aluno_id AND v.exclusao_enfileirada_em IS NULL
       AND ua.ultimo > v.avisado_em;

    WITH alvo AS (
      SELECT v.aluno_id
        FROM public.retencao_avisos_inatividade v
        JOIN pg_temp.retencao_ultimo_acesso ua ON ua.aluno_id = v.aluno_id
       WHERE v.exclusao_enfileirada_em IS NULL
         AND v.avisado_em < now() - make_interval(days => v_aviso)
         AND ua.ultimo <= v.avisado_em
       ORDER BY v.avisado_em
       LIMIT v_max),
    fila AS (
      INSERT INTO public.retencao_fila_externa (destino, caminho, ref)
      SELECT 'auth_user', alvo.aluno_id::text, jsonb_build_object('motivo', 'conta_inativa')
        FROM alvo
      ON CONFLICT DO NOTHING)
    UPDATE public.retencao_avisos_inatividade v
       SET exclusao_enfileirada_em = now()
      FROM alvo WHERE alvo.aluno_id = v.aluno_id;

    WITH novos AS (
      INSERT INTO public.retencao_avisos_inatividade (aluno_id, ultimo_acesso_em)
      SELECT ua.aluno_id, ua.ultimo
        FROM pg_temp.retencao_ultimo_acesso ua
       WHERE ua.ultimo < now() - make_interval(days => v_inativa)
      ON CONFLICT (aluno_id) DO NOTHING
      RETURNING aluno_id)
    INSERT INTO public.notificacoes (aluno_id, titulo, corpo, tipo, origem, contexto)
    SELECT novos.aluno_id,
           'Sua conta vai ser apagada',
           'Voce nao entra no TrailUp ha mais de dois anos. Se nao entrar nos proximos '
             || v_aviso::text || ' dias, a conta e os dados dela serao apagados.',
           'sistema', 'retencao', jsonb_build_object('motivo', 'conta_inativa')
      FROM novos;

    DELETE FROM public.retencao_fila_externa
     WHERE processado_em < now() - make_interval(days => public.retencao_config_int('retencao_fila_dias', 30));
    GET DIAGNOSTICS v_fila = ROW_COUNT;
    DELETE FROM public.retencao_execucoes WHERE iniciado_em < now() - interval '400 days';
  END IF;

  v_contas := jsonb_build_object(
    'voltaram', v_voltaram, 'avisos', v_avisos, 'exclusoes', v_exclusoes,
    'inativa_dias', v_inativa, 'aviso_dias', v_aviso);
  v_resultado := jsonb_build_object(
    'modo', CASE WHEN v_aplicar THEN 'aplicar' ELSE 'simular' END,
    'tabelas', v_tabelas,
    'contas_inativas', v_contas,
    'fila_externa_limpa', v_fila,
    'lote_max', v_lote);
  INSERT INTO public.retencao_execucoes (modo, iniciado_em, resultado)
  VALUES (CASE WHEN v_aplicar THEN 'aplicar' ELSE 'simular' END, v_inicio, v_resultado);
  RETURN v_resultado;
END;
$function$;
"""

_FUNCOES = (
    "public.trg_retencao_fila_telemetria()",
    "public.trg_retencao_fila_material()",
    "public.trg_retencao_fila_fonte()",
    "public.trg_retencao_fila_openai()",
    "public.retencao_config_int(text, integer)",
    "public.retencao_predicado(public.retencao_politica)",
    "public.trailup_retencao(boolean)",
)

ACL_FUNCOES_SQL = "".join(f"REVOKE EXECUTE ON FUNCTION {f} FROM PUBLIC, anon, authenticated;\n" for f in _FUNCOES)

CRON_SQL = f"""
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('{_JOB}')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{_JOB}');
    PERFORM cron.schedule('{_JOB}', '23 3 * * *', 'SELECT public.trailup_retencao()');
  END IF;
END $$
"""


def upgrade() -> None:
    for tabela, coluna, ref, acao in FKS:
        op.execute(_sql_fk(tabela, coluna, ref, acao))
    op.execute(TABELAS_SQL)
    op.execute(ACL_TABELAS_SQL)
    op.execute(CONFIG_SQL)
    op.execute(_politicas_sql())
    op.execute(FUNCOES_SQL)
    op.execute(CONSENTIMENTO_SQL)
    op.execute(ACL_FUNCOES_SQL)
    op.execute(CRON_SQL)


def downgrade() -> None:
    op.execute(
        f"""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
            PERFORM cron.unschedule('{_JOB}')
              WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{_JOB}');
          END IF;
        END $$
        """
    )
    for t in CONSENTIMENTOS:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{t}_anonimiza ON public.{t}")
    op.execute("DROP TRIGGER IF EXISTS trg_classe_aluno_saida ON public.classe_aluno")
    op.execute("DROP TRIGGER IF EXISTS trg_retencao_fila_lotes_del ON public.telemetria_lotes")
    op.execute("DROP TRIGGER IF EXISTS trg_retencao_fila_lotes_upd ON public.telemetria_lotes")
    op.execute("DROP TRIGGER IF EXISTS trg_retencao_fila_eventos_del ON public.telemetria_eventos_app")
    op.execute("DROP TRIGGER IF EXISTS trg_retencao_fila_materiais ON public.materiais_gerados")
    op.execute("DROP TRIGGER IF EXISTS trg_retencao_fila_fontes ON public.fontes_personalizacao")
    op.execute("DROP TRIGGER IF EXISTS trg_retencao_fila_openai ON public.rag_openai_files")
    op.execute("DROP FUNCTION IF EXISTS public.trailup_retencao(boolean)")
    op.execute("DROP FUNCTION IF EXISTS public.retencao_predicado(public.retencao_politica)")
    op.execute("DROP FUNCTION IF EXISTS public.retencao_config_int(text, integer)")
    for f in (
        "trg_retencao_fila_telemetria",
        "trg_retencao_fila_material",
        "trg_retencao_fila_fonte",
        "trg_retencao_fila_openai",
        "trg_classe_aluno_saida",
        "trg_consentimento_anonimiza",
    ):
        op.execute(f"DROP FUNCTION IF EXISTS public.{f}()")
    for t in reversed(_INTERNAS):
        op.execute(f"DROP TABLE IF EXISTS public.{t}")
    # Ficam, de proposito: as FKs novas (voltar a NO ACTION so reabriria o
    # bloqueio da exclusao de conta), as colunas titular_hash/anonimizado_em
    # (podem ter prova anonimizada) e as chaves de app_config.
