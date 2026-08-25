# Arquitetura e Estrutura do App: Camadas e Responsabilidades

Atualizado em: 2026-04-13

## 1. Objetivo

Este documento explica a arquitetura do ecossistema TrailUp (Web, API e Mobile), a divisao em camadas e a responsabilidade de cada camada.

## 2. VisÃ£o macro do ecossistema

```mermaid
flowchart LR
  subgraph WEB[Web Professor]
    WUI[UI e Console]
    WAPP[Hooks e Servicos]
    WINF[Supabase Client e Edge Functions]
  end

  subgraph API[FastAPI + LangGraph]
    AAPI[Rotas HTTP]
    ASVC[Servicos de dominio]
    AAG[Agentes e workflows]
    AREP[Repositorios SQL]
  end

  subgraph MOB[Mobile Aluno]
    MUI[Telas e componentes]
    MCTX[Contextos e estado]
    MSVC[Servicos API/Supabase]
  end

  subgraph SUPA[Supabase]
    DB[(Postgres)]
    ST[(Storage)]
    RT[(Realtime)]
  end

  WUI --> WAPP --> WINF --> DB
  WAPP --> API
  AAPI --> ASVC --> AAG --> AREP --> DB
  ASVC --> ST
  MUI --> MCTX --> MSVC --> DB
  MSVC --> API
  DB --> RT --> MSVC
```

## 3. Camadas por repositÃ³rio

## 3.1 Web (brainhex-navigator)

Estrutura principal:
- `src/pages`: roteamento e pÃ¡ginas
- `src/components`: UI e mÃ³dulos de tela
- `src/hooks`: auth e hooks de aplicaÃ§Ã£o
- `src/features`: fluxos de neg?cio do frontend
- `src/lib`: regras, normalizadores e utilitÃ¡rios
- `src/integrations/supabase`: cliente e tipos
- `supabase/functions/*`: edge functions da Web

### Camadas e responsabilidades (Web)

| Camada | Diretorios | Responsabilidade |
|---|---|---|
| Presentation | `src/pages`, `src/components` | render, interaÃ§Ã£o e fluxo visual do professor |
| Application | `src/hooks`, `src/features` | orquestracao de casos de uso da tela |
| Domain/UI Rules | `src/lib` | regras de validaÃ§Ã£o/normalizaÃ§Ã£o e contratos locais |
| Infrastructure | `src/integrations/supabase`, `supabase/functions` | acesso a banco/edge function e IO externo |

```mermaid
flowchart TD
  P[Pages/Components] --> H[Hooks/Features]
  H --> D[Lib Rules]
  D --> I[Supabase + API + Edge]
  I --> R[Responses]
  R --> P
```

## 3.2 API (ApiTraiUp)

Estrutura principal:
- `app/api`: interface HTTP FastAPI
- `app/services`: regras de neg?cio e orquestracao
- `app/agent`: grafo LangGraph e nodes
- `app/repositories`: acesso a dados (SQL)
- `app/schemas`: contratos pydantic
- `app/db`, `app/core`: sessao, engine e settings

### Camadas e responsabilidades (API)

| Camada | Diretorios | Responsabilidade |
|---|---|---|
| Interface/API | `app/api`, `app/schemas` | endpoints, validaÃ§Ã£o e serializaÃ§Ã£o de contratos |
| Application Services | `app/services` | casos de uso (personalizaÃ§Ã£o, chat, telemetria, jobs) |
| Workflow/Agent | `app/agent` | decisÃ£o e execuÃ§Ã£o de workflows com LangGraph |
| Data Access | `app/repositories` | queries SQL, transaÃ§Ãµes e mapeamento de entidades |
| Infrastructure | `app/db`, `app/core` | conexÃ£o DB, configuraÃ§Ã£o, runtime de app |

```mermaid
flowchart LR
  C[Cliente] --> API[FastAPI Routers]
  API --> SVC[Services]
  SVC --> AG[Agent Graph]
  SVC --> REP[Repositories]
  AG --> REP
  REP --> DB[(Postgres)]
```

## 3.3 Mobile (trailup-app-dsm-2502)

Estrutura principal:
- `src/app`: rotas Expo Router
- `src/components`, `src/screens`: camada visual
- `src/context`: estado global e orquestracao
- `src/services`: chamadas API e Supabase
- `src/models`, `src/interfaces`: contratos e modelos
- `src/database`: cliente Supabase
- `src/utils`: adaptadores utilitÃ¡rios

