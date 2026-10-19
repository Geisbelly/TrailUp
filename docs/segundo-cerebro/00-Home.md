---
tags: [moc, trailup, tcc]
updated: 2026-10-13
---

# TrailUp — Segundo Cérebro (TCC)

Mapa de conteúdo (MOC) do vault Obsidian do TCC TrailUp de **Geisbelly Victória Feitosa Moraes Domiciano** (CEULP/ULBRA — Ciência da Computação).

> Vault de documentação técnica + monografia.  
> **Separado** do vault [[07-Parceiros/bots|Segundo Cérebro Reuniões]] (só link; não misturar).

## Navegação

| Área | Nota |
|------|------|
| [[01-Arquitetura/mapa-arquitetura\|Arquitetura]] | Monorepo real em main (api / microservice / frontend / mobile) |
| [[02-Timeline/timeline\|Timeline]] | TCC 1 → UX → protótipo → TCC 2 / Evidence Base + syncs |
| [[03-Glossario/glossario\|Glossário]] | BrainHex, RAG, LangGraph, pgvector, Dokploy, etc. |
| [[04-Drive/inventario\|Inventário Drive]] | Árvore completa + links |
| [[05-PRs-Repos/links-repos\|Repos & PRs]] | BitStudioLabs/trail-up + Geisbelly/TrailUp (**nunca merge Geisbelly/***) |
| [[05-PRs-Repos/ultimo-sync-main\|Último sync main]] | SHA + changelog do baseline |
| [[06-Monografia/plano-capitulos\|Plano de capítulos]] | Alinhado à Monografia + Proposta (+ nota vs repo) |
| [[07-Parceiros/bots\|Parceiros / bots]] | Hub bots (Testes, Sync, Validação, Alertas, …) |
| [[08-Infra-Supabase/supabase-traiup\|Infra Supabase]] | TraiUp Free (sem secrets no vault) |
| [[09-Testes-Reflect/reflect-local\|Testes Reflect]] | Docker local only (:8080/:8000/:3000) |
| [[10-Incidentes/perda-dados-console-2026-10-01\|Incidentes]] | Wipe console ~16:40 BRT 01/10 |
| [[05-PRs-Repos/pr-124-sync-espelho\|PR #124 sync]] | Lab → espelho merged |
| [[CHANGELOG-vault\|CHANGELOG vault]] | Entradas de hoje |
| [[RELATORIO-INVENTARIO\|Relatório de inventário]] | Existe vs gaps |

## Notas dos parceiros (2026-10-01)

- [[05-PRs-Repos/arquitetura-prs-2026-10-01|Arquitetura de PRs]] (Análise de PRs) — pacote Turmas/Dashboard/migrations
- [[05-PRs-Repos/issues-loop-2026-10-01|Loop issues↔PRs]] (Issues TrailUp)
- [[05-PRs-Repos/validacao-espelho-2026-10-01|Validação espelho]] (Validação PRs) — gate Reflect #124
- [[09-Testes-Reflect/evidencias-avaliacao-2026-10-01|Evidências de avaliação]] (Testes) — Reflect P0 18/18, 68 casos
- [[10-Incidentes/perda-dados-console-2026-10-01|Incidente console vazio]] — causa do wipe **ainda aberta**

## Drive root

Pasta documentação: [Drive root](https://drive.google.com/drive/folders/1-hMe8qKLGvPTtDZ-b0HlvbSRwQhtZtug)

- [TCC 1](https://drive.google.com/drive/folders/1X6299D7OwCmhkZLMWO5DzseBPnhpjYqf)
- [TCC 2](https://drive.google.com/drive/folders/1uHRPRgx6gRoROcbltuLe6obDicWwmitL)

## Tese em uma frase

**TrailUp**: plataforma adaptativa de aprendizagem com personalização por perfil (BrainHex), gamificação, telemetria e IA (orquestração LangGraph + RAG de evidências), originalmente proposta como *NeuroNauta* / app gamificado com IA emocional.

## Status do vault

- Inventário Drive: ✅ (2026-10-01 ~18:40 America/Sao_Paulo)
- Skeleton Obsidian: ✅
- Plano de capítulos: ✅ (espelha Monografia TrailUp.docx)
- **Sync BitStudioLabs/trail-up `main`:** ✅ (2026-10-13 ~13:25 America/Sao_Paulo) — SHA `b5491b02` (#413; delta 99 commits desde `b7e74cdd`) → [[05-PRs-Repos/ultimo-sync-main]]
- Pastas **08 Infra / 09 Reflect / 10 Incidentes** + CHANGELOG: ✅ (2026-10-01 ~20:15 America/Sao_Paulo)
- Incidente dados console: documentado → [[10-Incidentes/perda-dados-console-2026-10-01]]

## Espelho Drive (escrita)

Pasta canônica de sincronização do vault (escrita): [Segundo-Cerebro-TCC-TrailUp](https://drive.google.com/drive/folders/1WNbaeGg2VS3p8BfCtGlnf_XW29jUZIxW)

Docs TCC históricos (leitura): [pasta antiga](https://drive.google.com/drive/folders/1-hMe8qKLGvPTtDZ-b0HlvbSRwQhtZtug)

## Regra de sincronização

Manter este vault alinhado à **main** de [BitStudioLabs/trail-up](https://github.com/BitStudioLabs/trail-up). Nunca mergear PRs em repos `Geisbelly/*`.
