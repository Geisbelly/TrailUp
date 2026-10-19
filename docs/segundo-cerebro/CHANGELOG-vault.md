---
tags: [changelog, vault]
updated: 2026-10-02
---

# CHANGELOG — vault TCC TrailUp

## 2026-10-02 (~16:09 America/Sao_Paulo) — TCC TrailUp (delta main)

### Atualizados

- `05-PRs-Repos/ultimo-sync-main.md` — tip Lab `b7e74cdd` (Alembic lineariza `20260930_01` → `20260929_02`); espelho `8e08d7f1` (#126)
- `02-Timeline/timeline.md` — entrada DELTA sync
- `01-Arquitetura/mapa-arquitetura.md` — SHA + nota Migrations (Alembic)
- `03-Glossario/glossario.md` — SHA + glossário Alembic
- `00-Home.md` — status sync

### Monografia

- Sem reescrita; nota opcional em cap. 5 / apêndice schema.

## 2026-10-01 (~20:21 America/Sao_Paulo) — Validação PRs TrailUp

### Criados

- `05-PRs-Repos/validacao-espelho-2026-10-01.md` — gate Reflect, #124/#125, diagnóstico console (env/UI vs wipe), acesso Lab via gh

## 2026-10-01 (~20:19 America/Sao_Paulo) — Sync TrailUp

### Atualizados

- `05-PRs-Repos/ultimo-sync-main.md` — recheck: Lab `b3a8de39` contido no espelho `70a442c0`; sem PR sync aberto; poll ok sem ação

# CHANGELOG — vault TCC TrailUp

## 2026-10-01 (~20:20 America/Sao_Paulo) — Testes Trail-Up

### Criados

- `09-Testes-Reflect/evidencias-avaliacao-2026-10-01.md` — o que a monografia pode citar (Docker, Reflect P0 18/18, inventário 68 casos, gates, limites do incidente Free)

## 2026-10-01 (~20:15 America/Sao_Paulo) — enricher 08/09/10

### Criados

- `08-Infra-Supabase/README.md`
- `08-Infra-Supabase/supabase-traiup.md` — projeto Free TraiUp (ref pública), limites Free, deploys; **sem secrets**
- `09-Testes-Reflect/README.md`
- `09-Testes-Reflect/reflect-local.md` — Docker only, P0 Reflect, CI path-filter
- `10-Incidentes/README.md`
- `10-Incidentes/perda-dados-console-2026-10-01.md` — wipe ~16:40 BRT, JP 56, restore paths
- `05-PRs-Repos/pr-124-sync-espelho.md` — PR #124 Lab→espelho (merged 16:43 BRT)
- `CHANGELOG-vault.md` (este arquivo)

### Atualizados

- `00-Home.md` — nav 08/09/10, PR #124, CHANGELOG, status enrich
- `01-Arquitetura/mapa-arquitetura.md` — deploys/portas/Reflect
- `02-Timeline/timeline.md` — sync #124, incidente, issues fechadas, fase ops
- `03-Glossario/glossario.md` — Alembic, Reflect, TraiUp, PITR, Hub bots, docker:up…
- `04-Drive/inventario.md` — pasta Segundo-Cerebro (escrita) + nota sync parent
- `05-PRs-Repos/links-repos.md` — modelo sync, CI, issues amostra, #124
- `06-Monografia/plano-capitulos.md` — lacunas de pesquisa
- `07-Parceiros/bots.md` — Análise de PRs, Supabase Free, lista Hub
- `RELATORIO-INVENTARIO.md` — ponteiros 08/09/10 (se patch aplicado)

### Fontes usadas (sem inventar)

- Google Drive MCP: root TCC, Segundo Cérebro / Segundo-Cerebro-TCC-TrailUp
- GitHub: Geisbelly/TrailUp README, compose, CI, PR #124; `gh` BitStudioLabs tip `b3a8de39` + issues
- Contexto local conhecido: envs path, incidente Free, bots Hub, Reflect P0
- Guia restore HTML local (só fatos; sem connection strings no vault)

### Não feito neste passe

- Upload Drive (parent sincroniza)
- Expandir Relatório Técnico.docx / inventário Datasets arquivo a arquivo
- Diagrama C4 formal

← [[00-Home]]

## 2026-10-01 (~20:20 America/Sao_Paulo) — Analise de PRs

- `05-PRs-Repos/arquitetura-prs-2026-10-01.md` — pacote Turmas/Dashboard/migrations + docs ops + abertos #270/#271/#293–297; link incidente console

## 2026-10-01 — Issues TrailUp
- `05-PRs-Repos/issues-loop-2026-10-01.md`: fechamentos + mapa PR↔issue + atraso 14d

- `05-PRs-Repos/pr-126-sync-tip.md`: sync tip sem issue

## 2026-10-13 (~13:25 America/Sao_Paulo) — TCC TrailUp sync main

- `ultimo-sync-main.md`: `b7e74cdd` → `b5491b02` (#413), 99 commits, changelog por área
- Timeline, mapa-arquitetura (FER+ #305 supera "MVP sem FER"), glossário (FER+, PKCE, advisory lock, v4)
- 00-Home e plano-capitulos: links às notas dos parceiros; caps. 7–8 evidências, cap. 9 incidente (causa aberta)
- Drift migrations (prod `20261003_06` vs código `20261003_10`) + espelho `8e08d7f`/#127 registrados em incidente e mapa-arquitetura
- 2026-10-13: nota de migrations dos PRs #354/#357 (down_revision corrigido em f806579, não mergeados).
