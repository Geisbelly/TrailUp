---
tags: [glossario]
synced_from: BitStudioLabs/trail-up
synced_sha: b7e74cdd331a4b215d8b07cda5e3b338220f060d
synced_at: 2026-10-02 16:09 America/Sao_Paulo
---

# Glossário TrailUp

| Termo | Definição curta | Onde aparece |
|-------|-----------------|--------------|
| **TrailUp** | Plataforma educacional gamificada/adaptativa (monorepo BitStudioLabs/trail-up) | Toda a documentação |
| **NeuroNauta** | Nome histórico na Proposta de TCC | Proposta |
| **BrainHex** | Tipologia neurobiológica de 7 arquétipos de jogador (Seeker, Survivor, Daredevil, Mastermind, Conqueror, Socialiser, Achiever) | TCC 1, UX, Monografia §2.7; `microservice` / personalização |
| **Hexad** | Modelo rival/complementar de tipos de usuário em gamificação | Leituras (papers Hexad) |
| **Trilha de aprendizagem** | Percurso estruturado de conteúdos/atividades | TCC 1; `agente_trilha` |
| **IA emocional / FER** | Facial Expression Recognition — proposta original via câmera; **fora do MVP** (telemetria no lugar) | Proposta; mobile termo coleta (#286) |
| **RAG** | Retrieval-Augmented Generation — recuperar evidências antes de gerar | Monografia cap. 6; `docs/architecture/rag.md`; `docs/rag/*` |
| **Evidence Base** | Base de evidências científicas curadas para fundamentar estratégias | Monografia; Leituras Aprovadas; corpus RAG |
| **pgvector** | Extensão Postgres para embeddings / vector store do RAG (ADR-0001) | `docs/adr/0001-rag-vector-store.md` |
| **LangGraph** | Orquestração de agentes na API (supervisor + nós de personalização) | `api/app/agent/graph/` |
| **api-brainhex / microservice** | Serviço Node que gera mídia base por perfil (texto/áudio/slides) | `microservice/` |
| **BrainHexPDF** | Serviço externo de render de deck/HTML (fora do monorepo) | `CLAUDE.md`; `BRAINHEXPDF_API_URL` |
| **Supabase** | Postgres + Auth + Storage + RLS + Realtime — banco/plataforma principal | Toda a stack |
| **Dokploy** | Hosting da API (VPS); substitui a narrativa antiga de Render free tier | `CLAUDE.md`; #289 |
| **ai_patch / mental state** | Estado mental / patch de IA usado na adequação por aluno | API; telemetria |
| **Personalização base × adequação** | Base = `(classe × tópico × perfil)`; adequação = camada leve por aluno | `CLAUDE.md` |
| **M2 / knowledge tracing** | Modelos scikit-learn (acerto e gate de “travar”) versionados em `models/` | `models/m2_knowledge_tracing/` |
| **UDL** | Universal Design for Learning | Leituras / UX acessibilidade |
| **Learning analytics / telemetria** | Coleta de sinais de uso, desempenho, engajamento (`/telemetria/lotes`) | Monografia; `docs/architecture/coleta-de-metricas.md` |
| **Motor de decisão** | Orquestrador central das adaptações (na prática: LangGraph + serviços na API) | Planilha TCC 2; API |
| **Modos TrailUp** | Exploratório, Interativo-Prático, Avaliação Adaptativa, Missão Aplicada, Reflexivo | Fluxo TrailUp |
| **Lumi** | Assistente / personagem de design | Design/Personagens/Lumi |
| **Índice de domínio** | Métrica 0–100% por módulo no fluxo | Fluxo TrailUp |
| **topico_aluno** | Progresso do aluno no tópico; percentual recalculado por trigger no banco | SQL/migrations; mobile |
| **RLS** | Row Level Security no Postgres/Supabase | Frontend/API fallbacks |
| **PRISMA / PRISMA-ScR** | Protocolo de revisão sistemática / scoping | Monografia metodologia |
| **MVP** | Escopo delimitado da monografia (sem diagnóstico clínico etc.) | Monografia §1.7 |
| **Geisbelly/TrailUp** | Espelho público READ-only; **nunca merge** para BitStudioLabs | [[05-PRs-Repos/links-repos]] |

| **Alembic** | Migrations SQL da API; cadeia linear (1 head). Em `b7e74cdd`, `20260930_01` revisa `20260929_02` | `api/alembic/` |
| **Reflect** | Ferramenta de testes E2E / regressão UI (gravação de fluxos) | [[09-Testes-Reflect/reflect-local]] |
| **TraiUp** | Nome do projeto Supabase (grafia do console; ≠ “TrailUp” produto) | [[08-Infra-Supabase/supabase-traiup]] |
| **PITR** | Point-in-Time Recovery — **não** disponível no plano Free | [[10-Incidentes/perda-dados-console-2026-10-01]] |
| **Vercel espelho** | Deploy web de Geisbelly/TrailUp (`trailup.vercel.app`) — **não** alvo de Reflect | README espelho |
| **Dokploy** | Hosting da API em VPS (substitui narrativa Render) | #289 Lab |
| **Sync Lab↔espelho** | Bot Sync traz `BitStudioLabs/trail-up` main → `Geisbelly/TrailUp` | [[05-PRs-Repos/pr-124-sync-espelho]] |
| **Hub bots** | Agentes: Testes, Sync, Validação PRs, Alertas, Análise de PRs, Issues, Supabase Free, Tradução reuniões, TCC TrailUp, Hub | [[07-Parceiros/bots]] |
| **turma JP 56** | Única turma remanescente no remoto após wipe 01/10 — não alterar | Incidente |
| **docker:up** | `npm run docker:up` → compose api+MS+frontend | package.json raiz |

← [[00-Home]]

- **FER+** — modelo de reconhecimento de expressão facial executado localmente na API (#305); câmera opt-in (#309).
- **PKCE** — extensão OAuth exigida no login Google (#270).
- **Advisory lock** — trava do Postgres que serializa migrações Alembic entre instâncias (#308).
- **Protótipo v4 / tela larga** — redesign da web do aluno (#346–#413).
