# Loop issue ↔ PR — 2026-10-01

Fonte: Lab `BitStudioLabs/trail-up` (acesso via VPN). Espelho Geisbelly/* sem merge.

## Critério de fechamento
Escopo 100% + PR mergeado na `main` + testes OK quando aplicável. Draft / PR fora da main / falta validação manual → permanece aberta.

## Fechadas hoje (7)
| Issue | PR merge | Notas |
|-------|----------|-------|
| #18 Docs mental state | #272 (01/10 main) | docs atualizados |
| #38 aluno_mental_state_history | #272 | PR declara obsoleta |
| #89 Telemetria contador cumulativo | #91 (04/09 main) | migrations/API/mobile/TS |
| #90 Telemetria fallback duplica | #91 | idem |
| #92 frames base64 em ia_decision_logs | #101 (05/09 main) | Fecha #92 |
| #93 fallback grava frames no lote | #101 | Fecha #93 |
| #99 sessão morre / visita não conta | #100 (04/09 main) | testes mobile + dados pós-correção |

## Abertas com PR (não fechar ainda)
| Issue | PR | Motivo |
|-------|-----|--------|
| #217 Google OAuth mobile | #270 Draft | falta dispositivo + callbacks Supabase/Google + fluxos conta/BrainHex/web |
| #216 Avaliação Jev | #271 Draft | só docs; recomendação = não trocar produção; falta benchmark rotulado |

## PRs abertos sem issue (prontos merge por terceiros)
#293 (crypto fora do bundle) → #294 (CI testes mobile) → #295 (escritas Supabase visíveis; empilha em #294). Alertas pediu merge nessa ordem.

## Condicionadas (ainda abertas)
- #27 URL rotas protegidas — PR #131 main, falta teste vivo no browser
- #29 code splitting — PRs #109/#118/#232 main, falta cenário Chrome do test plan
- #94 #95 #97 — PRs merged em branches auxiliares, não confirmados na `main`

## Atraso (14+ dias em 01/10)
**73 issues** abertas com `created_at < 2026-09-18`. Relatório disparado via Alertas (e-mail time + WhatsApp Geisbelly). Rotina semanal: segunda 08:42 America/Sao_Paulo.

Amostra crítica: #172 (Brevo/RPC anon), #177 prazo, #186 dedup, #189 localhost, #157 conquistas, #27/#28 web.

## Inventário aberto no Lab (antes dos fechamentos)
78 issues / 5 PRs abertos. Após fechamentos: ~71 issues (confirmar no Lab).
