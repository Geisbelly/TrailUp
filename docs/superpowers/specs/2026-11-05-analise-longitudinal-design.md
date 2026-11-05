# Análise longitudinal por ciclo (#19)

Data: 2026-11-05 · Migration `20261105_10` · Depende da #13 (cohort e baseline) e da `20261105_09`

A fase 3 da metodologia pede o acompanhamento da "estabilidade dos ganhos ao longo de ciclos"
(TCC 09 §4). O critério de impacto exige "manutenção do ganho por mais de um ciclo" (09 §10). A #13
já entrega a série semanal por turma em `metricas_estudo_coortes`. Esta entrega lê a mesma conta e
responde à pergunta que faltava: **o ganho se sustentou ou foi um pico?**

## 1. Decisões

| # | Decisão | Por quê |
|---|---|---|
| L-1 | **O ciclo é a semana relativa ao corte**, a mesma da #13 (C-7). | O `ciclo_id` da personalização é irregular e muda de aluno para aluno. A semana é igual para todos, e a série da #13 já está nela. |
| L-2 | **Três níveis: braço, turma e braço × perfil dominante.** O braço soma as turmas antes de checar o mínimo, como a comparação da #13. | O critério 1 pede a evolução por cohort; a tarefa 4 pede turma e perfil. Perfil × turma dá célula de 1 ou 2 alunos e ficaria sempre nulo. |
| L-3 | **O perfil entra como parâmetro opcional de `estudo_indicadores_janela`** (`p_perfil`, padrão NULL). | Uma conta só: o número por perfil não pode divergir do total. Quem chama com 5 argumentos continua igual. |
| L-4 | **O perfil dominante é o de hoje**, com o desempate da `20261102_26` (maior afinidade, depois o nome). Aluno sem `aluno_perfil` fica fora do nível perfil. | Não há histórico de perfil por data. O executor do grafo não grava perfil, então ele só muda pelo quiz (CLAUDE.md). Isso entra nas limitações. |
| L-5 | **Ganho = taxa da semana − taxa do baseline do mesmo grupo.** Na intervenção, quando a comparação tem a mesma semana, vale a **diferença-em-diferenças daquela semana**. | Dentro do braço, o ganho mistura o efeito com tudo o que mudou no período (conteúdo, calendário). A comparação desconta isso. A resposta diz qual das duas foi usada (`comparado_com`). |
| L-6 | **O limiar é o desvio-padrão das taxas semanais do baseline do grupo.** Sem duas semanas com amostra, ele vale 0. | Um ganho menor que a variação normal de uma semana para outra não se distingue de ruído. É uma regra descritiva, não um teste de significância, e isso é dito em `limitacoes`. |
| L-7 | **Classificação** (`estudo_classificar_serie`), sobre as semanas depois do corte: | Critério 2 da issue: distinguir um ganho que se sustenta de um pico isolado. |
| | `sustentado`: acima do limiar em 2 ou mais semanas seguidas, incluindo a última observada | "Mais de um ciclo" (09 §10), e ainda de pé no fim. |
| | `ganho_nao_mantido`: teve 2 seguidas acima, mas a última observada não está | Sustentou e caiu. |
| | `pico_isolado`: acima do limiar, mas nunca em 2 semanas seguidas | |
| | `sem_ganho` / `amostra_insuficiente` (menos de 2 semanas pós com amostra) | |
| L-8 | **Semana sem amostra não conta e não quebra a sequência.** | Célula suprimida não é evidência de queda. |
| L-9 | **Os marcos de produto aparecem na própria semana da série**, com tipo e descrição. | Critério 3: a mudança de produto fica anotada na série, não numa lista à parte. |
| L-10 | **Mesma anonimização da #13**: `n_minimo` do catálogo, nenhum `aluno_id`, só o professor dono de todas as turmas pedidas. | 09 §8. |

## 2. O que fica no banco

| Objeto | Para quê | Acesso |
|---|---|---|
| `estudo_indicadores_janela(…, p_perfil text DEFAULT NULL)` | contagens cruas, agora com filtro opcional pelo perfil dominante | sem EXECUTE para cliente (como antes) |
| `estudo_classificar_serie(numeric[], numeric)` | a regra L-7 e L-8, pura | `authenticated` |
| `metricas_estudo_longitudinal(classe_ids[])` | série por nível, ganho, diferença-em-diferenças por semana, classificação, marcos e limitações | o professor dono de todas as turmas pedidas |

## 3. Como ler (o relatório da #19)

1. Comece pelo nível `braco` da intervenção. Para cada indicador, `classificacao.resultado` e `comparado_com`.
2. Um `sustentado` só vale como "ganho mantido" se `comparado_com = diferenca_em_diferencas`. Dentro do braço, ele também pode ser efeito de calendário.
3. Abra a `serie` e confira os `marcos` das semanas em que o ganho começou ou acabou. Um deploy ou uma aula fora do planejado naquela semana é explicação concorrente.
4. Desça para `turma` e `perfil` para ver se o resultado vem de um grupo só (heterogeneidade, 10 §10).
5. Reporte sempre com `limitacoes`, `n_minimo` e `baseline.semanas_com_amostra`.

## 4. Fora desta entrega

- **Tela no console.** A RPC fica pronta para ela, como a da #13.
- **Teste de significância.** Com turmas de 20 a 40 alunos e 2 a 6 semanas, um teste formal teria pouco poder. A regra de L-6 é descritiva e declarada.
- **Queda sustentada.** Os quatro indicadores são "maior é melhor", e a regra só procura ganho. Uma queda aparece na série (`ganho_sobre_baseline` negativo), sem classificação própria.
