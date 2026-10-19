---
tags: [repos, github, pr]
synced_sha: b3a8de39b61edc4fc5b0e85145f27452406f5c37
synced_at: 2026-10-01 20:01 America/Sao_Paulo
---

# Repos & PRs — TrailUp

## Repositórios

| Repo | Papel | Regra |
|------|-------|-------|
| **[BitStudioLabs/trail-up](https://github.com/BitStudioLabs/trail-up)** | **Forge de record** — produto, PRs, código canónico | Usar para sync do vault, PRs, issues |
| **[Geisbelly/TrailUp](https://github.com/Geisbelly/TrailUp)** | Espelho / histórico pessoal (`trailup.vercel.app`) | **NUNCA mergear `Geisbelly/*`** no fluxo BitStudioLabs |

## Tip atual (confirmado neste baseline)

| Repo | Branch | SHA | Tip message | Quando (America/Sao_Paulo) |
|------|--------|-----|-------------|----------------------------|
| BitStudioLabs/trail-up | `main` | **`b3a8de39b61edc4fc5b0e85145f27452406f5c37`** | fix(docs): repara mojibake e tira o BOM… (#292) | 2026-10-01 10:54 |
| Geisbelly/TrailUp | `main` | `70a442c0490e564ce9011c0b662e1f9477a2d8f2` | sync: BitStudioLabs/trail-up main → espelho (#124) | 2026-10-01 ~16:43 |

Detalhe do sync: [[05-PRs-Repos/ultimo-sync-main]]

## Política

- ❌ Não abrir merge de branches `Geisbelly/*` no BitStudioLabs sem aprovação explícita.
- ❌ Não “sincronizar” automaticamente Geisbelly → BitStudioLabs.
- ✅ Referenciar ambos no vault; PRs documentados apontam para BitStudioLabs.
- ✅ Clones / leitura de Geisbelly/TrailUp OK para comparação.
- ⚠️ **cursor-github MCP** (App Cursor) só lista a conta **Geisbelly** e **não consegue** ler `BitStudioLabs/trail-up` até o repo ser concedido ao GitHub App. Sync via `gh`/git (colaborador) funciona.

## Stack real em main (confirmada)

| Componente | Pasta / tech |
|------------|----------------|
| API / orquestração IA | `api/` — FastAPI · LangGraph · Alembic |
| App estudante | `mobile/` — Expo · React Native |
| Interface professor | `frontend/` — Vite · React · TS |
| Microsserviço multimídia | `microservice/` — Node · TS |
| RAG / Evidence Base | docs + ingestão API; vector store alvo = **pgvector** (ADR-0001) |
| Banco | Supabase Postgres |
| Models M2 | `models/m2_knowledge_tracing/` |

## Modelo de sync Lab ↔ espelho

1. Desenvolvimento e PRs canónicos em **BitStudioLabs/trail-up**.
2. Bot **Sync TrailUp** abre PR no espelho (ex. [[05-PRs-Repos/pr-124-sync-espelho|PR #124]]) trazendo `main` Lab → Geisbelly/TrailUp.
3. **Geisbelly** faz o merge no espelho (bots não mergeiam `Geisbelly/*`).
4. Após merge, Sync avisa **Testes** para smoke (Docker local / Reflect — não Vercel).
5. ❌ Nunca espelho → Lab automático.

Homepage espelho: `https://trailup.vercel.app` · CI: `.github/workflows/ci.yml` (path-filter por serviço + job docs encoding).

## Issues Lab (amostra 2026-10-01)

| # | Estado | Tema |
|---|--------|------|
| #18 #38 #89 #90 #92 #93 #99 | closed (~20:59–21:01 BRT) | docs mental state / telemetria (exemplos Lab) |
| #216 | open | Avaliar modelo Jev (TypeSafe) |
| #217 | open | Login Google mobile não conclui |
| #214 #218 #219 #195 … | open | redesign console, RAG/mobile, área web aluno, LGPD |

## Placeholder PRs (preencher aos poucos)

| PR | Repo | Status | Nota |
|----|------|--------|------|
| #292 | BitStudioLabs/trail-up | merged (tip) | docs encoding/BOM |
| #284 | BitStudioLabs/trail-up | merged | dashboard Insights |
| #279/#278/#277 | BitStudioLabs/trail-up | merged | docs RAG pipeline / sensíveis / triagem |
| [#124](https://github.com/Geisbelly/TrailUp/pull/124) · [[05-PRs-Repos/pr-124-sync-espelho\|nota]] | Geisbelly/TrailUp | **merged** 16:43 BRT | Sync Lab→espelho; user mergeou |

← [[00-Home]] · [[01-Arquitetura/mapa-arquitetura]] · [[05-PRs-Repos/ultimo-sync-main]] · [[05-PRs-Repos/pr-124-sync-espelho]]
