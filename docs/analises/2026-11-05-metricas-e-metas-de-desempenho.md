# Meça pouco e decida antes: metas do TrailUp

O TrailUp deve acompanhar poucos números, e cada um precisa mudar o que a dona faz. A base é uma disponibilidade por sonda com 99,5% provisório, um indicador de frescor da geração, a contagem de alunos afetados por falha e a fração da turma ativa por semana. O problema mais urgente não é a falta de métrica, e sim onde o SLO vale: medido 24x7 em 30 dias, 99,5% permite 216 minutos fora, e uma única queda às 23 h vista às 7 h gasta 480 minutos, mais que todo o orçamento. Medir só em horário de aula corrige isso, mas expõe um segundo ponto: com sonda de 5 minutos, console e web do aluno não têm resolução para essa meta. O maior ponto cego é outro: o app fala direto com o Supabase, então nenhuma das três sondas mede o app, e sem a captura de erro no cliente ninguém vê um crash. Percentual de crash, p99 e DAU/MAU não servem para 30 alunos, porque um aluno vale 3,3 pontos e p99 nem tem intervalo de confiança abaixo de 368 amostras. Nesse porte, a conclusão vem de contagem absoluta com denominador visível. Quase todas as metas abaixo são propostas: as únicas importadas de fora são limiares públicos, como Web Vitals e Android vitals. O próprio repositório pede cautela (`docs/architecture/mapa-dados-metricas-kpis.md` diz "Não inventar SLO ou metas"), por isso cada meta traz sua marca.

> **Decidido em 05/11/2026:** decisões 1 e 2 aceitas. O SLO vale em horário de aula, em 28 dias, com sonda de 1 min em aula, e isso já está na PR #981. A janela de aula é global e provisória (segunda a sexta, 07:00 às 22:00), porque o banco não tem grade. As contas abaixo que falam em 24x7 ou em 5 min descrevem o estado anterior à decisão.

## Decisões que a dona precisa tomar

O monitor descrito aqui está nas migrations `20261105_09` e `20261105_10`, ainda em revisão. Mudar um limiar ou uma meta é editar `app_config.monitor_config`, sem migration; a janela de aula também.

| # | Decisão | Opção recomendada | Motivo em uma frase |
|---|---|---|---|
| 1 | ~~Onde e em que janela o SLO vale~~ (decidida) | **Horário de aula, janela móvel de 28 dias, 99,5% provisório.** O 24x7 fica como informativo, com referência de 99%. | Sem plantão, o tempo de reação noturno domina o número e ele deixa de falar do aluno. |
| 2 | ~~Frequência da sonda de console e web do aluno~~ (decidida) | **1 min em horário de aula, 5 min fora dele.** Alternativa: manter 5 min e usar 99% nesses dois alvos. | Com 5 min, a menor queda declarada gasta 62% do orçamento de aula. |
| 3 | Quem vigia o monitor | **Ligar agora o `monitor_batida_url` (Healthchecks.io) e criar um monitor no UptimeRobot Free apontado direto para a API.** | Hoje, se o Supabase parar, a sonda e o e-mail param juntos. |
| 4 | Como capturar erro nos clientes | **Web: gravação própria com `web-vitals` no Supabase. App: Sentry Developer mais uma tabela enxuta.** Instalar antes da turma avaliada. | Só o Sentry vê crash nativo, e o app depende de novo build e de os alunos atualizarem. |
| 5 | Qual é a unidade de "acesso" | **Dia com acesso engajado como unidade principal; entrada fundida como secundária. Nenhuma meta de frequência por aluno.** | Dia não depende do corte de 30 min, e meta de frequência esbarra em Goodhart e no ECA Digital. |
| 6 | Qual é o prazo de "material pronto" | **Antes da próxima aula da turma, confirmado com a professora.** | O prazo que importa é o de quem usa o material, não a velocidade do modelo. |
| 7 | Papel jurídico e documentos do painel | **Definir por escrito quem é a controladora e fazer teste de balanceamento e RIPD curto antes de abrir a lista por aluno com turma real.** | O desenho está bom, mas a demonstração ainda não existe. |

Três ações não precisam de decisão, apenas de execução. Criar um `/live` sem dependência. (O `/health`, que informava o worker como `"running"` sem testar `.done()`, já foi corrigido junto com o monitor.) Conferir `retencao_modo`, porque em `simular` nada é apagado e o banco só cresce. Escrever a política de orçamento de erro em uma página (seção própria abaixo).

## Como ler as metas

Cada meta traz uma destas marcas. **Fonte externa:** o limiar vem de documento público citado. **Cálculo próprio:** resulta de conta reproduzível. **Proposta:** é ponto de partida e deve ser recalibrada depois de 4 semanas letivas de linha de base. Quando uma linha combina duas marcas, o limiar vem de fora e a adaptação é nossa.