### Camadas e responsabilidades (Mobile)

| Camada | Diretorios | Responsabilidade |
|---|---|---|
| Presentation | `src/app`, `src/screens`, `src/components` | experiÃªncia do aluno e navegaÃ§Ã£o |
| State/Application | `src/context` | sessao, trilha, IA, mÃ©tricas e sincronizacao |
| Domain Model | `src/models`, `src/interfaces` | tipos de neg?cio e contratos de dados |
| Infrastructure | `src/services`, `src/database`, `src/utils` | integracao externa e persist?ncia local/remota |

```mermaid
flowchart TD
  UI[App/Screens/Components] --> CTX[Context Providers]
  CTX --> MOD[Models/Interfaces]
  CTX --> SVC[Services]
  SVC --> SUPA[Supabase]
  SVC --> API[FastAPI]
  SUPA --> CTX
  API --> CTX
```

## 4. Fronteiras de responsabilidade

| Assunto | Web | API | Mobile |
|---|---|---|---|
| CRUD pedagÃ³gico | dono principal | consumidor indireto | leitura |
| GeraÃ§Ã£o de personalizaÃ§Ã£o em lote | dispara jobs | dono principal (worker) | consome resultado |
| Progresso de item personalizado | suporte visual | valida e persiste | envia dados |
| Telemetria comportamental | nÃ£o principal | processa e analisa | produz e envia |
| CorreÃ§Ã£o dissertativa IA | chama edge function | nÃ£o principal | nÃ£o principal |

## 5. Principios de separaÃ§Ã£o de camadas

1. Camada visual nÃ£o escreve SQL nem conhece schema detalhado.
2. Regras de neg?cio ficam em services (API) e utilitÃ¡rios de dominio (Web/Mobile), nÃ£o em componente visual.
3. RepositÃ³rios encapsulam acesso a dados e evitam SQL espalhado.
4. Contratos de entrada/saida sÃ£o tipados (`schemas`, `interfaces`, `types`).
5. IntegraÃ§Ãµes externas (Supabase/API/LLM/Storage) ficam na infraestrutura.

## 6. Fluxos chave entre camadas

## 6.1 PersonalizaÃ§Ã£o assÃ­nc

```mermaid
sequenceDiagram
  participant WEB as Web Console
  participant API as API Layer
  participant SVC as Service Layer
  participant REP as Repository Layer
  participant DB as Supabase DB
  participant MOB as Mobile

  WEB->>API: POST /api/v1/personalizar/jobs/class-delta
  API->>SVC: validar e criar job
  SVC->>REP: inserir job e targets
  REP->>DB: persistencia
  SVC->>REP: processar targets (worker)
  REP->>DB: upsert conteudo_personalizado
  MOB->>DB: ler personalizacao persistida
```

## 6.2 Telemetria

```mermaid
sequenceDiagram
  participant MOB as Mobile UI
  participant CTX as Context Layer
  participant SVC as Mobile Service
  participant API as API Telemetria
  participant DB as Supabase

  MOB->>CTX: evento de uso
  CTX->>SVC: montar lote
  SVC->>API: POST /api/v1/telemetria/lotes
  API->>DB: sessao + lote + eventos + metricas
  API-->>SVC: resumo de analise
  SVC-->>CTX: atualiza estado local
```

## 7. Resultado esperado dessa arquitetura

- EvoluÃ§Ã£o desacoplada dos 3 repositÃ³rios.
- Menor risco de regressÃ£o por isolamento de responsabilidade.
- OperaÃ§Ã£o mais previsivel (jobs, retries, estados).
- Observabilidade melhor por camada (UI, API, DB, worker).


## Atualizacoes (2026-04-13)

- Console do professor passou a validar upload com lista fixa de formatos (pdf, doc, docx, ppt, pptx, txt, md, mp3, wav, ogg, mp4, webm, mov) e limite de 200 MB.
- Midia de questoes aceita apenas image/video/audio/pdf.
- Web envia `personalizacaoThemeGuide` (paleta + tom por perfil) para a Edge Function `generate-content-ai`.
- Edge Function inclui um guia de tema e tom no prompt de IA, alinhando a geracao com o tema do mobile.
