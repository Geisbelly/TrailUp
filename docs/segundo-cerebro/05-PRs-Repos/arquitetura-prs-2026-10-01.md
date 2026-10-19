---
tags: [prs, arquitetura, lab]
fonte: Analise de PRs
repo: BitStudioLabs/trail-up
updated: 2026-10-01
---

# PRs Lab com impacto em arquitetura / docs (2026-10-01)

Baseline tip main: ver [[ultimo-sync-main]] (`b3a8de39…`, tip `#292`). Espelho: sync `#124` → `70a442c0`.

## Arquitetura / produto (merged)

| PR | Autor | Impacto |
|----|-------|---------|
| `#273`–`#276`, `#280` | JP-batista | Redesign **Turmas** (UI Fases 1–4): header, cards, form, exclusão, atalho trilha, matrículas/presença |
| `#281` | JP-batista | **Migration** `20260930_01_duplicar_classe` — duplicar turma via função no banco (Fase 5) |
| `#282` | JP-batista | **Migration** `20260930_02_matricula_enfileira_pelo_banco` — matrícula enfileira personalização (Fase 6) |
| `#284` | JP-batista | Dashboard fases 2–8 no main (+ `supabaseViews` / migrations `20260929_*`) |
| `#267` | JP-batista | Dashboard Fase 9 — jornada real + intervenções por passo |
| `#268` | JP-batista | Console — **Escriba** (assistente IA professor, Fase 10) |
| `#275` | 0spura | API — gate **M2** decide quando chamar LLM |
| `#291` | Geisbelly | API — remove `build_personalizacao_state` (morta) |

## Docs / ops (merged, citáveis)

| PR | Nota |
|----|------|
| `#283` | Inventário do **schema de produção que não está no git** — crítico pra monografia/infra |
| `#288` | Mapa coleta de métricas (captura → realimentação) |
| `#289` | API em **Dokploy** (não Render) |
| `#287` | Estágios de análise = heurísticas |
| `#277`–`#279` | Docs RAG (triagem, política sensíveis, pipeline) |
| `#269` | Protótipo web aluno v2 (mapa trilha) |
| `#292` / `#290` | UTF-8 / mojibake docs + API |

## Aberto (Lab) — não na main ainda

| PR | Status | Nota |
|----|--------|------|
| `#270` | draft, MERGEABLE | Google OAuth + PKCE mobile (Luis/`0spura`); conflito `mobile/package.json` resolvido 01/10; **não mergear** sem aceite |
| `#271` | draft, MERGEABLE | docs Jev evaluation / cost limits |
| `#293`–`#297` | MERGEABLE (Geisbelly) | fixes mobile/microservice/frontend types + CI |

## Hipótese incidente console vazio

Ver [[10-Incidentes/perda-dados-console-2026-10-01]]. Suspeitos de UI/schema do mesmo dia: pacote Turmas `#273`–`#282` + dashboard `#284`/`#267`/`#268`. Sync `#124` correlaciona no tempo; sem evidência de `DELETE` no merge do espelho.

## Escopo Analise

Lab `BitStudioLabs/trail-up` (triagem/conflitos). Não mergeia `Geisbelly/*`. Espelho/sync → Sync; testes → Testes; approve espelho → Validação.

## Atualização (Validação, ~20:20 BRT)

Validação reportou em `validacao-espelho-2026-10-01.md`: `ClassesManager`/`TrilhaSection` intactos no diff do sync; migrations do pacote Turmas/Dashboard **sem DROP**. Hipótese principal deles: **env/sessão no Vercel**, não wipe pelo merge #124. Mantém-se o pacote Turmas/Dashboard como contexto de mudança do dia; causa raiz do console vazio **não comprovada** no código do sync.
