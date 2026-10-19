---
tags: [testes, reflect]
updated: 2026-10-01
---

# Testes Reflect — regras e escopo local

## Ambiente obrigatório

| Item | Valor |
|------|-------|
| Stack | Docker local (`npm run docker:up`) |
| Frontend | `http://localhost:8080` |
| API | `http://localhost:8000` |
| Microservice | `http://localhost:3000` |
| Mobile Expo | `:8081` (nativo; fora do compose) |

### Proibições

- ❌ **Não** gravar / executar Reflect contra `https://trailup.vercel.app` (espelho) como alvo de regressão do console.
- ❌ **Não** colar senhas / tokens no vault — Account Variables no Reflect (`TEACHER_EMAIL`, etc.).
- ❌ **Nunca merge** automático em `Geisbelly/*`.

## Papel do bot

Bot Hub **Testes** (Testes Trail-Up): regressão Reflect + API + microservices + mobile; relatório via **Alertas**.

## Checklist P0 (resumo — gerado ~13:35 BRT 2026-10-01)

Ordem sugerida de gravação:

1. **Homes críticos** (público, sem secrets) — ex. `TU-PUB-001` home `/`, `TU-PUB-003` `#perfis` (7 perfis BrainHex).
2. **Login** professor (form + válido → Segment; negativos leves).
3. **Console smoke** — gate anônimo + Visão geral + Trilha/Turmas + nav + logout.
4. **Aluno** — **bloqueado** até existirem Account Variables `STUDENT_*`.

Segment sugerido (login prof): `SEG-TU-LOGIN-PROF` (= passos de `TU-PUB-009`).

> Artefatos scratch no box (fora do vault): `trailup-reflect-p0-checklist.md`, `trailup-reflect-suite.md`, CSVs de casos — **não** copiar secrets dali.

## CI no monorepo (espelho / Lab)

Workflow `.github/workflows/ci.yml`:

- Filtro por pasta (`api`, `microservice`, `frontend`, `mobile`, `docs`).
- Jobs: encoding docs · ruff+pytest (api) · tsc+test (MS) · eslint+vitest+build (frontend) · lint Expo (mobile).

Smoke manual pós-incidente: validar login professor no Docker local após qualquer restore — ver [[10-Incidentes/perda-dados-console-2026-10-01]].

← [[00-Home]] · [[07-Parceiros/bots]] · [[01-Arquitetura/mapa-arquitetura]]
