---
tags: [incidente, supabase, dados]
date: 2026-10-01
updated: 2026-10-01
---

# Incidente — perda de dados do console professor (2026-10-01)

| Campo | Valor |
|-------|-------|
| Quando | **~16:40 America/Sao_Paulo** (01/10/2026) |
| Projeto | Supabase **TraiUp** `xrebtkmdewolzmpsdwgh` (Free, us-west-2) |
| Sintoma | Turmas/conteúdos do console professor vazios (ou quase) |
| Intacta | Turma **JP id 56** (“2026”) — **não alterar** |
| Correlação temporal | Mesmo dia do sync espelho [[05-PRs-Repos/pr-124-sync-espelho\|PR #124]] (merge ~16:43 BRT) |
| Causa no código do sync? | **Não** há evidência de `DELETE` óbvio no PR #124; restore ≠ “desfazer merge” |

## Limite Free

- Sem PITR e sem backups diários baixáveis no plano Free.
- Upgrade Pro / ativar PITR **após** o fato **não** inventa snapshot de ~16:40 BRT.

## Caminhos de recuperação (ordem)

1. **Dump / SQL / CSV antigo** que a Geisbelly (ou colega) já tenha — único restore real no Free.  
   - Não restaurar “cego” em cima da turma JP 56.  
   - Preferir staging ou import seletivo (turmas Ulbra/Admin), conferir FKs, depois produção com janela.
2. **Upgrade Pro + Scheduled backups** — só útil se já existir snapshot **antes** de ~16:40; lista vazia após upgrade = sem histórico Free.
3. **PITR (add-on Pro)** — se já estava ativo: restore ~16:35 BRT. Se não estava: só protege o futuro.
4. Sem dump/backup: **recriar manualmente** no console, pedir export antigo, ou Support Supabase (Free raramente recupera).

## Cuidados TraiUp

- Não `UPDATE`/`DELETE` na turma JP 56.
- Após restore: smoke Docker local (`:8080` / `:8000`) e login professor.
- Storage de arquivos **não** volta só com restore de DB (a confirmar se Assets foram afetados).

## Artefato local (box, não no vault)

Guia HTML gerado no dia: `/workspace/trailup-docs/guia-restore-pitr-traiup.html` (sem colar connection strings aqui).

## Status

- [ ] Dump pré-incidente localizado?
- [ ] Staging / import seletivo?
- [ ] Recriação manual das turmas Ulbra/Admin (se sem dump)?
- [ ] Rotina futura de `supabase db dump` documentada?

Infra: [[08-Infra-Supabase/supabase-traiup]] · Timeline: [[02-Timeline/timeline]]


## Drift de migrations (reportado pela Análise de PRs, 2026-10-13)

- **Banco de produção** em Alembic `20261003_06`; **código na main** (`b5491b02`) em `20261003_10` → faltam `20261003_07` (contato versionado), `_08` (URL local), `_09` (retenção ia_decision_logs), `_10` (consentimento provável).
- PRs #345, #347, #348, #359–#413 **sem** migrations; #349–#358 **ainda não verificados**.
- Espelho Geisbelly/TrailUp main em `8e08d7f`; PR [#127](https://github.com/Geisbelly/TrailUp/pull/127) (head `b49b2681`) já contém o tip do Lab `b5491b0`, **aguardando merge da Geisbelly** (bots não mergeiam Geisbelly/*).
- **Causa do wipe segue aberta** — o drift não é atribuição de causa.

← [[00-Home]]

## Nota Analise (alinhamento Hub)

Validação: código de sync sem DROP óbvio; hipótese env/sessão Vercel. Analise: pacote Turmas #273–#282 + dashboard #284 correlacionam no tempo — investigar em paralelo (UI empty state vs dados vs auth), sem fechar causa.
