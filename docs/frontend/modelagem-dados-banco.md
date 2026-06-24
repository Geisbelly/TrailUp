# Modelagem de Dados e Modelagem de Banco (Supabase)

Atualizado em: 2026-04-13

## 1. Objetivo

Este documento consolida:
- modelagem de dados (conceitual e lógica)
- modelagem de banco (fisica no Postgres/Supabase)
- relacoes criticas entre entidades
- ownership de escrita/leitura entre Web, API e Mobile

## 2. Fontes consideradas

- `C:\Users\geisb\Downloads\Banco de dados completo - TrailUp.txt`
- `sql/manual_supabase_migration.sql` (repo API)
- migrations do repo Web em `supabase/migrations/*`

## 3. Modelagem de dados (conceitual)

O dominio foi separado em macro-contextos:
1. Identidade e Acesso
2. Estrutura Pedagógica
3. Progresso de Aprendizagem
4. Personalização e IA
5. Telemetria Comportamental
6. Gamificacao e Notificações
7. Infra de Runtime

```mermaid
flowchart LR
  ID[Identidade e Acesso]
  PED[Estrutura Pedagogica]
  PROG[Progresso]
  PERS[Personalizacao IA]
  TEL[Telemetria]
  GAME[Gamificacao e Notificacoes]
  INF[Infra Runtime]

  ID --> PED
  PED --> PROG
  PED --> PERS
  PROG --> PERS
  TEL --> PERS
  PROG --> GAME
  TEL --> GAME
  PERS --> INF
```

## 4. Modelagem lógica por dominio

## 4.1 Identidade e Acesso

Entidades principais:
- `alunos`
- `professor`
- `perfil`
- `aluno_perfil`
- `professor_aluno`
- `modoOperacao`
- `expo_tokens`
- `solicitacoes_exclusao`

Responsabilidade:
- representar identidade acadêmica
- vincular aluno-professor
- armazenar perfil comportamental inicial

## 4.2 Estrutura Pedagógica

Entidades principais:
- `materia`
- `classe`
- `classe_aluno`
- `topicos`
- `topico_edges`
- `conteudos`
- `midias`
- `cards`
- `atividades`
- `atividade_conteudos`
- `questoes`

Responsabilidade:
- representar a trilha de ensino por turma
- mapear dependências de tópicos e recursos didaticos

## 4.3 Progresso de Aprendizagem

Entidades principais:
- `topico_aluno`
- `conteudo_aluno`
- `atividade_aluno`
- `questao_aluno`
- `trilha_aluno`
- `trilha_modelo`
- `trilha_checkpoint_navegacao`
- `eventos_aluno`

Responsabilidade:
- registrar execução e desempenho do aluno no tempo

## 4.4 Personalização e IA

Entidades principais:
- `conteudo_personalizado`
- `fontes_personalizacao`
- `personalizacao_jobs`
- `personalizacao_job_targets`
- `personalizacao_item_progresso`
- `materiais_gerados`
- `iaDescricao`
- `ia_decision_logs`
- `classe_mapa_tema`

Responsabilidade:
- gerar, versionar e rastrear conteúdo adaptado por aluno/tópico
- operacionalizar fila de jobs assínc

## 4.5 Telemetria Comportamental

Entidades principais:
- `telemetria_sessoes`
- `telemetria_lotes`
- `telemetria_eventos_app`
- `telemetria_time_metric_entries`

Responsabilidade:
- capturar comportamento de uso
- alimentar análise adaptativa e visoes analiticas

## 4.6 Gamificacao e Notificações

Entidades principais:
- `conquistas`
- `conquistas_aluno`
- `rank_tipo`
- `ranks`
- `rank_posicoes`
- `notificacoes`
- `notificacoes_agendamentos`
- `notificacoes_ia`
- `notificacoes_pendentes`

Responsabilidade:
- engajamento, ranking e comunicação com aluno/professor

## 4.7 Infra de Runtime

Entidades principais:
- `checkpoints`
- `checkpoint_blobs`
- `checkpoint_writes`
- `checkpoint_migrations`
- `alembic_version`

Responsabilidade:
- persist?ncia de estado do workflow/graph e versionamento de schema

