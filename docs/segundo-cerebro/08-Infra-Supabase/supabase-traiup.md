---
tags: [infra, supabase]
updated: 2026-10-01
---

# Supabase — projeto TraiUp

| Campo | Valor |
|-------|-------|
| Nome do projeto | **TraiUp** (grafia do console Supabase) |
| Ref / project id | `xrebtkmdewolzmpsdwgh` |
| Plano | **Free** |
| Região | us-west-2 (conforme guia de restore local) |
| Papel na stack | Postgres + Auth + Storage + RLS + Realtime — banco principal do TrailUp |

> **Não versionar secrets neste vault.** Envs locais ficam em `/workspace/trailup-envs/` (fora do vault). Nunca colar `DATABASE_URL`, JWT, `service_role` ou anon key aqui.

## O que a stack usa

- **API (FastAPI):** migrations via **Alembic**; orquestração IA; telemetria. Pode apontar para Postgres local quando o pooler remoto estiver bloqueado (a confirmar no ambiente do dia).
- **Frontend (console professor):** Vite/React em `:8080` local; prod web espelho em `https://trailup.vercel.app` — **testes Reflect NÃO usam o deploy Vercel**; usam Docker local.
- **Mobile (aluno):** Expo; fala direto com Supabase quando não há LLM (regra de fronteira do monorepo).
- **Microservice:** mídia BrainHex; também usa `.env` / Supabase conforme serviço.

## Limites do Free (fatos operacionais)

- Sem **backups diários baixáveis** no Dashboard.
- Sem **PITR** (Point-in-Time Recovery).
- Upgrade Pro / ligar PITR **agora** só protege o **futuro** — não recria snapshot de ontem.
- Prática recomendada: `supabase db dump` periódico e guardar **fora** do projeto (a confirmar rotina da Geisbelly).

## Dados críticos do console

- Turma **JP id 56** (“2026”) — **não alterar / não wipe** (única turma remanescente após incidente 2026-10-01).
- Detalhe do incidente e caminhos de restore: [[10-Incidentes/perda-dados-console-2026-10-01]].

## Deploys relacionados (não secrets)

| Ambiente | URL / nota |
|----------|------------|
| Web prod (espelho) | `https://trailup.vercel.app` |
| API prod | Dokploy (VPS) — ver docs Lab `#289` |
| Local Docker | frontend `:8080`, API `:8000`, MS `:3000` · `npm run docker:up` |

← [[00-Home]] · [[01-Arquitetura/mapa-arquitetura]] · [[10-Incidentes/perda-dados-console-2026-10-01]]
