---
tags: [arquitetura, trailup]
synced_from: BitStudioLabs/trail-up
synced_sha: b7e74cdd331a4b215d8b07cda5e3b338220f060d
synced_at: 2026-10-02 16:09 America/Sao_Paulo
---

# Mapa de arquitetura — TrailUp (main)

> Fonte de verdade: **[BitStudioLabs/trail-up](https://github.com/BitStudioLabs/trail-up)** `main` @ `b7e74cdd`.
> Documentação canónica no repo: [`docs/`](https://github.com/BitStudioLabs/trail-up/tree/main/docs), especialmente [`docs/README.md`](https://github.com/BitStudioLabs/trail-up/blob/main/docs/README.md), [`CLAUDE.md`](https://github.com/BitStudioLabs/trail-up/blob/main/CLAUDE.md).

## Monorepo (estrutura real em main)

| Pasta | Stack | Porta dev | Papel |
|-------|-------|-----------|-------|
| `api/` | Python · FastAPI · LangGraph · Alembic | 8000 | Backend / **orquestrador de IA** (personalização, RAG, telemetria→análise) |
| `microservice/` | Node · TypeScript (`api-brainhex`) | 3000 | **Gerador de mídia** (texto / TTS / slides) por perfil BrainHex |
| `frontend/` | Vite · React · TypeScript | 8080 | Web: landing + **console do professor** |
| `mobile/` | Expo · React Native | 8081 | **App do aluno** (consome personalização; fala também direto com Supabase) |
| `docs/` | Markdown | — | Documentação central (api, frontend, mobile, microservice, rag, tcc, adr, architecture…) |
| `models/` | pickle (scikit-learn) | — | Artefatos treinados (ex.: M2 knowledge tracing / gate) |
| `scripts/` | bash/ps1 | — | Orquestração local (`dev.sh` / `dev.ps1`) |
| `docker-compose.yml` | — | — | Dev: api + microservice + frontend (mobile nativo) |

Banco: **Supabase (Postgres + Auth + Storage + RLS)** — externo via `.env`. API hospedada no **Dokploy** (VPS), não Render.

### Migrations (Alembic)

- Cadeia linear em main (`b7e74cdd`, 2026-10-02): revisão `20260930_01` (`telemetria_lotes.analysis_error`) revisa `20260929_02` — evita duas heads partindo de `20260922_06` (CI `test_alembic_tem_uma_unica_cabeca_e_cadeia_continua`).
- Migrations em `api/alembic/versions/`; schema de produção pode divergir (`docs/architecture/schema-nao-versionado.md`).

```
                    ┌─────────────────┐
                    │  frontend (8080)│  console professor
                    └────────┬────────┘
                             │
┌──────────────┐    ┌────────▼────────┐    ┌──────────────────┐
│ mobile (8081)├───►│  api FastAPI    ├───►│ microservice     │
│ app aluno    │    │  LangGraph IA   │    │ midia BrainHex   │
└──────┬───────┘    └────────┬────────┘    └────────┬─────────┘
       │                     │                      │
       └──────────► Supabase ◄──────────────────────┘
                    Postgres / Storage / Realtime
```

## Regra de fronteira (fixa no repo)

> **A API é para IA** (LangGraph, RAG, geração, decisão adaptativa).  
> **Todo o resto é via banco** (CRUD, fila, sessão, progresso, entrega) — mobile → Supabase direto quando não há LLM.

Dívidas conhecidas documentadas em `CLAUDE.md`: telemetria em lote ainda na API; alguns endpoints de leitura de personalização com fallback Supabase.

## Personalização (duas camadas)

1. **Base por perfil** — material compartilhável `(classe × tópico × perfil BrainHex)`; gerado pelo microservice (7 perfis).
2. **Adequação por aluno** — camada leve (preferências, `agente_emocao`, `ai_patch` / estado mental, necessidades de grupo); **sem** regenerar mídia pesada por aluno.

Pipeline LangGraph (`api/app/agent/graph/`): supervisor + nós (`agente_perfil`, `agente_emocao`, `agente_conteudo`, `agente_geracao_midia`, `agente_ui`, `agente_trilha`, …).

Apresentação (deck/HTML) pode delegar a serviço externo **BrainHexPDF** (`BRAINHEXPDF_API_URL`).

## RAG / Evidence Base (estado em main)

- Arquitetura alvo: ingestão → chunking → embeddings → **Postgres `pgvector`** (ADR-0001) + document store (R2/Supabase) + relações em tabelas.
- Docs: `docs/architecture/rag.md`, `docs/rag/*` (inventário, triagem, pipeline corpus, política sensíveis), `docs/adr/0001-rag-vector-store.md`.
- Ciclo adaptativo já fechado com telemetria/emoção/comportamento → LangGraph → intervenção; **vector store / retrieval semântico ainda em construção** (schema/pgvector em branches/docs de sprint).

## Telemetria e métricas

- Coleta no mobile → `POST /api/v1/telemetria/lotes` → análise adaptativa na API.
- Mapa: `docs/architecture/coleta-de-metricas.md` (2026-09-30).
- ~~MVP sem FER/câmera~~ (#286, superado): desde **#305** (07/10) a API tem estágio de emoção com **FER+ local** (`emotion_vision.py`) no pipeline linear; termo v4 (#306) descreve a análise; câmera **off por padrão** (#309).
- **Web do aluno** redesenhada em tela larga (protótipo v4, #346–#413). OAuth Google com PKCE (#270). Migrações com advisory lock (#308).

## Progresso do aluno

- Percurso = **material personalizado**; conteúdo do professor é opcional/bônus.
- Percentual via trigger `trailup_recalcular_topico_aluno` — clientes **não** escrevem `percentual_concluido` / `status` em `topico_aluno`.

## Models (pesquisa → produto)

- `models/m2_knowledge_tracing/v3/` — `m2_model_v3.pkl` (acerto) e `m2_gate_v3.pkl` (risco de travar); código de treino em `core-trailup` (fora deste monorepo).

## Fontes Drive (contexto TCC, não código)

- [Fluxo TrailUp](https://docs.google.com/document/d/1-VMnQBMEiVdLseUCZ_uOXjdVLP_voTC47IMisr8YMlM/edit)
- [Proposta de TCC](https://docs.google.com/document/d/1JHcSE4fKUtWbyxG-HpqoDMoXWy7oqUWE0EZKLB_ndA0/edit)
- [Planilha componentes](https://docs.google.com/spreadsheets/d/1fVqm74SkPOuuU16bNfoJpmbrXzTvktwKAg5jRTEQoDY/edit)


## Deploys e ambientes (confirmado 2026-10-01)

| Ambiente | Onde | Portas / URL | Uso |
|----------|------|--------------|-----|
| **Local Docker** | `docker-compose.yml` · `npm run docker:up` | frontend **:8080**, api **:8000**, microservice **:3000** | Dev + **Reflect** (obrigatório) |
| **Mobile nativo** | Expo fora do compose | **:8081** | App aluno |
| **Web espelho** | Vercel ← Geisbelly/TrailUp | https://trailup.vercel.app | Demo; **não** usar em testes Reflect |
| **API prod** | Dokploy (VPS) | hosts `*.traefik.me` (Lab) | Bearer + Supabase Auth |
| **Banco** | Supabase projeto TraiUp | Free · ref `xrebtkmdewolzmpsdwgh` | Ver [[08-Infra-Supabase/supabase-traiup]] |

Envs locais: `/workspace/trailup-envs/` — **fora deste vault; sem secrets aqui**.

Repos: [[05-PRs-Repos/links-repos]] · Sync: [[05-PRs-Repos/pr-124-sync-espelho]] · Testes: [[09-Testes-Reflect/reflect-local]]

## TODO arquitetura (vault)

- [x] Estrutura real do monorepo BitStudioLabs/trail-up em main
- [ ] Diagrama C4 formal a partir de `docs/ecossistema/`
- [ ] Atualizar mapa quando pgvector/RAG indexação entrar em main
- [x] Linkar PRs relevantes em [[05-PRs-Repos/links-repos]] / [[05-PRs-Repos/pr-124-sync-espelho]]
- [x] Portas compose + regra Reflect local

Ver também: [[04-Drive/inventario]], [[06-Monografia/plano-capitulos]], [[05-PRs-Repos/links-repos]], [[05-PRs-Repos/ultimo-sync-main]]

## Drift de migrations (reportado pela Análise de PRs, 2026-10-13)

- **Banco de produção** em Alembic `20261003_06`; **código na main** (`b5491b02`) em `20261003_10` → faltam `20261003_07` (contato versionado), `_08` (URL local), `_09` (retenção ia_decision_logs), `_10` (consentimento provável).
- PRs #345, #347, #348, #359–#413 **sem** migrations; #349–#358 **ainda não verificados**.
- Espelho Geisbelly/TrailUp main em `8e08d7f`; PR [#127](https://github.com/Geisbelly/TrailUp/pull/127) (head `b49b2681`) já contém o tip do Lab `b5491b0`, **aguardando merge da Geisbelly** (bots não mergeiam Geisbelly/*).
- **Causa do wipe segue aberta** — o drift não é atribuição de causa.

### Nota 2026-10-13 — PRs abertos com migration (Lab)
- #354 (`20261011_01`) apontava `down_revision` para `20260930_02` (geraria duas heads). Corrigido no branch `feat/trilhas-fase-1-mapa` (commit `f806579`) para depois de `20261003_10`. Ainda não mergeado.
- #357 (`20261011_02`) segue `_01`, linha única após a correção.
- #349–#358 abertos; nenhum na main, então não explicam o wipe.
