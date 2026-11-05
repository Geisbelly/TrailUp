# Monitoramento de disponibilidade

Como o TrailUp descobre que algo caiu, e o que fazer para ligar cada parte. As métricas, as metas e o motivo de cada uma estão em [`docs/analises/2026-11-05-metricas-e-metas-de-desempenho.md`](../analises/2026-11-05-metricas-e-metas-de-desempenho.md).

## Onde ver

Console web, aba **Painel técnico**, só para o dono (`app_e_dono()`):

- **Disponibilidade:** API, console e web do aluno, incidentes, o que os aparelhos relatam, modelo, banco e alertas.
- **Clientes:** erros, Web Vitals e chamadas vistos de dentro do console, da web do aluno e do app.
- **Acessos:** ativos sobre matriculados, acessos, plataformas, a lista por aluno e os acessos ao console.
- **Geração e fila:** o painel técnico da #21.

A tela lê o Supabase direto. Um painel servido pela API cairia junto com ela. Pelo mesmo motivo, liberar professor, vínculo com aluno, molduras e auditoria da economia têm a aba Administração do console, com funções `admin_*` no banco (`20261105_18`).

## O que é medido

| Alvo | URL | Intervalo | Conta como boa |
|---|---|---|---|
| `api` | `https://api.trailup.promora.dev.br/health` | 1 min | 2xx com `"status":"ok"` |
| `console` | `https://trailup.vercel.app/version.json` | 1 min | 2xx com `build_commit` |
| `web_aluno` | `https://trailup.vercel.app/aluno/` | 1 min | 2xx com `id="root"` |

A meta (99,5%) vale 24 horas por dia, todos os dias, nos últimos 28 dias. O orçamento é 0,5% de todos os minutos desde a primeira sonda: cerca de 3h22 em 28 dias. O TrailUp é um app, não tem horário de funcionamento (`20261105_19`).

O app não tem sonda: ele fala com o Supabase. O que ele relata de falha ao chamar a API vem de `telemetria_lotes.fallback_motivo`.

O microservice não é sondado: não tem URL pública conhecida. Para sondar outro serviço, basta uma linha em `monitor_alvo`.

## O que os clientes relatam

As sondas veem o site de fora. Tela branca, rede da escola, build antigo e RLS recusando só aparecem de dentro. A gravação é própria, no Supabase, sem passar pela API (`20261105_14`):

- `cliente_sessao`: uma linha por sessão, com contadores acumulados. Reenviar não conta duas vezes.
- `cliente_erro`: uma linha por assinatura, dia, superfície e versão, com até 50 sessões para contar pessoas afetadas.

O coletor é o mesmo arquivo em `frontend/src/lib/saude/coletor.ts` e `mobile/src/services/saude/coletor.ts`, e um teste confere isso. Ele grava no aparelho antes de enviar e tenta a cada minuto, ao sair da tela e ao ir para o segundo plano. Sessão nova começa ao abrir ou depois de 30 min sem uso.

| Medida | Console | Web do aluno | App |
|---|---|---|---|
| Erro não tratado e promessa rejeitada | sim | sim | sim |
| Tela derrubada (`ErrorBoundary`) | sim | sim | sim |
| Erro fatal do JS | não se aplica | não se aplica | sim |
| LCP, INP, CLS | sim | sim | não se aplica |
| Abertura até a sessão resolvida (`inicio_ms`) | não | não | sim |
| 5xx, sem resposta e operação crítica | sim | sim | sim |
| Fallback da API | sim | não | não |

Operação crítica: no console, login, salvar trilha e `duplicar_*`; no aluno, login, `topico_aluno` e escrita em `atividade_aluno` ou `conteudo_aluno`. A lista está no código (`destinoCriticoDoConsole`, `destinoCriticoDoAluno`).

Erro em `tela` ou `fatal` que atinge 2 pessoas em 7 dias, na mesma versão, manda e-mail e sino uma vez. O número fica em `monitor_config.clientes.pessoas_alerta`.

### O que fica de fora de propósito

- **Texto e identificador.** Nada de stack, URL completa ou texto digitado. A mensagem chega sem e-mail, URL, UUID, número longo e texto entre aspas duplas, e o banco repete a limpeza. Rota e destino vêm normalizados.
- **Quem não fez login.** `anon` não grava. O erro fica no aparelho até haver sessão, então falha na tela de login de quem nunca entrou não chega.
- **Aluno sem coleta de desempenho aceita.** Nada sai do aparelho enquanto o registro não for `accepted` com `performanceEnabled`. A conta fica menor que o uso real. Reveja quando a decisão 7 do relatório fechar.
- **Build de desenvolvimento.** O coletor não liga com `import.meta.env.DEV` nem `__DEV__`.

### O que ela não vê

- **Crash nativo.** O processo morre antes do JS. Isso pede o Sentry, que depende de conta, de build novo e de análise de transferência internacional, e fica para outra PR. O proxy é sessão sem fim com retorno rápido.
- **App antigo.** A captura só existe no build que trouxer esta mudança. A web do aluno e o console passam a valer no deploy.
- **Site que nem carrega.** Quem não carregou não relata. Isso é da sonda.

`inicio_ms` para na sessão resolvida, não na tela com dado. Serve para comparar versões, não para afirmar a meta de 3 s.

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

O caminho do e-mail foi conferido em 05/11/2026: o alerta de teste saiu no tick seguinte, na primeira tentativa, e chegou ao destino. Um incidente real ainda não gerou e-mail em produção. Para repetir o teste, grave um alerta de propósito com `SELECT public.fn_monitor_alertar('teste:<data>', '[TrailUp] Teste', 'Teste do monitor.');` como `postgres`: é uma escrita em produção, então faça você mesma. Ele sai no tick seguinte.

## Nomes que ficaram de quando havia janela

Até a `20261105_19` a meta valia em horário de aula. Os nomes `monitor_config.aula`, `monitor_sonda.em_aula`, `fn_monitor_em_aula` e os campos `*_aula*` do painel continuam por dentro, porque renomeá-los reescreveria funções já testadas. Hoje `aula` cobre todo dia, de `00:00` a `24:00`, e a tela não fala mais em aula.

Não restrinja `aula` de novo para reduzir sonda: isso tira da meta a queda de madrugada e de fim de semana.

## Ajustar limiares

`app_config.monitor_config` é JSON. Cada chave de primeiro nível substitui a do padrão inteira: ao mudar `slo`, escreva os três alvos. JSON inválido faz o monitor voltar ao padrão, sem parar.

## O que ainda não é medido

- Crash nativo e ANR do app (metade da decisão 4 do relatório).
- Requisições reais da API: taxa, erro e latência por rota.
- CPU, memória e disco do VPS.

Na lentidão, a janela de 15 min com mínimo de 10 sondas alcança os três alvos, porque todos rodam a cada minuto.
