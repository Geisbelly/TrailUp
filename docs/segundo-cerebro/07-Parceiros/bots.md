---
tags: [parceiros, bots]
updated: 2026-10-01
---

# Parceiros / papéis de agentes

| Agente | Papel | Notas |
|--------|-------|-------|
| **TCC TrailUp** (este) | Vault Obsidian, monografia, inventário Drive, sync vault↔main | Path: `/workspace/tcc-trailup-vault/` · Drive escrita: [Segundo-Cerebro-TCC-TrailUp](https://drive.google.com/drive/folders/1WNbaeGg2VS3p8BfCtGlnf_XW29jUZIxW) |
| **Hub TrailUp** | Coordenação | |
| **Grok Bot** | Enricher + upload Drive do vault | Coordena sync para pasta Segundo-Cerebro |
| **Validação PRs TrailUp** | PRs no espelho Geisbelly/TrailUp e upstream BitStudioLabs | **Nunca merge Geisbelly/*** |
| **Issues TrailUp** | Issues ↔ PRs | BitStudioLabs + espelho |
| **Testes Trail-Up** | Regressão Reflect, API, microservices, mobile | Relatório via Alertas |
| **Sync TrailUp** | Mantém Geisbelly/TrailUp = main BitStudioLabs | Só sync; não mergear PRs do espelho |
| **Alertas** (Email/WhatsApp) | Alertas PRs/testes/sync | |
| **Análise de PRs** | Review / sumário de PRs Lab+espelho | a confirmar escopo exato |
| **Supabase Free** | Monitorar limites Free / dumps / alertas plano | Ver [[08-Infra-Supabase/supabase-traiup]] |
| **Tradução reuniões** | Granola → pt-BR | |
| **Segundo Cérebro Reuniões** | Atas / SQLite / glossário de reuniões | **VAULT SEPARADO** — só linkar |

## Hub (lista canônica de bots)

Testes · Sync · Validação PRs · Alertas · Análise de PRs · Issues · Supabase Free · Tradução reuniões · **TCC TrailUp** · Hub

## Vaults

- ✅ Este vault = TCC TrailUp (produto + monografia + Drive)
- 🔗 Segundo Cérebro Reuniões = **outro vault** (não duplicar atas aqui)

## Regras cruzadas

- Fonte de verdade do código: `BitStudioLabs/trail-up` `main`
- Espelho: `Geisbelly/TrailUp` — leitura / sync apenas
- Sem secrets no vault

← [[00-Home]]
