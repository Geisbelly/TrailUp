---
tags: [pr, sync, espelho]
repo: Geisbelly/TrailUp
pr: 124
updated: 2026-10-01
---

# PR #124 — sync Lab → espelho

| Campo | Valor |
|-------|-------|
| Repo | [Geisbelly/TrailUp#124](https://github.com/Geisbelly/TrailUp/pull/124) |
| Título | `sync: BitStudioLabs/trail-up main → espelho` |
| Estado | **merged** por Geisbelly |
| Merged at | 2026-10-01 **16:43** America/Sao_Paulo (`19:43:47Z`) |
| Merge commit | `70a442c0490e564ce9011c0b662e1f9477a2d8f2` |
| Head | `sync/lab-main-into-mirror` |
| Base | `main` (antes: `9a2cab1`) |
| Escala | ~81 commits · +36k/−3.5k · ~870 arquivos |

## Modelo Lab ↔ espelho

```
BitStudioLabs/trail-up (main)  ──sync──►  Geisbelly/TrailUp (main)
        ▲ forge / PRs canónicos                 espelho público + Vercel
        │                                       NUNCA merge Geisbelly/* → Lab
        └── bot Sync TrailUp (só espelha)
```

- Fonte de verdade: **BitStudioLabs/trail-up** @ `b3a8de39…` (#292 tip no sync).
- Espelho: leitura, CI badge, homepage `trailup.vercel.app`.
- Após merge, Sync avisa **Testes** para smoke.

## Conflitos resolvidos (prioridade Lab)

1. `CLAUDE.md`
2. `api/alembic/versions/20260922_06_reaponta_url_material_para_gateway.py`
3. `api/tests/test_migrations.py`
4. `mobile/package.json`

Lab ~79 commits à frente do merge-base; espelho tinha ~37 exclusivos. **Sem force-push** na `main`.

## Relação com incidente de dados

Wipe do console ~16:40 BRT **no mesmo dia**; **não** atribuir automaticamente ao diff do #124 (sem DELETE óbvio). Ver [[10-Incidentes/perda-dados-console-2026-10-01]].

Baseline vault: [[05-PRs-Repos/ultimo-sync-main]] · Política: [[05-PRs-Repos/links-repos]]

← [[00-Home]]
