---
tags: [incidente, gateway, deploy, lgpd]
data: 2026-11-05
---

# Gateway reaberto por deploy de branch antiga (05/11/2026)

| Campo | Valor |
|-------|-------|
| **Sintoma** | `GET` sem assinatura no `storage-redirect` deixou de dar 401, e o `POST` de links passou a dar 405 |
| **Janela** | alguns minutos na madrugada de 05/11; a hora exata não foi registrada |
| **Volta** | deploy da `main` com a #974. Medido depois: `GET` sem assinatura 401, `POST` sem sessão 401, assinatura forjada 403 |
| **Dados perdidos** | nenhum. Os logs não foram consultados, então não se sabe se algum link foi usado na janela |

## Causa

`supabase functions deploy` publica a pasta de onde roda. O passo passado depois da #974 não dizia de qual checkout rodar, e ele rodou no checkout principal, numa branch anterior à #929. Essa versão não tem `link.ts`: não confere assinatura nem emite link.

## Efeito

- Quem tivesse um link `?path=` de material existente conseguia baixar sem sessão.
- O console e o app 1.0.7 não conseguiam pedir link.

## O problema que motivou o deploy

Ligar `GATEWAY_EXIGE_LINK_ASSINADO=true` em 04/11 também cortou a leitura de servidor, o que o fechamento da #632 não previu. API e microservice faziam `GET` sem assinatura e levavam 401, sem erro visível: caíam no Storage, onde arquivo novo não existe. A #974 corrigiu.

Não custou geração: entre a exigência e o conserto nenhum `conteudo_personalizado` mudou, e os 4 jobs do período foram `missao_diaria`.

## O que ficou

- Deploy de Edge Function sai de um checkout com a `origin/main`.
- O comando de deploy vem sempre com a pasta de onde rodar.
- Leitura de servidor pede link, nunca monta `?path=`.

← [[10-Incidentes/README]]
