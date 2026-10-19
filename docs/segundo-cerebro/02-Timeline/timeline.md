---
tags: [timeline, trailup]
---

# Timeline TrailUp / TCC

Datas aproximadas a partir de `modifiedTime` do Drive (convertidas para BRT) + syncs do repo.

| Quando (BRT) | Marco | Evidência |
|--------------|-------|-----------|
| ~jul/2025 | Proposta de TCC (*NeuroNauta* / IA emocional) | Proposta de TCC (mod. 29/07/2025) |
| ~set/2025 | BrainHex papers + survey no TCC 1 | PDFs BrainHex; pasta TCC 1 |
| ~out/2025 | Pesquisa de validação (professores + CSV alunos) | Pasta Pesquisa |
| ~out–nov/2025 | Protótipos visuais + screens Expo | Pasta Protótipos (PNG/JPG) |
| ~nov/2025 | Fluxo TrailUp documentado | Fluxo TrailUp Doc |
| ~dez/2025 | Projeto UX final + Relatório Técnico + builds APK/AAB | UX Doc; Relatório; versao_0*.apk |
| ~abr/2026 | Build APK mais recente em Protótipos; docs/tcc no monorepo | application-44050a88…apk; `docs/tcc/` |
| ~jun/2026 | TCC 1 - Desenvolvimento atualizado; pasta Jornada criada (vazia); Geisbelly/TrailUp criado | TCC 1 Doc; Jornada; GitHub |
| ~ago/2026 | TCC 2: Datasets + Leituras (Iniciais); ADR pgvector; progresso professor opcional | BASE DE DADOS RAG…; ADR-0001 |
| ~set/2026 | Leituras Aprovadas + Resumos; Design assets; Monografia.docx; dashboard/insights; telemetria | TCC 2; PRs BitStudioLabs |
| **2026-10-01 ~16:40** | **Incidente:** perda de dados console professor no Supabase TraiUp (Free); só turma **JP id 56** restante; PITR indisponível | [[10-Incidentes/perda-dados-console-2026-10-01]] |
| **2026-10-01 ~16:43** | Espelho: merge [[05-PRs-Repos/pr-124-sync-espelho\|PR #124]] Lab `b3a8de39` → Geisbelly/TrailUp (`70a442c0`) | Sem force-push; conflitos priorizaram Lab |
| 2026-10-01 ~18:40 | Vault Obsidian + inventário Drive | este vault |
| **2026-10-01 ~20:01** | **BASELINE sync vault ↔ BitStudioLabs/trail-up `main`** | SHA **`b3a8de39b61edc4fc5b0e85145f27452406f5c37`** · [[05-PRs-Repos/ultimo-sync-main]] |
| **2026-10-02 ~16:09** | **DELTA sync vault ↔ BitStudioLabs/trail-up `main`** | SHA **`b7e74cdd331a4b215d8b07cda5e3b338220f060d`** · Alembic lineariza `20260930_01` após `20260929_02` · [[05-PRs-Repos/ultimo-sync-main]] |
| 2026-10-01 ~20:59–21:01 | Issues Lab fechadas (exemplos telemetria/docs): #18 #38 #89 #90 #92 #93 #99 | BitStudioLabs/trail-up |
| 2026-10-01 ~20:15 | Enrich vault: pastas 08/09/10 + CHANGELOG | [[CHANGELOG-vault]] |

## Fases lógicas

1. **Ideação / proposta** — NeuroNauta, hexagonal, FER
2. **UX Discovery** — questionário 50 alunos, BrainHex, persona Ana → Fluxo persona Maria
3. **Protótipo** — Figma + Expo/Play + Relatório Técnico
4. **TCC 1 desenvolvimento** — fundamentação BrainHex + trilhas
5. **TCC 2** — Evidence Base / RAG + monografia + design de jogo (totens, bosses, Lumi…)
6. **Produto monorepo** — api + microservice + frontend + mobile em BitStudioLabs/trail-up
7. **Avaliação em sala** — protocolo na monografia (caps. 4/7) — *em andamento / a executar*
8. **Ops / incidente 01/10** — wipe console Free; documentar restore + dumps futuros

9. **03/10** — lote segurança/RLS/CI (#293–#318), relatório W40
10. **07–09/10** — FER+ local (#305), câmera opt-in (#309), 12 migrations RLS/retenção/consentimento, OAuth PKCE (#270), Jev docs (#271), relatório W41
11. **12–13/10** — web do aluno tela larga v4 (#346–#413); tip `b5491b02` sincronizado no vault 13/10

← [[00-Home]] · [[05-PRs-Repos/ultimo-sync-main]] · [[10-Incidentes/perda-dados-console-2026-10-01]]