## 5. Modelagem fisica do banco

No dump de referencia existem 53 `CREATE TABLE` no schema `public`.

```mermaid
flowchart TD
  C1[Schema public]
  C1 --> T1[Tabelas transacionais]
  C1 --> T2[Tabelas analiticas]
  C1 --> T3[Tabelas de runtime]
  T1 --> IDX[Indexacao por FK e contexto aluno/classe/topico]
  T2 --> VW[Views para metricas]
  T3 --> CKP[Checkpointing LangGraph]
```

Caracteristicas fisicas relevantes:
- chaves primarias majoritariamente `bigint identity` e `uuid`.
- relacionamentos com FKs para consistencia de dominio.
- campos `json/jsonb` para payload flexivel de IA e telemetria.
- indices focados em contexto operacional (`aluno_id`, `classe_id`, `topico_id`, `updated_at`).

## 6. Diagramas ER por fluxo crítico

## 6.1 ER Pedagógico

```mermaid
erDiagram
  MATERIA ||--o{ CLASSE : possui
  PROFESSOR ||--o{ CLASSE : ministra
  CLASSE ||--o{ CLASSE_ALUNO : matricula
  ALUNOS ||--o{ CLASSE_ALUNO : participa
  CLASSE ||--o{ TOPICOS : organiza
  TOPICOS ||--o{ TOPICO_EDGES : encadeia
  TOPICOS ||--o{ CONTEUDOS : contem
  CONTEUDOS ||--o{ MIDIAS : anexa
  CONTEUDOS ||--o{ CARDS : sintetiza
  TOPICOS ||--o{ ATIVIDADES : avalia
  ATIVIDADES ||--o{ ATIVIDADE_CONTEUDOS : referencia
  CONTEUDOS ||--o{ ATIVIDADE_CONTEUDOS : origem
  ATIVIDADES ||--o{ QUESTOES : possui
```

## 6.2 ER Personalização

```mermaid
erDiagram
  ALUNOS ||--o{ CONTEUDO_PERSONALIZADO : recebe
  CLASSE ||--o{ CONTEUDO_PERSONALIZADO : contexto
  TOPICOS ||--o{ CONTEUDO_PERSONALIZADO : alvo
  CONTEUDOS ||--o{ CONTEUDO_PERSONALIZADO : foco

  ALUNOS ||--o{ CARDS_PERSONALIZADOS : cards
  ALUNOS ||--o{ ATIVIDADES_PERSONALIZADAS : atividades
  CLASSE ||--o{ CARDS_PERSONALIZADOS : contexto
  CLASSE ||--o{ ATIVIDADES_PERSONALIZADAS : contexto
  TOPICOS ||--o{ CARDS_PERSONALIZADOS : topico
  TOPICOS ||--o{ ATIVIDADES_PERSONALIZADAS : topico
  CONTEUDOS ||--o{ CARDS_PERSONALIZADOS : conteudo_opcional
  CONTEUDOS ||--o{ ATIVIDADES_PERSONALIZADAS : conteudo_opcional
  ATIVIDADES_PERSONALIZADAS ||--o{ QUESTOES_PERSONALIZADAS : gera
  ALUNOS ||--o{ QUESTOES_PERSONALIZADAS : responde

  CLASSE ||--o{ PERSONALIZACAO_JOBS : possui
  PERSONALIZACAO_JOBS ||--o{ PERSONALIZACAO_JOB_TARGETS : detalha
  ALUNOS ||--o{ PERSONALIZACAO_JOB_TARGETS : target
  TOPICOS ||--o{ PERSONALIZACAO_JOB_TARGETS : target

  CONTEUDO_PERSONALIZADO ||--o{ PERSONALIZACAO_ITEM_PROGRESSO : granulariza
  ALUNOS ||--o{ PERSONALIZACAO_ITEM_PROGRESSO : avanca

  FONTES_PERSONALIZACAO }o--|| CLASSE : classe
  FONTES_PERSONALIZACAO }o--o| TOPICOS : topico_opcional
  FONTES_PERSONALIZACAO }o--o| CONTEUDOS : conteudo_opcional
  FONTES_PERSONALIZACAO }o--o| ALUNOS : aluno_opcional
```