Os três quadros clássicos têm papéis diferentes. Sinais de ouro são latência, tráfego, erros e saturação ([SRE Book](https://sre.google/sre-book/monitoring-distributed-systems/)). RED mede taxa, erros e duração de um serviço ([Wilkie](https://www.slideshare.net/kausalco/the-red-method-how-to-instrument-your-services)). USE mede utilização, saturação e erros de um recurso ([Gregg](https://www.brendangregg.com/usemethod.html)). Aqui, RED e sinais de ouro geram os indicadores do que o usuário sente, e USE fica para diagnóstico, sem SLO. A fila não é serviço de requisição: pede indicador de frescor, correção e completude ([SRE Workbook](https://sre.google/workbook/data-processing/)).

Com tão pouco tráfego, nenhuma forma de medir basta sozinha. Sonda dá sinal constante, mas não representa o uso real ([Hauer et al.](https://www.usenix.org/system/files/nsdi20spring_hauer_prepub.pdf)). Requisição real mostra o que aconteceu, mas fica sem amostra na maior parte do tempo, e fatias de tempo não funcionam com dado esparso ([Nobl9](https://docs.nobl9.com/guides/slo-guides/slo-calculations/)). Por isso o relatório usa dois indicadores, sem misturar: minutos bons por sonda para disponibilidade, e razão de eventos reais em janela longa para latência e erro.

A regra para concluir com poucos dados é esta (**Cálculo próprio** nos intervalos, **Proposta** nos cortes):

| Tipo de número | Regra |
|---|---|
| Contagem da turma | Sempre "21 de 30". É censo, então não leva intervalo. Percentual só com n ≥ 20. Variação de 1 a 3 alunos não recebe destaque: 24 de 30 e 21 de 30 têm intervalos de 63–91% e 52–83%. |
| Percentil | p50 sempre; p95 com n ≥ 200; p99 só com n ≥ 368, porque o intervalo bilateral de 95% não existe abaixo disso. |
| Latência como meta | Use "% abaixo do limiar", que soma entre janelas. É o formato do próprio [Workbook](https://sre.google/workbook/implementing-slos/). |
| P75 de Web Vitals | n < 30: mediana, máximo e valores. 30 a 99: passa só se o limite superior ficar abaixo do limiar; caso contrário, inconclusivo. n ≥ 100: P75 normal. |
| Zero falha | Escreva "0 crash em N sessões, taxa real abaixo de 3/N com 95%" ([regra de três](https://www.statology.org/a-concise-guide-to-the-statistical-rule-of-three/)). Nunca "100% crash-free". |
| Janela | 28 dias decidem e 7 dias só avisam. Semana sem aula sai do denominador. Quatro semanas sem aula não podem aparecer como "100%". |

## O SLO provisório precisa mudar de denominador

O SLO de 99,5% é razoável como número, mas a janela atual o torna frágil. Nem o Supabase Free nem o Gemini gratuito têm SLA: o compromisso de 99,9% do Supabase é só do Enterprise ([Supabase SLA](https://supabase.com/sla)), e os termos do Gemini não mencionam disponibilidade ([Termos](https://aistudio.google.com/docs/terms)). O IP da API pertence à Hetzner, mas isso não confirma o contrato; se for Hetzner Cloud, o SLA é de 99,9% por servidor, e o remédio é crédito ([Hetzner](https://docs.hetzner.com/general/company-and-policy/slas-cloud/)). O Google aconselha começar frouxo e ter o mínimo de SLOs ([SRE Book](https://sre.google/sre-book/service-level-objectives/)), e a meta deve ser defensável sem esgotamento ([Workbook](https://sre.google/workbook/implementing-slos/)). Por isso 99,9% fica de fora: exigiria segundo nó, plantão e dependências com compromisso.

| Meta (**Cálculo próprio**) | 30 dias, 24x7 | 28 dias, 24x7 | Aula: 80 h em 4 semanas (hipótese) | 1 h fora gasta (30 d / aula) |
|---|---|---|---|---|
| 99% | 432 min | 403 min | 48 min | 14% / 125% |
| 99,5% | 216 min | 202 min | **24 min** | 28% / 250% |
| 99,9% | 43,2 min | 40,3 min | 4,8 min | 139% / 1.250% |

A mudança para horário de aula tem um custo que convém enxergar. A meta deixa de perdoar queda noturna, que passa a não contar, e passa a ser bem mais dura com queda em aula: 24 minutos contra 216. Para a API, com sonda de 1 min, a detecção leva de 3 a 4 min e a meta é viável. Para console e web do aluno, com sonda de 5 min, são cerca de 960 sondas em 80 h, e 99,5% aceita menos de 5 sondas ruins. A menor queda declarada (3 sondas, 15 min) gasta 62% do orçamento, e a detecção pode levar de 15 a 20 min se a resposta for lida na rodada seguinte, como exige o pg_net ([Supabase](https://supabase.com/docs/guides/database/extensions/pg_net)). Daí a decisão 2. Se a linha de base mostrar que 24 min é irreal, a saída honesta é 99% em aula (48 min), e não voltar para o 24x7.

O horário de aula exige um calendário, e a grade pode não existir no banco. A versão mínima é uma janela global de dias e horas no banco, com as semanas sem aula marcadas. A alternativa de "últimos 20 dias letivos" resolve o problema das férias.

Os três SLOs recomendados são poucos de propósito, dentro do limite de cinco tipos do [Workbook](https://sre.google/workbook/implementing-slos/). São a disponibilidade por sonda nos três alvos, a latência real da API (quando houver dado) e o frescor da geração. Todo o resto é indicador de diagnóstico.

## Regras de queda, instabilidade e lentidão que valem hoje

Os termos não têm definição canônica em SRE, então a regra escrita é a definição. Qualquer texto do TCC deve apresentá-las como definições operacionais do projeto (**Proposta**).

| Termo | Regra implementada | Efeito e pontos de revisão |
|---|---|---|
| Queda | 3 sondas ruins seguidas | API: aviso em 3 a 4 min. Não há número oficial; 3 é julgamento a calibrar. Absorve parte dos deploys. O tempo real de um restart não foi medido. |
| Volta | 2 sondas boas seguidas | As notas sugeriam 3. Manter 2 é aceitável, porque a regra de 2 quedas em 6 h pega a oscilação. Rever se a linha de base mostrar volta falsa. |
| Instabilidade | Falhas soltas ≥ 3 e ≥ 5% em 60 min, ou 2 quedas em 6 h | O corte de 5% hoje não altera nada: 3 falhas em até 60 sondas já são pelo menos 5%. Para console e web, 3 de 12 são 25%. Pode ser simplificado ou mantido por segurança. |
| Lentidão | 50% das sondas acima de 3 s em 15 min | Latência é proxy, com a espera do pg_net. Serve de alerta, não de SLI. Em 5 min, são 2 de 3 sondas: amostra fraca. O `/health` medido de fora levou 1,34 a 1,40 s, então a folga é de cerca de 1,6 s, e a medida a partir do Supabase pode ser outra. |

A regra de instabilidade substitui bem o alerta por taxa de queima. A técnica multijanela foi calibrada para volume alto: com 10 requisições por hora, uma falha já é queima de 1.000x ([Workbook](https://sre.google/workbook/alerting-on-slos/)). O alerta rápido do livro corresponde a 2% do orçamento em 1 h, cerca de 4 minutos em 99,5%, e 3 falhas soltas em 60 min ficam nessa faixa (**Cálculo próprio**). Não use taxa de queima sobre requisição real. A regra de 3 sondas seguidas parece o `for:` que o livro desaconselha, mas sonda é quase binária e a regra de instabilidade cobre os picos repetidos, que são o ponto cego apontado.

Três classificações devem ser conferidas na revisão. Pedido sem resposta do pg_net é estado desconhecido da sonda, e não queda da API, portanto não deve entrar no cálculo. Sucesso deve exigir status 200 e corpo válido, seguindo a lição do Apps Script, que devolve 200 até em erro. O timeout deve ser explícito, em torno de 10 s, porque as fontes divergem sobre o padrão, 2 s ou 5 s ([doc](https://supabase.com/docs/guides/database/extensions/pg_net), [README](https://github.com/supabase/pg_net)).

Médias de incidente não entram como meta. O Google considera MTTR pouco adequado para decisão ou tendência ([Incident Metrics in SRE](https://sre.google/resources/practices-and-processes/incident-metrics-in-sre/)), e a duração é assimétrica, o que favorece a mediana ([InfoQ](https://www.infoq.com/articles/analyzing-incident-data/)). Registre início, detecção, mitigação e resolução de cada incidente. Relate a lista, a mediana, o mínimo, o máximo e n. O tempo até detectar é o mais útil, porque depende do intervalo da sonda.

## Tabelas de métricas por superfície

### API

| Métrica | O que analisar | Como medir | Por quê | Meta e justificativa | Marca |
|---|---|---|---|---|---|
| Disponibilidade | Sondas boas ÷ sondas válidas | pg_cron + pg_net a cada 1 min (existe) | Sinal constante, sem depender de aluno | 99,5% em horário de aula, 28 dias. Informativo: 99% em 24x7. Hoje: 99,5% em 24x7, 30 dias | Proposta; minutos: Cálculo próprio |
| Quedas | Número, duração, hora, causa | Estado da sonda e registro do incidente (existe em parte) | Mostra o que a porcentagem esconde: 10 s toda hora é diferente de 6 h por trimestre ([Hauer](https://www.usenix.org/system/files/nsdi20spring_hauer_prepub.pdf)) | Sem meta de MTTR. Incidente acima de 20% do orçamento gera análise curta ([Google](https://sre.google/workbook/error-budget-policy/)) | Fonte externa, adaptada |
| Instabilidade e lentidão | Episódios por semana, em aula | Regras acima (existe) | Pega o que fica abaixo da regra de queda | Sem número no início; fixar depois da base | Proposta |
| Erro real | 5xx e timeouts ÷ requisições, por rota | Contador em memória por rota-modelo, gravado a cada 5 min e descartável (falta) | Sonda verde não prova que a geração funciona | ≤ 0,5% em 28 dias; abaixo de 600 eventos, só contagem | Proposta |
| Latência real, sem LLM | % abaixo do limiar | Baldes de 0,1; 0,3; 1; 3; 10; 30; 100 s (falta) | Proporção diz quantos esperaram demais | 90% < 1 s e 99% < 3 s (relatar a segunda só com n ≥ 368). 1 s mantém o fluxo de pensamento ([NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)) | Limiar: Fonte externa; meta: Proposta |
| Latência real, com LLM | % abaixo do limiar | Igual | Espera longa pede indicador de progresso | 90% < 10 s, com progresso visível. 10 s é o limite de atenção ([NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)) | Limiar: Fonte externa; meta: Proposta |
| Tráfego | Requisições por rota e por hora | Mesmo contador (falta) | Dá o denominador que decide tudo aqui | Sem meta | — |
| API vista pelo cliente | Lotes com `via = 'direta'`, por `fallback_motivo` | SQL em `telemetria_lotes`, filtrando `payload->'cliente'` (existe) | Disponibilidade sentida, sem código novo | Sem meta; tendência diária. Build antigo entra como não classificado | Proposta |
| Saturação do VPS | Disco, memória e swap, CPU com steal, reinício de contêiner | Cron do host pingando o Healthchecks com `df` e memória; olhar o Dokploy (falta) | Explica a causa; alerta que nasce no VPS morre com ele | Disco ≥ 80% gera e-mail. Sem SLO | Proposta |
| Deploy | Minutos fora por deploy, em aula | Marca de manutenção no estado da sonda (falta) | Mudanças respondem por cerca de 70% das quedas, no exemplo do [Google](https://sre.google/workbook/error-budget-policy/); a API roda migration ao subir | Nenhum deploy em horário de aula, salvo correção | Proposta |

O SLI da API precisa dizer por escrito o que cobre: geração, personalização e análise. Pela regra de fronteira, API fora do ar não é TrailUp fora do ar.

### Fila e IA

No tier gratuito, o recurso escasso é a cota, não o dinheiro. Exaustão de cota conta no SLO de frescor, porque o usuário sente o atraso, mas não conta no SLO da API, que respondeu certo.

| Métrica | O que analisar | Como medir | Por quê | Meta e justificativa | Marca |
|---|---|---|---|---|---|
| Frescor | Targets prontos no prazo ÷ targets, de ponta a ponta | Tempos em `personalizacao_job_targets` | O usuário só se importa com a soma das etapas ([Workbook](https://sre.google/workbook/data-processing/)) | 95% prontos antes da próxima aula da turma. Sem dado de tempo real, o percentual é palpite | Proposta |
| Idade do job mais antigo | Tempo do `pending` mais antigo | SQL pelo pg_cron, sem passar pela API (falta) | É o alarme mais cedo da fila | Limite fixado depois da base; em aula, avisa | Proposta |
| Worker vivo | Batimento e estado real da task | `.done()` no `/health` e check no Healthchecks (20 grátis: [preços](https://healthchecks.io/pricing/)) (falta) | Hoje task morta aparece como `"running"` | Zero parada sem aviso | Proposta |
| Cota do Gemini | Chamadas e tokens ÷ limite, por modelo | Contador por dia do Pacífico (falta) | RPD zera à meia-noite do Pacífico, hoje 05:00 em Brasília ([limites](https://aistudio.google.com/docs/rate-limits)) | Aviso em 80%; o limite real sai do AI Studio | Proposta |
| Taxa de 429 | 429 ÷ chamadas, separando RPM de RPD | Corpo do erro, no log do cliente LLM (falta) | Espera curta difere de cota acabada; retry cego queima o dia | Parar ao identificar RPD esgotado; sem meta numérica | Proposta |
| Erro do provedor | Erros não-429 ÷ chamadas | Mesmo log | Saúde da dependência | Sem meta; não há referência pública | — |
| Fallback | Gerações por caminho secundário ÷ total | Etiqueta do caminho (falta) | Sucesso degradado é qualidade, não disponibilidade plena | Sem meta; tendência | Proposta |
| Material válido | Aprovado na validação ÷ gerado | Validador (falta) | 200 com conteúdo ruim é erro implícito ([SRE Book](https://sre.google/sre-book/monitoring-distributed-systems/)) | Fixar depois da base | Proposta |

Vale conferir um detalhe: os limites do Gemini são por projeto, não por chave ([limites](https://aistudio.google.com/docs/rate-limits)). As 4 chaves só somam cota se estiverem em projetos distintos.

### Banco

O Supabase não é só dependência: é a espinha do app. Ainda assim, nenhuma das três sondas o mede de forma isolada, e a sonda roda dentro dele.

| Métrica | O que analisar | Como medir | Por quê | Meta e justificativa | Marca |
|---|---|---|---|---|---|
| Supabase responde | Leitura REST de fora | Monitor externo; `app_config` é leitura pública candidata, se o plano aceitar o cabeçalho `apikey` (falta) | O `/health` testa o banco, mas não PostgREST nem Auth | Sem SLO, porque não há contrato; registrar minutos | Proposta |
| Tamanho do banco | `pg_database_size` por dia | SQL (falta no painel) | 500 MB geram restrição por média diária, e reduzir não libera na hora ([doc](https://supabase.com/docs/guides/platform/database-size)) | Alarme a 400 MB; saúde de cliente ≤ 25 MB | Limite: Fonte externa; alarme: Proposta |
| Disco | Uso do disco de 2 GB | Painel do Supabase | Somente leitura a 95%, o que bloqueia até jobs e monitoramento ([doc](https://supabase.com/docs/guides/platform/database-size)) | Alarme a 80% | Limite: Fonte externa; alarme: Proposta |
| Pausa | Dias sem atividade, no recesso | Batida e aviso por e-mail do Supabase | Pausa após 7 dias com pouca atividade ([doc](https://supabase.com/docs/guides/platform/free-project-pausing.md)); pg_cron não é garantia de que conta | Zero pausa em período letivo | Proposta |
| pg_cron e pg_net vivos | Processos e fila | `pg_stat_activity`; batida depois de rodada com resposta recente | Ambos podem morrer ([cron](https://supabase.com/docs/guides/troubleshooting/pgcron-debugging-guide-n1KTaz), [net](https://supabase.com/docs/guides/troubleshooting/webhook-debugging-guide-M8sk47)) | Aviso em até 10 min | Proposta |
| Limpeza interna | Crescimento de `cron.job_run_details` | Consultar `cron.job` em produção | Não se limpa sozinha ([pg_cron](https://github.com/citusdata/pg_cron)); as migrations não têm limpeza | Limpeza agendada | Proposta |
| Retenção | `retencao_modo` | Leitura de `app_config` | Em `simular`, nada é apagado | Decidir e registrar | Proposta |
| Vazio silencioso | Tabela crítica sem linhas para o papel real | Invariante SQL com papel simulado | RLS sem policy devolve lista vazia, e já aconteceu três vezes | Zero tabela crítica vazia para aluno matriculado | Proposta |

Volume da sonda: 2.016 linhas por dia nos três alvos no ritmo atual, cerca de 9 MB em 30 dias se cada linha ocupar 150 bytes com índice (**Cálculo próprio**, com tamanho assumido). Guarde detalhe por 30 dias e resumo diário para sempre. O resumo diário é o dado que importa para o TCC.

### Console do professor

| Métrica | O que analisar | Como medir | Por quê | Meta e justificativa | Marca |
|---|---|---|---|---|---|
| Disponibilidade | Sondas boas ÷ válidas | pg_net a cada 5 min (existe) | Sinal constante. Confirmar se testa só o HTML: isso prova a Vercel, não o login | 99,5% em aula, com 1 min de sonda. Sem isso, 99% | Proposta |
| LCP | P75 por carregamento | `web-vitals` gravando no Supabase (falta) | O Speed Insights grátis só mostra nota agregada ([Vercel](https://vercel.com/docs/speed-insights/limits-and-pricing)) | ≤ 2,5 s ([web.dev](https://web.dev/articles/vitals)) | Fonte externa |
| INP | P75 | Igual | Pode refletir a pior interação de uma longa edição, sem ser regressão | ≤ 200 ms ([web.dev](https://web.dev/articles/vitals)) | Fonte externa |
| CLS | P75 | Igual; só Chromium ([web-vitals](https://github.com/GoogleChrome/web-vitals)) | Estabilidade visual | ≤ 0,1 ([web.dev](https://web.dev/articles/vitals)) | Fonte externa |
| Erro JS | Sessões com erro não tratado ÷ sessões | Error boundary, `error`, `unhandledrejection` (falta) | O boundary não sobe até `window` ([React](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)) | ≤ 1% das sessões; 0 tela derrubada sem issue. Não achei benchmark | Proposta |
| Falha de servidor | 5xx ÷ respostas, por destino | Um `fetch` embrulhado em `global.fetch` ([Supabase](https://supabase.com/docs/reference/javascript/initializing)) (falta) | `supabase-js` devolve `{data, error}` sem lançar exceção | ≤ 0,5% | Proposta |
| Sucesso de RPC crítica | 2xx ÷ total, sem contar transporte | Igual, por `rpc/nome` | Salvar trilha e duplicar turma são o trabalho da professora | ≥ 99,5% com n ≥ 600; abaixo, contagem | Proposta; n: Cálculo próprio |
| Fallback da API | Vezes em que o console caiu para o Supabase | Contador em `personalizacoesApi.ts` (falta) | Mostra API ruim sem tela quebrada | Sem meta; tendência | Proposta |
| Versão no ar | SHA do build em cada registro | Carimbo no build (falta) | O site publica do espelho, e a versão pode ficar atrás da `main` | Toda amostra com SHA | Proposta |

A amostra de LCP é de carregamentos, não de telas, porque o console é SPA. Um professor em PC lento pode dominar o resultado, então calcule também o P75 sobre a mediana por usuário.

### Web do aluno

Vale a mesma tabela do console, com estas diferenças.

| Métrica | O que analisar | Como medir | Por quê | Meta e justificativa | Marca |
|---|---|---|---|---|---|
| Disponibilidade | Sondas boas ÷ válidas | pg_net a cada 5 min (existe) | Sinal mesmo sem aluno | Igual ao console | Proposta |
| LCP, INP, CLS | P75, separando celular de desktop | `web-vitals` (falta) | O público usa celular; console e aluno não se somam | 2,5 s, 200 ms e 0,1 ([web.dev](https://web.dev/articles/vitals)). Inconclusivo é resultado válido. Safari não dá CLS | Fonte externa |
| Sessões sem falha | Sessões sem falha crítica de servidor ÷ sessões com operação crítica | Agregado por sessão no cliente (falta) | É a disponibilidade que o aluno sentiu | ≥ 99% em 28 dias, com n e limite inferior | Proposta |
| Falha de transporte | Sem resposta ÷ chamadas | `fetch` embrulhado (falta) | Reflete o Wi-Fi da escola, não só o sistema | Sem meta; separar de falha de servidor | Proposta |
| Erro JS | Assinaturas novas por versão | Igual ao console (falta) | Com pouco tráfego, assinatura nova diz mais que taxa | ≤ 1% das sessões; 0 sem issue | Proposta |

Sonda e cliente real se completam. Dado de campo só registra quem conseguiu carregar ([web.dev](https://web.dev/articles/lab-and-field-data-differences)), então site totalmente fora só aparece na sonda. Rede da escola, build antigo e RLS só aparecem no cliente.

### App do aluno

Hoje nenhum erro de cliente é capturado, nem há `ErrorBoundary` no app. Com 30 alunos, 1 afetado dá 96,67% de crash-free users, e 99,9% exigiria 2.995 sessões sem crash para ser afirmado com 95% (**Cálculo próprio**). Por isso a métrica primária é contagem.

| Métrica | O que analisar | Como medir | Por quê | Meta e justificativa | Marca |
|---|---|---|---|---|---|
| Crash: alunos afetados | Contagem por versão e modelo | Sentry Developer (falta) | O aluno perde o estudo | 0 sem causa conhecida; todo crash vira issue | Proposta |
| Crash repetido | Mesmo crash, mesma versão | Sentry | Repetição entre pessoas diz mais que percentual | Alarme com 2 alunos em 7 dias | Proposta |
| Crash-free sessions | % de sessões sem crash ([Sentry](https://docs.sentry.io/product/releases/health/)) | Sentry ou tabela própria | Comparável à indústria: mediana 99,95%, Android 99,80% ([Luciq](https://www.luciq.ai/mobile-app-stability-outlook-2025), fornecedor) | ≥ 99,5% no semestre, com n ≥ 300 e limite inferior. 598 sessões sem crash sustentam a meta | Proposta; n: Cálculo próprio |
| Teto do Google Play | Usuários-dia com crash e ANR | Play Console, se houver dado | Passar reduz a visibilidade ([Android vitals](https://developer.android.com/topic/performance/vitals)) | Crash < 1,09%, ANR < 0,47%. É piso, não meta. Com 12 ativos, 4 usuários-dia em 28 dias já passam | Fonte externa |
| ANR e hang | Contagem | Sentry; Play Console | Toque sem resposta | 0 sem issue | Proposta |
| Início frio até tela com dado | P75, mediana e pior aparelho | `Sentry.extendAppStart()` ou marca própria (falta) | O tempo do sistema mede pouco em RN | P75 ≤ 3 s. Teto de 5 s ([Play](https://developer.android.com/google/play/vitals/launch-time)) | Teto: Fonte externa; 3 s: Proposta |
| Retorno ao app | P75 | Marca própria (falta) | Uso em aula | ≤ 1,5 s ([Play](https://developer.android.com/google/play/vitals/launch-time)) | Fonte externa |
| Sessão sem fim com retorno rápido | Sem `ended_at`, com lote recente e novo início em 2 min | SQL em `telemetria_sessoes` (existe) | Vê o que o JS não vê | Sem meta. Calibrar com crash forçado antes de virar número; é proxy com falso positivo alto | Proposta |
| Sessões sem falha e RPC crítica | Login, trilha, conclusão de atividade | `fetch` embrulhado em `mobile/src/database/supabase.ts` (falta) | O app fala direto com o Supabase, e nenhuma sonda vê isso | ≥ 99% e ≥ 99,5% com n ≥ 600 | Proposta |
| Adoção de versão | Aluno ativo em 7 dias pela última versão dele | `payload->'cliente'` (existe) | Sem `expo-updates`, toda correção exige instalação | 80% em 14 dias; ≤ 2 versões; 0 abaixo da mínima | Proposta |

O erro precisa ser gravado no aparelho e enviado depois, com hora de ocorrência separada da hora de recebimento. Sem isso, a falha some justamente quando a rede cai. Android vitals não deve ser a fonte primária: conta só instalação pelo Play, e pode ficar vazio ([Ajuda do Play](https://support.google.com/googleplay/android-developer/answer/9844486)).

O Sentry Developer tem 5 mil erros por mês, retenção de 30 dias e um único usuário ([preços](https://sentry.io/pricing/)). A leitura da página indica que não inclui API, então o dado de crash pode não chegar ao console. Por isso a tabela própria enxuta continua necessária.

Para não estourar o banco, grave uma linha por sessão com contadores, e erros deduplicados por assinatura, dia e versão. Com 60 alunos, isso dá perto de 2 MB por mês, contra 39 MB de uma linha por chamada (**Cálculo próprio**, com tamanhos assumidos). Com poucos eventos, agregue em vez de amostrar: amostragem aleatória destrói a pouca evidência de falha.

### Acessos

Os benchmarks medem outra coisa. Educação tem D30 entre 2% e 8%, conforme o fornecedor ([AppsFlyer](https://www.appsflyer.com/glossary/retention-rate/), [GetStream](https://getstream.io/blog/app-retention-guide)), e o DAU/MAU do Duolingo é 39,6% ([10-K](https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm)). Tudo isso mede uso voluntário de quem instalou. Na turma, o denominador é a matrícula e o ritmo é a grade: uma aula por semana com 100% de presença dá cerca de 18% de DAU/MAU (conta ilustrativa, **Cálculo próprio**).

A evidência também não sustenta meta de volume. Atividade online correlaciona pouco com resultado, r = 0,25, IC [0,09; 0,41], segundo uma meta-análise lida por resumo ([Hogrefe](https://econtent.hogrefe.com/doi/10.1027/2151-2604/a000484)), e o efeito varia por curso ([Gašević et al.](https://core.ac.uk/download/80691866.pdf)). Essa literatura é de ensino superior; aplicá-la aqui é extrapolação. Acesso é indicador de operação, não de aprendizagem.

| Métrica | O que analisar | Como medir | Por quê | Meta e justificativa | Marca |
|---|---|---|---|---|---|
| Acessos totais | Entradas fundidas por semana e por hora | `aluno_sessoes_app`, fundindo entradas a menos de 30 min (existe) | Contexto de carga e denominador para falha. Sozinho é vaidade | Sem meta. Corte de 30 min é padrão do [GA4](https://support.google.com/analytics/answer/12798876); testar 15 e 60 uma vez | Corte: Fonte externa |
| Acessos por aluno | Dias com acesso por semana: mediana e faixa da turma | Mesma base, por dia em `America/Sao_Paulo` | Dia não depende do corte; regularidade parece melhor que volume, com resultados mistos | **Sem meta**, individual ou de turma | Proposta |
| Ativos na semana | "21 de 30" por turma | Semana letiva, sem contas de teste | Substitui DAU, WAU e MAU | Sem meta. Verificar se cair 2 semanas seguidas, com variação > 3 alunos | Proposta |
| Ativação inicial | Primeiro acesso em até 7 dias da matrícula ou até a 2ª aula | `classe_aluno` e primeira sessão | Falha aqui costuma ser técnica e tem conserto | Zero faltante sem explicação | Proposta |
| Sem acesso há N dias | Contagem e lista por código curto | N = 14 dias, pausando em recesso; janela até 90 dias (existe a lista) | É o único dado por aluno com ação clara: ver se há problema técnico | Sem meta; é fila de verificação | Proposta |
| Saúde de acesso | Falha de login, versão mínima, `fallback_motivo` | Logs e lotes | Aluno sumido muitas vezes é sistema quebrado | Zero aluno bloqueado por versão antiga | Proposta |
| Curva da turma | Ativos por semana desde o início | Série por turma, marcando recessos | Substitui D1/D7/D30 | Sem meta; descritiva | Proposta |

Três limites da implementação atual merecem revisão. Uma linha por entrada não prova engajamento: o GA4 pede 10 s, evento-chave ou 2 telas ([Ajuda](https://support.google.com/analytics/answer/12798876)), e as notas não confirmam se a tabela permite esse filtro. As notas também não confirmam se a web do aluno grava na mesma tabela. E `aluno_atividade_diaria` não é a mesma conta de `tempo_gasto_min`, então as duas não devem aparecer juntas sem conferência. O tempo ativo, se entrar, é mediana por turma, sempre sobre `active_sec`.

Ficam fora do painel: DAU/MAU como indicador, D1/D7/D30, downloads, cadastros acumulados, minutos totais, ranking de alunos, score composto e comparação entre turmas sem contexto. A primeira tela deve ter no máximo 5 ou 6 indicadores. Para cada um, pergunte: se o valor mudar, o que eu faço? Se a resposta for "nada", ele sai.

## Quem detecta cada falha

A matriz mostra o estado com a decisão 3 aplicada. Sem ela, as linhas de Supabase e de Apps Script ficam sem aviso. As sondas não dependem da API nem do VPS, e por isso o painel fica no console web, não no HTML `/admin`, que cairia com a API. O painel e o sino dependem do Supabase.

| Falha | Sonda (pg_cron) | E-mail e sino | Batida (Healthchecks) | Monitor externo | Cliente (futuro) | Quem avisa de fato |
|---|---|---|---|---|---|---|
| API caiu, VPS vivo | Detecta | Saem | Quieto, correto | Detecta | Fallback em `via` | Sonda |
| VPS caiu | Detecta | Saem | Quieto; check do host avisaria | Detecta | Fallback em `via` | Sonda |
| Console ou web fora (Vercel) | Detecta, em 15 a 20 min com 5 min | Saem | Quieto | Só se tiver monitor próprio | Não: não carrega | Sonda |
| Supabase fora | Não roda | Não saem | **Detecta pelo silêncio** | Detecta, se o `/health` falhar | Grava local | Batida e monitor |
| Supabase pausado | Não roda | Não saem | **Detecta** | Detecta | Grava local | Batida e monitor |
| pg_cron ou pg_net morto | Não roda | Não saem | **Detecta** | Quieto, correto | Nada | Batida |
| Apps Script quebrado ou sem cota | Detecta | Só o sino | Quieto | **Detecta, com e-mail próprio** | Nada | Monitor; sino se o painel estiver aberto |
| Rota ruim só entre Supabase e VPS | Falso alarme | Saem | Quieto | **Desmente** | Nada | Comparação das duas visões |
| Worker da fila morto, API de pé | Não vê, até corrigir `.done()` | Não saem | Detecta, se o worker bater | Não vê | Atraso de material | Check do worker; idade do job |
| Cota do Gemini esgotada | Não vê | Não saem | Quieto | Não vê | Atraso de material | Contador de cota; frescor |
| Deploy com migration ruim | Detecta | Saem | Quieto | Detecta | Fallback em `via` | Sonda |
| Disco do VPS enchendo | Não vê, até cair | — | Check do host, com `df` | Não vê | Nada | Check do host |
| Disco do Supabase enchendo | Não vê | — | Não vê | Não vê | Erros de escrita | Alarme no banco, antes de 95% |
| RLS sem policy, tela vazia | Não vê | — | Não vê | Não vê | Contador de tela vazia | Invariante SQL |
| Crash do app | Não vê | — | Não vê | Não vê | **Sentry** | Sentry; hoje ninguém |
| Build antigo em campo | Não vê | — | Não vê | Não vê | `payload->'cliente'` | Consulta de adoção |
| Wi-Fi da escola | Não vê | — | Não vê | Não vê | Falha de transporte | Cliente; hoje a professora |

A batida deve sair só depois de uma rodada que processou resposta recente, ou uma sonda presa vai parecer saudável. Sugestão: período de 5 min e tolerância de 5 min, com aviso em cerca de 10 min. Confirme os mínimos e os canais de alerta ao criar a conta ([Healthchecks](https://healthchecks.io/docs/configuring_checks/)).

O monitor externo escolhido é o UptimeRobot Free, com 50 monitores de 5 min e uso comercial permitido ([preços](https://uptimerobot.com/pricing/), [termos](https://uptimerobot.com/terms/)). A HetrixTools tem números melhores, 1 min e agente de servidor, mas exige login a cada 90 dias ([preços](https://hetrixtools.com/pricing/uptime-monitor/)), e esse é um risco real depois da entrega do TCC. Como o monitor é só alarme de reserva, 5 min bastam.

O teto de 10 e-mails por dia está bem colocado. O Apps Script gratuito tem 100 destinatários por dia ([cotas](https://developers.google.com/apps-script/guides/services/quotas)), compartilhados com contato e aviso de conta inativa, que inicia prazo de exclusão. Em dia de oscilação, o que passar do teto fica só no sino. Um e-mail semanal de "sonda viva" prova que o caminho funciona.

## Política de orçamento de erro em uma página

A política existe para decidir antes, por regra, quando parar de fazer funcionalidade. Não é punição ([Google](https://sre.google/workbook/error-budget-policy/)). Esta é uma adaptação para uma pessoa (**Proposta**); não encontrei relato publicado de política para operador único.

| Situação | Ação |
|---|---|
| Mais de 50% do orçamento restante | Segue normal |
| Mais de 50% consumido | Deploy só fora de aula; revisar a causa principal |
| Esgotado por causa própria | Parar funcionalidades até voltar ao SLO, exceto segurança e correção |
| Esgotado por causa externa | Seguir, e abrir item se a dependência puder ser suavizada |
| Incidente único acima de 20% do orçamento | Análise curta: o que houve, fatores, o que funcionou, uma ação |
| Entrega do TCC ou aula impede cumprir | Exceção permitida, **escrita e datada** no repositório |

Faça revisão semanal do painel e, no início, revisão mensal das metas ([Workbook](https://sre.google/workbook/implementing-slos/)). Leve o resultado à orientação, no lugar dos três papéis que o Workbook pede. Depois de 4 semanas letivas, recalibre, nesta ordem: horas reais de aula, 3 s de lentidão, 3 falhas e 2 voltas, percentual e prazo de frescor, limiares de erro e de início do app. O histórico mostra o que é viável, não o que é suficiente. Mudar uma definição quebra a série, então cada mudança precisa de data.

A ordem de construção vai do menor ao maior custo. Primeiro, monitor externo, batida e consultas sobre o que já existe. Depois, captura e Web Vitals na web, que saem no deploy. Em seguida, o `fetch` embrulhado no app e na web. Por último, Sentry no app, que exige build novo e por isso precisa sair antes da turma avaliada. Pela regra de fronteira, tudo isso vai direto para o Supabase; só o contador de requisições fica na API, e o relógio de retenção fica no pg_cron.

## LGPD e ECA Digital

**Isto não é parecer jurídico.** É interpretação feita a partir da lei e de guias, sem posição da ANPD sobre painel técnico em plataforma educacional. Antes de usar com menores, vale revisão de quem tem competência para isso.

Métrica por aluno é dado pessoal, mesmo com código curto. Pseudônimo continua ligado à pessoa por informação guardada à parte, e dado só sai da lei quando a anonimização não é reversível ([LGPD, arts. 12 e 13](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)). O código protege contra print, relatório e texto do TCC. Não protege contra a própria dona, que tem o banco.

O desenho descrito acerta no essencial: código curto, nome só por pedido registrado, janela até 90 dias, sem emoção, perfil ou nota. Isso atende ao princípio da necessidade (art. 6º, III). Combinar esses campos é o que transformaria o painel em perfil. O Exemplo 7 do Guia da ANPD mostra que informar na política não salva coleta desproporcional, e que quem não pode se opor na prática pesa no balanceamento ([Guia, pp. 24–25](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/copy_of_guia_legitimo_interesse.pdf/@@display-file/file)).

| Tema | Posição sugerida | Base |
|---|---|---|
| Quem é controladora | Decidir por escrito. Quem define as finalidades é a controladora, mesmo pessoa natural. Se uma escola decide o uso, o painel para fins próprios fica fora das instruções dela | [Guia de Agentes](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/Segunda_Versao_do_Guia_de_Agentes_de_Tratamento_retificada.pdf/@@display-file/file) |
| Base legal | Separar por finalidade. Operação e segurança: legítimo interesse tem o caso mais forte. Melhoria de produto: "aprimoramento" genérico não basta. Pesquisa do TCC: fluxo próprio de consentimento e ética, sem reaproveitar o painel | [Guia, pp. 11–13](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/copy_of_guia_legitimo_interesse.pdf/@@display-file/file) |
| Menores | Melhor interesse demonstrado em registro: o que foi considerado, com que critérios, e que não há risco desproporcional. Se o teste for inconclusivo, adotar outra base | [Art. 14](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm); [Enunciado 1](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes/Enunciado1ANPD.pdf/@@display-file/file); [Guia, pp. 10–11](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/copy_of_guia_legitimo_interesse.pdf/@@display-file/file) |
| Relatório de impacto | Fazer mapeamento de riscos e um RIPD curto. O ECA Digital pede isso sobretudo em tratamento além do estritamente necessário para operar. A leitura conjunta com "acesso provável" é interpretação | [Lei 15.211, art. 16 e art. 1º](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15211.htm) |
| Metas de frequência | Não criar. Streak ou "mais acessos" batem de frente com o dever de evitar uso compulsivo | [Lei 15.211, art. 8º, IV](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15211.htm) |
| Ranking e rótulo | Sem score de engajamento nem "desengajado". Aproxima de perfilamento | [Lei 15.211, art. 2º, V](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15211.htm) |
| Retenção | A lei não dá prazo; 90 dias é escolha a justificar pela finalidade. Depois, só agregado por turma e semana. Conciliar com a retenção de pesquisa | [Arts. 15 e 16](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) |
| Acesso | Só papel administrativo, por RPC que confere o papel, com MFA e sem GRANT a `anon` e `authenticated` | [Art. 46](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) |
| Registro de consulta | Simples e append-only: quem, quando, qual turma e motivo da revelação. A lei não o exige expressamente, mas serve à demonstração | [Art. 6º, X](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) |
| Exportação | Sem CSV por aluno. Agregados com células menores que 5 suprimidas (convenção, sem fonte nas notas) | Necessidade |
| Transparência | Política em linguagem simples para adolescentes: que há painel, o que mostra, quem vê, por quanto tempo, como se opor | [Art. 14, §§ 2º e 6º](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) |
| Efeito no aluno | Nenhuma decisão pedagógica nem nota. Repassar ao professor seria nova finalidade e novo destinatário | Finalidade, art. 6º, I |
| Captura de erro | Sem texto livre de aluno, com `sendDefaultPii` desligado, URL normalizada para `tabela` ou `rpc/nome`, RLS e linha em `retencao_politica` no mesmo commit. Mensagem de erro pode conter dado pessoal | Necessidade; regra do repositório |

O teste para cada coluna do painel é simples: que ação técnica muda se este valor mudar? Sem resposta, a coluna sai. O ECA Digital não traz exceção específica para educação no texto, e está vigente desde 17/03/2026 ([Lei 15.211](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15211.htm)). A ANPD abriu subsídios sobre um guia em abril de 2026 ([Convergência Digital](https://convergenciadigital.com.br/?p=51607)); as notas não acharam a versão final.

## Lacunas

| Lacuna | Por que importa | Como fechar |
|---|---|---|
| Volume real por hora de aula, tamanho do banco e de `telemetria_lotes` | Decide quase todos os limiares | Linha de base de 4 semanas; `pg_total_relation_size` |
| Grade de aula no banco | Sem ela, o SLO recomendado não tem denominador | Janela global simples, com semanas sem aula marcadas |
| O que as sondas de console e web testam | HTML verde não prova login nem dados | Revisar o código; considerar uma leitura real |
| Latência da sonda a partir do Supabase | O 1,35 s foi medido de outra máquina | Olhar a primeira semana da série |
| Código HTTP do `/health` com banco fora | Afeta a classificação | Testar em ambiente local |
| Tempo real de restart e de deploy | Define se 3 sondas absorvem deploy | Medir no próximo deploy |
| Provedor e tamanho do VPS; monitoramento do Dokploy instalado | As fontes divergem; o [doc](https://docs.dokploy.com/docs/core/monitoring) diz só Cloud | Olhar a instalação |
| Limite atual do Gemini por modelo; separar RPM de RPD no 429 | Sem isso, não há % de cota | AI Studio do projeto; corpo do erro |
| Uso de dados no Gemini gratuito | Fontes secundárias citam uso para melhorar produtos, relevante para dados de alunos | Conferir nos termos |
| Se pg_cron evita a pausa do Supabase | A doc não diz, e as fontes divergem | Não contar com isso; plano para recesso |
| Distribuição do app (Play, TestFlight, APK) | Decide se Android vitals dá algum dado | Confirmar; testes fechados também não foram esclarecidos |
| Sentry: API no plano grátis, cota de sessões, uso em Expo | Afeta o desenho híbrido | Testar na conta antes de instalar |
| Envio de dado a terceiros de monitoramento fora do Brasil | As notas não analisaram | Incluir no RIPD |
| Res. CD/ANPD 2/2022, "órgão de pesquisa", Res. CNS 510/2016, relação com a instituição parceira | Afetam papel, base e pesquisa | Ler os originais e confirmar com a orientação |
| Benchmark de uso em sala, erro JS, 5xx, sessões sem falha | Não há fonte pública confiável | As metas seguem como proposta |
| Coeficientes de Wang & Mousavi; texto completo do relatório de MTTR do Google | As notas leram só resumos | Não citar números específicos sem abrir o artigo |

## Conclusão

O ganho deste trabalho não está na lista de métricas, e sim em três mudanças de leitura. "API no ar" deixa de significar "TrailUp no ar": o aluno depende do Supabase e do app, que as sondas não veem, e por isso a captura no cliente vale mais que qualquer refinamento de sonda. "Mais acesso" deixa de ser resultado: o número serve para achar aluno bloqueado por falha técnica, não para medir aprendizagem, e essa frase deve constar do TCC. E uma meta inconclusiva passa a ser resposta válida: com turma pequena, dizer "0 em 300 sessões, abaixo de 1% com 95%" é mais forte que um 100% que não se sustenta.

Para o TCC, o resultado mais defensável será a série diária de disponibilidade, a lista completa de incidentes e as definições datadas, e não uma tendência estatística. Com um semestre de poucos eventos, o sistema de medição se avalia melhor pelo que detectou e em quanto tempo do que pela porcentagem final.
