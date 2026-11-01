---
tags: [incidente, api, alembic, deploy]
data: 2026-11-01
---

# API em 502: banco à frente do código publicado (01/11/2026)

| Campo | Valor |
|-------|-------|
| **Sintoma** | `https://api.trailup.promora.dev.br/health` respondia 502. O console e o app ficaram sem nada que dependesse da API: geração, insights e análise de telemetria. |
| **Janela** | de ~01:30 BRT (04:30 UTC) até pelo menos 03:42 BRT (06:42 UTC) |
| **Volta** | depois do merge da sync [#204](https://github.com/Geisbelly/TrailUp/pull/204) no espelho (03:47 BRT) e do redeploy no Dokploy |
| **Dados perdidos** | nenhum. O banco não foi tocado pela queda. |

## Causa

A API roda `alembic upgrade head` ao subir:

- `database_migrations_on_startup` vem ligado por padrão (`api/app/core/settings.py`);
- o `lifespan` de `api/app/main.py` chama `upgrade_database_to_head` antes de tudo.

Se o `upgrade` falha, a exceção sai do `lifespan`, a API não sobe e o Traefik devolve 502.

Em 01/11, isso aconteceu de duas formas:

1. **Banco à frente do código publicado.** Migrations da `main` do Lab foram aplicadas em produção (com autorização) antes de o código chegar ao espelho, de onde o Dokploy publica. No reinício seguinte, o código publicado não conhecia a revisão gravada em `alembic_version` e falhava com `Can't locate revision identified by '<rev>'`. Aconteceu duas vezes:
   - produção na `_10`, com o código publicado indo só até a `_08`;
   - produção na `_13`, com o espelho na `_12`.

   Reproduzido localmente.
2. **Duas cabeças na `main`.** Duas PRs com o mesmo número de revisão, `20261101_09` (#752 e #755), entraram quase juntas. Cada uma era linear sozinha, mas juntas deram `Multiple head revisions are present`. A #757 renumerou as falas do boss para a `_11`.

## Precedente

Em **28/10** o espelho já tinha caído com 502 por duas cabeças. A #699 alinhou a cadeia de 26/10–27/10 com a produção e registrou o caso.

## O que mudou no processo

- Ao aplicar migration em produção, avisar que **a API só pode ser reiniciada depois que o código com essa migration estiver no espelho**, e abrir a sync na mesma hora.
- Depois de todo merge com migration, conferir `alembic heads` na `main`.
- Com a API em 502 depois de uma migration ou de um merge, testar a subida localmente com o código publicado e um banco descartável marcado na revisão de produção.
- **Recomendação em aberto:** desligar `DATABASE_MIGRATIONS_ON_STARTUP` no Dokploy e aplicar migration só por comando. Assim, banco e código fora de passo deixam de derrubar a API.

## Onde está registrado

- `CLAUDE.md`, em "Deploys" e "Repositórios".
- [[05-PRs-Repos/ultimo-sync-main]] (syncs #201–#205).

← [[10-Incidentes/README]] · [[00-Home]]