## 6.3 ER Telemetria

```mermaid
erDiagram
  ALUNOS ||--o{ TELEMETRIA_SESSOES : inicia
  TELEMETRIA_SESSOES ||--o{ TELEMETRIA_LOTES : agrega
  TELEMETRIA_SESSOES ||--o{ TELEMETRIA_EVENTOS_APP : registra
  TELEMETRIA_LOTES ||--o{ TELEMETRIA_TIME_METRIC_ENTRIES : expande
  CLASSE ||--o{ TELEMETRIA_LOTES : contexto
  TOPICOS ||--o{ TELEMETRIA_EVENTOS_APP : opcional
  CONTEUDOS ||--o{ TELEMETRIA_EVENTOS_APP : opcional
  ATIVIDADES ||--o{ TELEMETRIA_EVENTOS_APP : opcional
```

## 7. Ownership de dados por sistema

| Dominio | Web | API | Mobile |
|---|---|---|---|
| Estrutura pedagógica | escrita principal | leitura/apoio | leitura |
| Personalização em lote | dispara jobs | escrita principal | leitura |
| Progresso personalizado | suporte | escrita validada | escrita via API |
| Telemetria | não principal | escrita/processamento principal | escrita principal (origem dos sinais) |
| Gamificacao/rank | leitura parcial | calculo/apoio | leitura principal |

## 8. Regras importantes de modelagem

## 8.1 `questoes.nota_estabelecida` opcional

Semântica atual:
- `NULL` = sem nota definida
- sem fallback automatico para `1`
- dados antigos não são reescritos automaticamente

Impacto:
- frontend deve validar campo preenchido `> 0`
- sem preenchimento, persistir `NULL`
- correção dissertativa sem nota usa escala 0-100

## 8.2 Chaves e consistencia

Padrões praticos:
- usar PK surrogate para identidade técnica.
- manter FK para encadear dominio pedagógico.
- em tabelas de evento/telemetria, usar combinacao de ids e timestamps.
- em personalização, garantir unicidade por contexto operacional quando necessario.

## 9. Views analiticas e consumo

O modelo inclui views para facilitar leitura de métricas, por exemplo:
- `vw_rank_posicoes_por_classe`
- `vw_metricas_*` (engajamento, desempenho, evolução, distribuição)
- `vw_telemetria_tempo_*`
- `vw_ia_decision_logs_resumo`

Uso:
- dashboards docentes/operacionais
- indicadores de risco e comportamento
- suporte a decisões de personalização

## 10. Functions e triggers custom

Nos artefatos locais versionados analisados:
- não ha `CREATE FUNCTION` custom versionado
- não ha `CREATE TRIGGER` custom versionado

Se existirem no ambiente remoto, recomenda-se exportar e versionar junto das migrations para evitar drift.

## 11. Ciclo de vida dos dados

```mermaid
sequenceDiagram
  participant WEB as Web
  participant API as API
  participant MOB as Mobile
  participant DB as Supabase

  WEB->>DB: CRUD pedagogico
  WEB->>API: enqueue jobs personalizacao
  API->>DB: conteudo_personalizado + progresso
  MOB->>DB: leitura da trilha e personalizacao
  MOB->>API: telemetria e progresso item
  API->>DB: persistencia analitica e eventos
```

## 12. Checklist de evolução segura da modelagem

1. versionar toda mudanca em migration idempotente.
2. atualizar tipos TS/Pydantic apos mudanca de schema.
3. validar impacto em Web/API/Mobile antes de deploy.
4. revisar indices quando inserir novas consultas por contexto.
5. manter documentação de dominio sincronizada com schema real.


## Atualizacoes (2026-04-13)

- Console do professor passou a validar upload com lista fixa de formatos (pdf, doc, docx, ppt, pptx, txt, md, mp3, wav, ogg, mp4, webm, mov) e limite de 200 MB.
- Midia de questoes aceita apenas image/video/audio/pdf.
- Web envia `personalizacaoThemeGuide` (paleta + tom por perfil) para a Edge Function `generate-content-ai`.
- Edge Function inclui um guia de tema e tom no prompt de IA, alinhando a geracao com o tema do mobile.
