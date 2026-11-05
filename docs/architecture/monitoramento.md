# Monitoramento de disponibilidade

Como o TrailUp descobre que algo caiu, e o que fazer para ligar cada parte. As métricas, as metas e o motivo de cada uma estão em [`docs/analises/2026-11-05-metricas-e-metas-de-desempenho.md`](../analises/2026-11-05-metricas-e-metas-de-desempenho.md).

## Onde ver

Console web, aba **Painel técnico**, só para o dono (`app_e_dono()`):

- **Disponibilidade:** API, console e web do aluno, incidentes, o que os aparelhos relatam, modelo, banco e alertas.
- **Acessos:** ativos sobre matriculados, acessos, plataformas e a lista por aluno.
- **Geração e fila:** o painel técnico da #21.

A tela lê o Supabase direto. O HTML `/admin/professores` da API continua só para liberar professor: um painel servido pela API cairia junto com ela.

## O que é medido

| Alvo | URL | Em aula | Fora de aula | Conta como boa |
|---|---|---|---|---|
| `api` | `https://api.trailup.promora.dev.br/health` | 1 min | 1 min | 2xx com `"status":"ok"` |
| `console` | `https://trailup.vercel.app/version.json` | 1 min | 5 min | 2xx com `build_commit` |
| `web_aluno` | `https://trailup.vercel.app/aluno/` | 1 min | 5 min | 2xx com `id="root"` |

A meta (99,5%) vale em horário de aula, nos últimos 28 dias. O orçamento é 0,5% dos minutos de aula desde a primeira sonda. O número de todo horário, em 30 dias, é informativo, e queda fora de aula também avisa por e-mail.

O app não tem sonda: ele fala com o Supabase. O que ele relata de falha ao chamar a API vem de `telemetria_lotes.fallback_motivo`.

O microservice não é sondado: não tem URL pública conhecida. Para sondar outro serviço, basta uma linha em `monitor_alvo`.

## O que precisa estar configurado

1. **Apps Script:** `apps_script_email_url` e `apps_script_email_segredo` no Vault, como já estão para o contato. Sem eles o aviso fica só no sino, e `monitor_alerta.erro` diz o motivo.
2. **Destino:** `monitor_email_destino` em `app_config`. Sem a chave, vale `dono_email`.
3. **Batida (recomendado):** crie um check no Healthchecks.io com período de 5 min e tolerância de 10 min, e guarde a URL no Vault como `monitor_batida_url`. O silêncio avisa que o `pg_cron`, o `pg_net` ou o Supabase pararam.
4. **Serviço externo (recomendado):** um monitor grátis apontado para `/health`, com e-mail próprio. É o único caminho que avisa com o Supabase fora. A comparação está no relatório.

A cota do Apps Script (100 destinatários por dia) é dividida com o contato e o aviso de conta inativa. Por isso o monitor tem teto de `emails_por_dia` (10).

## Como conferir depois de aplicar

Só leitura, em transação somente leitura:

```sql
BEGIN READ ONLY;
SELECT id, estado, ultima_sonda_em, ultima_versao FROM public.monitor_alvo;
SELECT alvo_id, ok, status, latencia_ms, motivo FROM public.monitor_sonda ORDER BY id DESC LIMIT 10;
SELECT assunto, enviado_em, tentativas, erro FROM public.monitor_alerta ORDER BY id DESC LIMIT 5;
ROLLBACK;
```

O primeiro e-mail real só sai em um incidente. Para testar o caminho inteiro, grave um alerta de propósito com `SELECT public.fn_monitor_alertar('teste:<data>', '[TrailUp] Teste', 'Teste do monitor.');` como `postgres`: é uma escrita em produção, então faça você mesma. Ele sai no tick seguinte.

## Definir o horário de aula

O banco não tem grade de aula, então a janela é global e fica em `monitor_config.aula`. O padrão é provisório: segunda a sexta, das 07:00 às 22:00, em Brasília. Quanto mais larga a janela, mais minutos contam e maior o orçamento. Férias e semanas sem aula entram em `sem_aula`:

```json
{"aula": {"dias": [1, 2, 3, 4, 5], "inicio": "19:00", "fim": "22:30", "sem_aula": [{"de": "2026-12-19", "ate": "2027-02-07"}]}}
```

`dias` usa 1 para segunda e 7 para domingo. Cada sonda grava se estava em aula no momento em que saiu, então mudar a janela só vale daí em diante.

## Ajustar limiares

`app_config.monitor_config` é JSON. Cada chave de primeiro nível substitui a do padrão inteira: ao mudar `slo`, escreva os três alvos. JSON inválido faz o monitor voltar ao padrão, sem parar.

## O que ainda não é medido

- Erro de tela, travamento e Web Vitals nos clientes (decisão 4 do relatório).
- Acessos ao console do professor.
- Requisições reais da API: taxa, erro e latência por rota.
- CPU, memória e disco do VPS.

Na lentidão, a janela de 15 min com mínimo de 10 sondas só alcança console e web do aluno em horário de aula: fora dele, com 5 min, são 3 sondas.
