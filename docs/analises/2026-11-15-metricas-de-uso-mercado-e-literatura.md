# Como apps de aprendizagem e jogos mobile medem o uso, e o que o TrailUp ajusta

**Data:** 15/11/2026. **Base:** código da `main` em `2237d0de` (cabeça do Alembic `20261110_04`) e
documentação pública. **Nenhuma consulta a produção foi feita para este documento.** Os números do
TrailUp citados aqui vêm de documentos anteriores, com a data deles.

## Resumo

O TrailUp já mede mais e com mais cuidado do que a maioria dos produtos comparados declara medir.
Tempo ativo separado do tempo parado, escopos que não se somam, "sem dado" diferente de zero,
invariantes que tiram do ar a métrica quebrada, retorno semanal, acerto de primeira tentativa,
questão problemática, perfil × formato e pré/pós por turma com diferença-em-diferenças já existem no
banco (spec de métricas, fases F0 a F5).

As lacunas que sobram são cinco, e só a última pede app novo:

1. **Sessão de estudo.** O TrailUp chama de "sessão" cada abertura de tela. O mercado chama de sessão
   um período contínuo de uso, cortado por inatividade (30 min no Firebase e no GA4). Por isso
   "sessões por aluno" e "duração média da sessão" do console medem telas, não visitas.
2. **Funil de ativação.** Não há medida de quanto tempo o aluno leva da matrícula ao primeiro estudo,
   à primeira entrega e ao primeiro tópico concluído. O mercado trata a primeira semana como o ponto
   mais frágil da retenção.
3. **Estados de retenção.** O retorno semanal existe, mas não diz **quem** voltou: aluno novo, que
   voltou depois de sumir, ou que nunca parou. O modelo de crescimento do Duolingo separa esses
   grupos, e a separação é o que torna a taxa acionável.
4. **Desempenho que trava.** Existe "questão difícil", mas não "aluno que tenta várias vezes e não
   sai do lugar" (*wheel-spinning*, Beck e Gong, 2013). É o sinal de desempenho com ação mais clara
   para o professor.
5. **Efeito da recomendação e cobertura do material.** O log de sugestões existe, mas ninguém mede se
   o aluno seguiu a ordem aconselhada e o que aconteceu depois. A telemetria não traz o tamanho do
   material, então não se sabe que fração do áudio ou do texto o aluno percorreu.

Ficam de fora, de propósito, DAU/MAU como indicador, D1/D7/D30 de calendário, meta de sequência de
dias e qualquer número de "engajamento" composto. O motivo está em
`2026-11-05-metricas-e-metas-de-desempenho.md` e é reforçado aqui: o denominador do TrailUp é a
matrícula, o ritmo é a aula, e o ECA Digital veda o desenho que induz uso compulsivo.

## Como ler

Cada afirmação traz a fonte. Três cuidados valem para o documento todo:

- **Fonte de empresa não é estudo independente.** Khan Academy, Duolingo e Kahoot publicam sobre o
  próprio produto. Quando o número vem de lá, está marcado como **(fornecedor)**.
- **Fonte secundária** (newsletter, blog de terceiro) está marcada como **(secundária)**. Nenhum
  número dessas fontes vira meta.
- **Literatura de ensino superior e MOOC** não é de alunos do ensino básico em turma. Aplicar ao
  TrailUp é extrapolação, e o texto diz quando faz isso.

Marcas da proposta, as mesmas do relatório de 05/11: **Fonte externa** (o limiar vem de documento
citado), **Cálculo próprio** (conta reproduzível) e **Proposta** (ponto de partida, a recalibrar
depois de 4 semanas letivas de dado).

## 1. O que o mercado e a literatura medem

### 1.1 Duolingo

- **Modelo de crescimento por estados.** O usuário ativo do dia é classificado em grupos
  exclusivos: *atual* (ativo hoje e na semana anterior), *reativado* (ativo no último mês, mas não na
  última semana), *ressuscitado* (volta depois de mais de 30 dias), além dos grupos "em risco" e das
  taxas de transição entre estados, como NURR (retenção de novos) e CURR (retenção de atuais)
  ([Duolingo, blog](https://blog.duolingo.com/growth-model-duolingo/), **fornecedor**;
  [Lenny's Newsletter](https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth),
  **secundária**). Na simulação da própria empresa, a alavanca que mais movia o DAU era a CURR.
- **A definição de CURR varia entre as fontes:** "ativo hoje e na semana anterior" no blog do
  Duolingo, e "volta nesta semana tendo vindo nas duas anteriores" na versão herdada da Zynga que a
  newsletter descreve. Quem citar CURR precisa dizer qual.
- **Primeira semana.** A retenção é mais frágil nos primeiros sete dias
  ([Lenny's Newsletter](https://www.lennysnewsletter.com/p/duolingo-streaks), **secundária**).
- **Sequência de dias (streak).** É o mecanismo de retenção mais testado da empresa: mais de 600
  experimentos em quatro anos, segundo a mesma newsletter (**secundária**). Não encontrei experimento
  controlado publicado pelo Duolingo sobre o congelamento da sequência.
- **Memória, não só uso.** A regressão de meia-vida (HLR) estima por quanto tempo cada palavra fica
  na memória e prevê a chance de acerto no próximo encontro. Errou quase metade do que errava o
  sistema de Leitner que o produto usava antes
  ([Settles e Meeder, ACL 2016](https://aclanthology.org/P16-1174/);
  [código e dados](https://github.com/duolingo/halflife-regression)).
- **Efetividade.** Estudos com teste externo (ACTFL, STAMP 4S) comparam quem terminou o nível
  iniciante com alunos universitários de quatro semestres
  ([Jiang et al., CALICO 2024](https://journal.equinoxpub.com/Calico/article/view/26704),
  **fornecedor**: os autores são da empresa). Uma crítica independente aponta viés de seleção nesses
  desenhos ([CALL-EJ](https://callej.org/index.php/journal/article/download/419/347/1013)).

### 1.2 Khan Academy

- **Unidade de resultado: habilidade, não minuto.** Cada habilidade passa por *não iniciada,
  tentada, familiar, proficiente* e *dominada*, e pode cair de nível. O domínio do curso é a fração de
  habilidades em proficiente ou dominada
  ([central de ajuda](https://support.khanacademy.org/hc/en-us/articles/5548760867853)).
- **Dose e ganho.** Em ~350 mil alunos do 3º ao 8º ano, 30 minutos ou mais por semana se associaram a
  ganho ~20% maior que o esperado no MAP Growth. A empresa classifica o estudo como correlacional,
  nível 3 da ESSA ([Khan Academy, 2024](https://blog.khanacademy.org/khan-academy-efficacy-results-november-2024/),
  **fornecedor**). Por isso ela própria usa "habilidades levadas a proficiente" como meta, e não
  minutos ([blog](https://blog.khanacademy.org/?p=13201)).

### 1.3 Kahoot

- **Relatório por questão e por participante.** Questão com menos de 35% de acerto entra em
  "questões difíceis", e quem acerta menos de 30% entra em "precisa de ajuda"
  ([Kahoot](https://kahoot.com/blog/2020/05/06/analytics-new-free-kahoot-reports-formative-assessment/),
  **fornecedor**). Professores pedem que o limiar seja ajustável, porque "difícil" muda com a
  matéria e a série ([comunidade](https://support.kahoot.com/hc/en-us/community/posts/38550810014739-Feature-Suggestion-Adjustable-Difficulty-Threshold-for-Questions)).

### 1.4 Quizlet e Brilliant

- **Quizlet.** O modo *Learn* escolhe, a cada passo, o próximo item e o formato da pergunta para
  maximizar o domínio da lista ([arXiv 1803.00111](https://arxiv.org/pdf/1803.00111v1.pdf),
  **fornecedor**). O próprio artigo diz que o critério não considera memória de longo prazo. Não
  encontrei dado de retenção publicado pela empresa.
- **Brilliant.** Não encontrei documentação pública de como mede uso ou aprendizagem. Fica fora da
  comparação para não inventar.

### 1.5 Ferramentas de analytics mobile e jogos

- **Sessão.** No Firebase/GA4, a sessão começa quando o app vai para o primeiro plano e termina
  depois de **30 min sem atividade** (configurável)
  ([Firebase](https://firebase.blog/posts/2018/12/new-changes-sessions-user-engagement);
  [Ajuda do Analytics](https://support.google.com/analytics/answer/9191807)). No Amplitude, o padrão
  móvel é **5 min** ([Amplitude](https://amplitude.com/docs/data/sources/instrument-track-sessions)).
  Não há corte canônico: o número é uma escolha que muda a contagem.
- **Tempo de engajamento.** O Firebase soma `engagement_time_msec` só com o app em primeiro plano; o
  parâmetro é incremental, não acumulado
  ([Firebase](https://firebase.blog/posts/2018/12/new-changes-sessions-user-engagement)).
- **Retenção.** O Amplitude distingue três contas: *N-day* (voltou exatamente no dia N),
  *unbounded* (no dia N ou depois) e *bracket* (em janelas definidas, como dias 1–7 e 8–14). No
  N-day, só entra no denominador quem já completou o período
  ([Amplitude](https://amplitude.com/guides/retention-analytics);
  [comunidade](https://community.amplitude.com/building-and-sharing-your-analysis-58/can-unbounded-retention-be-lower-than-n-day-retention-for-the-same-time-period-139)).
  A própria empresa recomenda *unbounded* ou *bracket* para uso irregular, e N-day para uso diário.
- **Jogos mobile.** Benchmarks de D1, D7 e D28 e de duração média de sessão (mediana de 5–6 min em
  2024) ([GameAnalytics, via Game Dev Reports](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks),
  **secundária**). Medem uso voluntário de quem instalou, não de uma turma matriculada.

### 1.6 Learning analytics e sistemas tutores

- **Tempo na tarefa é uma estimativa, e a forma de estimar muda a conclusão.** Kovanović et al.
  compararam métodos de estimar tempo (cortes de inatividade, tratamento da última ação) e mostraram
  que a escolha altera os resultados de modelos de desempenho
  ([LAK 2015](https://dblp.org/rec/conf/lak/KovanovicGDJBH15);
  [JLA 2015](https://learning-analytics.info/index.php/JLA/article/view/4501)).
- **Engajamento não é uma coisa só.** Em MOOCs, quatro trajetórias se repetem (completar, assistir
  sem avaliar, desengajar, amostrar), e a taxa de conclusão sozinha esconde isso
  ([Kizilcec, Piech e Schneider, LAK 2013](https://web.stanford.edu/~cpiech/bio/papers/deconstructingDisengagement.pdf)).
- **Vídeo: tempo relativo ao tamanho.** Guo, Kim e Rubin mediram engajamento como tempo assistido
  em relação à duração e se o aluno fez a avaliação seguinte, em 6,9 milhões de sessões de vídeo
  ([L@S 2014](https://up.csail.mit.edu/other-pubs/las2014-pguo-engagement.pdf)).
- **Desempenho que não progride.** *Wheel-spinning* é o aluno que passa por 10 oportunidades de
  prática sem atingir domínio (três acertos seguidos de primeira)
  ([Beck e Gong, AIED 2013](https://researchr.org/publication/BeckG13)). *Gaming the system*
  (chutar ou pedir dica até a resposta aparecer) é o comportamento fora da tarefa mais associado a
  aprender menos ([Baker et al., CHI 2004](https://hci.rwth-aachen.de/materials/conferences/CHI2004/1p383.pdf)).
- **Domínio.** O rastreamento bayesiano de conhecimento estima a probabilidade de a habilidade
  estar aprendida a partir da sequência de acertos e erros
  ([Corbett e Anderson, 1995](https://link.springer.com/article/10.1007/BF01099821)). O limiar de
  0,95, muito citado, é convenção, não está no artigo original.
- **Ganho de aprendizagem.** O ganho normalizado é o ganho médio dividido pelo ganho máximo possível,
  `(pós − pré) / (100 − pré)`; Hake obteve 0,23 em cursos tradicionais e 0,48 em cursos de
  engajamento ativo, em 6.542 alunos ([Hake, 1998](https://web.mit.edu/jrankin/www/Active_Learning/hake_active_phys.pdf)).
- **Teste atrasado.** No teste 5 minutos depois, reestudar vence; em 2 dias e em 1 semana, quem foi
  testado lembra mais ([Roediger e Karpicke, 2006](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf)).
  Medir aprendizagem só logo depois do estudo favorece o que dá sensação de aprender.
- **Tamanho do efeito esperado.** Sistemas tutores: d ≈ 0,76 contra sem tutoria
  ([VanLehn, 2011](https://eric.ed.gov/?id=EJ946764)); mediana de 0,66 DP em 50 avaliações, mas só
  0,13 em testes padronizados contra 0,73 em testes locais
  ([Kulik e Fletcher, 2016](https://journals.sagepub.com/doi/abs/10.3102/0034654315581420)).
  Gamificação: g ≈ 0,49 em resultado cognitivo
  ([Sailer e Homner, 2020](https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/index/index/docId/109056)).
  Efeito medido com teste feito pelo próprio sistema tende a sair maior que com teste externo.

## 2. Comparação métrica a métrica

"Hoje" quer dizer o código da `main` em 15/11. "Existe" não quer dizer que haja dado: a base de
produção tinha telemetria de poucos alunos de QA nas últimas medições.

### 2.1 Tempo

| Métrica | Mercado e literatura | TrailUp hoje | Lacuna |
|---|---|---|---|
| Sessão | Período contínuo cortado por inatividade: 30 min (Firebase/GA4), 5 min (Amplitude móvel) | `telemetria_sessoes` é **uma por abertura de tela** de estudo (`cicloSessao.ts`); `vw_metricas_sessoes_aluno_dia` conta essas. O acesso ao app (`aluno_sessoes_app`) já é fundido a 30 min no painel técnico (`20261105_10`) | **Sessão de estudo** fundida por inatividade não existe. "Sessões por aluno" e "tempo médio de sessão" do console medem telas |
| Tempo ativo | `engagement_time_msec` só em primeiro plano; Khan usa minutos/semana como dose | `active_sec` com corte de 15 s sem toque, salvo mídia tocando; escopo `topic`; `tempo_gasto_min` tem fonte única (`20261030_01`) | Nenhuma de definição. O corte de 15 s nunca foi testado contra outro; Kovanović mostra que a escolha muda conclusões |
| Tempo parado | Não aparece nas ferramentas de produto; LA trata como ruído a cortar | `idle_sec` e `dwell_sec` guardados; invariante I2 garante `active + idle ≈ dwell` | Nenhuma |
| Tempo por material | Tempo assistido **em relação à duração** (Guo et al.) | `active_sec` no escopo `material`, por `material_tipo`; `max_depth_px` de rolagem | Sem tamanho do material, nem a rolagem nem o áudio viram fração percorrida |

### 2.2 Interação

| Métrica | Mercado e literatura | TrailUp hoje | Lacuna |
|---|---|---|---|
| Eventos de navegação | Eventos automáticos de tela e primeiro plano | 15 tipos em 5 grupos, `screen_name`, `route_name` | Nenhuma |
| Toque e rolagem | Mapas de calor em ferramentas de UX; pouco uso pedagógico | `touch_count`, amostras de coordenada (teto 25), `scroll_distance_px` | A spec já proíbe mostrar ao professor (§6.2). Nenhuma |
| Ajuda e dica | Pedido de dica é variável central em tutores (Baker) | `chat_open`/`chat_message` com `trigger_context` (`after_error`…) | Coberto o suficiente para o que se usa hoje |
| Abuso do sistema | *Gaming the system* (Baker); farming em gamificação | "taxa de farming" prevista em `dev.gamificacao` (spec §6.3) | Fora deste documento |

### 2.3 Desempenho

| Métrica | Mercado e literatura | TrailUp hoje | Lacuna |
|---|---|---|---|
| Acerto | Acerto por questão e por participante (Kahoot); de primeira tentativa (tutores) | `questao_aluno.tentativa = 1` como fonte única (D-5); usado em `pr3` e no estudo | Nenhuma de definição |
| Questão difícil | < 35% de acerto (Kahoot) | `prof.questao_problema`: `p < 0,30` ou discriminação < 0,10 | Nenhuma: o TrailUp é mais exigente e acrescenta discriminação |
| Domínio | Níveis de habilidade (Khan); BKT; HLR para memória (Duolingo) | M2 em sombra, `requer_validacao = 'ml'` | Fora deste documento (F6) |
| Progresso que trava | *Wheel-spinning* (Beck e Gong) | `prof.estagnado` mede **tempo sem avanço** no tópico; nada mede **tentativa sem avanço** | **Falta**: aluno que repete a atividade e não chega lá |

### 2.4 Continuação e retenção

| Métrica | Mercado e literatura | TrailUp hoje | Lacuna |
|---|---|---|---|
| Retenção D1/D7/D30 | N-day, *unbounded* e *bracket* (Amplitude); D1/D7/D28 em jogos | Nada por coorte. O relatório de 05/11 descartou D1/D7/D30 de calendário para turma | **Falta** retenção por **semana desde a matrícula** (*bracket*), que é o que sobra de útil do D7/D28 |
| Retorno da semana | CURR | `retorno_semanal_pct` (`20261031_05`): ativos numa semana que voltam na seguinte | É uma CURR semanal. Falta separar quem voltou |
| Estados | Novo, atual, reativado, ressuscitado, em risco (Duolingo) | Sinais por aluno: `inativo_desde` (7 d), `evadido_desde` (30 d), `estagnado_desde` | **Falta** a contagem por estado e as taxas de transição por turma e semana |
| Sequência de dias | Mecanismo central do Duolingo | `aluno.sequencia`, só para o aluno, com congelamento | Nenhuma. Não vira meta (ECA Digital, art. 8º, IV) |
| Abandono | Trajetórias (Kizilcec); modelos de evasão | `prof.risco_abandono` pelo modelo do core (coeficientes do OULAD, a recalibrar) | Fora deste documento |

### 2.5 Uso da plataforma

| Métrica | Mercado e literatura | TrailUp hoje | Lacuna |
|---|---|---|---|
| DAU/WAU/MAU | DAU/MAU como "aderência" | "Ativos na semana" por turma como contagem ("21 de 30") | Decisão mantida: DAU/MAU não entra |
| Frequência | Sessões por usuário por período | Dias com acesso por semana no painel técnico | Falta a mesma conta para **estudo**, depende da sessão canônica |
| Funil | Funil de ativação (Amplitude); NURR e primeira semana (Duolingo) | "Ativação inicial" proposta em 05/11, não implementada | **Falta**: matrícula → acesso → primeiro estudo → primeira entrega → primeiro tópico concluído |

### 2.6 Efetividade

| Métrica | Mercado e literatura | TrailUp hoje | Lacuna |
|---|---|---|---|
| Ganho de aprendizagem | Pré/pós com teste externo (Duolingo, Khan); ganho normalizado (Hake); teste atrasado | F7 prevista, sem instrumento. `metricas_estudo_coortes` compara indicadores de uso e acerto antes e depois do corte | Falta o **instrumento** de pré/pós. Depende de CEP e TCLE/TALE |
| Efeito da personalização | Teste A/B (Duolingo); dose × ganho (Khan) | Diferença-em-diferenças por turma com trava do baseline e acusação de contaminação; `pr3` perfil × formato | Nenhuma de cálculo. O que falta é amostra |
| Efeito da recomendação | Avaliar a decisão: o que recomendou, se foi seguida, o desfecho (spec §6.4) | `personalizacao_sugestao_log` guarda a decisão; nada mede se foi seguida | **Falta** a aderência e o desfecho comparado |

## 3. O que não importar, e por quê

| Prática de mercado | Por que não entra no TrailUp |
|---|---|
| DAU/MAU como indicador | Mede uso voluntário. Com uma aula por semana e 100% de presença dá ~18% (**Cálculo próprio**, relatório de 05/11) |
| D1/D7/D30 de calendário | O aluno não "instala": é matriculado. A retenção útil é relativa à matrícula e por semana (§4.3) |
| Meta de sequência de dias ou de "mais acessos" | ECA Digital, Lei 15.211, art. 8º, IV: dever de evitar uso compulsivo. A sequência continua visível ao aluno, sem meta |
| Score de engajamento composto ou rótulo "desengajado" | Aproxima de perfilamento (Lei 15.211, art. 2º, V); a spec §6.2 já proíbe |
| Minutos como resultado | A própria Khan Academy trocou minutos por habilidades; atividade online correlaciona pouco com resultado (relatório de 05/11) |
| Benchmarks de jogo como meta | D1 de 22% ou sessão de 5 min descrevem outro público e outra motivação |

## 4. Proposta de ajuste, priorizada

Regras comuns a todas as métricas novas, já em vigor no repositório:

- calculadas **no banco** (view `security_invoker` ou RPC que confere a posse), nunca na API;
- dia e semana no fuso `America/Sao_Paulo`; semana de segunda a domingo;
- "sem dado" é `NULL`, não 0; percentual com o denominador ao lado;
- uma chave nova em `metricas_catalogo` por métrica, com as invariantes de que depende;
- agregado de pesquisa (dev, TCC) só com `vw_alunos_pesquisa_elegiveis` e supressão abaixo de
  `n_minimo`; o painel do professor dono usa a turma inteira, como as RPCs atuais;
- **"semana ativa de estudo"** (definição usada em §4.2 e §4.3): semana em que o aluno, **naquela
  turma**, teve ao menos um destes fatos — lote com `active_sec > 0` no escopo `topic`; tentativa de
  atividade respondida (`atividade_tentativas.respondida_em`, relógio do servidor); primeira
  conclusão de tópico (`topico_aluno_conclusao`). Login sem estudo não conta. As duas últimas fontes
  não dependem do consentimento de telemetria.

### P1. Sessão de estudo canônica — banco, sem app novo

| Campo | Definição |
|---|---|
| O que é | Período contínuo de estudo do aluno numa turma, cortado por **30 min sem lote de estudo** |
| Regra | Lotes com entrada no escopo `topic`, ordenados pelo início (`captured_at − dwell_sec`). Abre sessão nova quando o início do lote fica mais de 30 min depois do fim do anterior. Uma sessão pode juntar várias telas e vários tópicos |
| Colunas | `inicio`, `fim`, `presenca_seg` (Σ `dwell_sec`), `tempo_ativo_seg` (Σ `active_sec`), `lotes`, `topicos`, `telas` (`telemetria_sessoes` distintas), `engajada` (`tempo_ativo_seg ≥ 10`) |
| Métricas derivadas | Sessões de estudo por aluno ativo na semana (mediana e faixa); duração mediana; tempo ativo mediano por sessão; fração de sessões engajadas |
| Fonte | `telemetria_time_metric_entries` (escopo `topic`) |
| Onde | View `vw_metricas_sessoes_estudo` (`security_invoker`) e um bloco na RPC nova da P2/P3 |
| Público | Professor (contagens da turma) e dev |
| Marca | 30 min: **Fonte externa** (Firebase/GA4); 10 s de "engajada": **Fonte externa** (GA4, já citado em 05/11) |
| Por quê | Faz "sessões por aluno" significar visitas, não telas, e permite comparar com qualquer referência externa. Não muda `vw_metricas_sessoes_aluno_dia`, que segue sendo o denominador da I16 |

Limite: a fusão usa o relógio do aparelho (`captured_at`), que o aluno controla. Sessão não entra em
nota nem em XP, então o risco é só de medida.

### P2. Funil de ativação por turma — banco, sem app novo

| Passo | Fato | Fonte |
|---|---|---|
| 0 | Matriculado | `min(classe_aluno.created_at)` |
| 1 | Entrou no app depois da matrícula | `aluno_sessoes_app.iniciada_em` |
| 2 | Abriu um tópico da turma | primeiro lote no escopo `topic` da turma |
| 3 | Estudou 1 min ativo na turma | Σ `active_sec` no escopo `topic` ≥ 60 |
| 4 | Entregou a primeira atividade | `min(atividade_tentativas.respondida_em)` |
| 5 | Concluiu o primeiro tópico | `min(topico_aluno_conclusao)` |

| Campo | Definição |
|---|---|
| Saída por passo | `alunos` que chegaram (com o total de matriculados ao lado), `mediana_dias` desde a matrícula, `chegaram_em_7_dias` |
| Regra | Cada passo é contado sozinho, não exige o anterior: quem recusou telemetria pode entregar atividade sem aparecer nos passos 2 e 3, e isso fica visível em vez de sumir |
| Onde | RPC nova `metricas_continuidade_turma(classe_id, inicio, fim, tz)`, bloco `funil` |
| Público | Professor dono e dev |
| Marca | 7 dias: **Fonte externa**, adaptada (primeira semana como ponto frágil, Duolingo, **secundária**); passos: **Proposta** |
| Ação | Aluno parado no passo 1 ou 2 costuma ser problema técnico ou de acesso, que tem conserto |

### P3. Retenção por semana e estados — banco, sem app novo

Adapta o modelo do Duolingo à **semana** e à **semana ativa de estudo**, porque o ritmo do TrailUp é
a aula semanal, não o dia.

| Estado na semana `s` | Regra (só matriculados até o fim de `s`) |
|---|---|
| novo | a primeira semana ativa do aluno na turma é `s` |
| atual | ativo em `s` e em `s−1` |
| reativado | ativo em `s`, inativo em `s−1`, ativo em alguma de `s−4…s−2` |
| ressuscitado | ativo em `s`, inativo em `s−4…s−1`, ativo antes disso |
| em risco | inativo em `s`, ativo em `s−1` |
| dormente | inativo em `s` e em `s−1`, ativo alguma vez antes |
| nunca ativo | nenhuma semana ativa até `s` |

| Taxa | Fórmula |
|---|---|
| Retorno de atuais (CURR semanal) | atuais em `s` ÷ ativos em `s−1`. É a conta do `retorno_semanal_pct` atual, agora com a semana na série |
| Retorno de novos (NURR semanal) | novos de `s−1` ativos em `s` ÷ novos de `s−1` |
| Reativação | (reativados + ressuscitados em `s`) ÷ (em risco + dormentes em `s−1`) |
| Retenção por semana do curso | % dos matriculados ativos na semana `k` desde a matrícula, `k = 1…8`; só entra no denominador quem já completou `k` semanas (conta *bracket* do Amplitude, que corrige o viés do denominador) |

| Campo | Definição |
|---|---|
| Onde | Mesma RPC, blocos `estados_semanais` e `retencao_por_semana_do_curso` |
| Público | Professor dono (contagens, nunca lista de nomes por estado) e dev; versão de pesquisa com supressão |
| Marca | Estados: **Fonte externa**, adaptada (Duolingo, dia → semana); janela de 4 semanas para "reativado": **Proposta** |
| Limite | Sem calendário escolar, recesso aparece como queda de todos os estados. A série precisa marcar recesso à mão até existir a grade |

### P4. Girando em falso — banco, sem app novo

| Campo | Definição |
|---|---|
| O que é | Aluno que **tenta a mesma atividade várias vezes sem chegar ao acerto mínimo** |
| Regra | Aluno × atividade com **≥ 3 tentativas respondidas** em `atividade_tentativas` e **melhor `acertos_percentual` < 70**. Sai do estado na primeira tentativa ≥ 70 |
| Saída para o professor | Por atividade: quantos alunos estão girando em falso, de quantos que tentaram. Por aluno, como fato e data: "3 tentativas, melhor 40%, última em 12/11" |
| Onde | View `vw_metricas_girando_em_falso` (`security_invoker`, posse do professor), chave `prof.girando_em_falso` |
| Público | Só professor dono. **Nunca** ao aluno, nunca somado a inatividade para virar "crítico" (spec §6.2) |
| Marca | Conceito: **Fonte externa** (Beck e Gong, 2013, adaptado de 10 oportunidades de prática para 3 tentativas de atividade inteira); 70%: **Proposta**, alinhado à faixa mínima do bônus de tempo (`20261101_13`) |
| Ação | Apoio direto ou revisão da atividade. Diferente de `prof.estagnado`, que mede tempo sem avanço |

### P5. Aderência à ordem aconselhada — banco, sem app novo, só dev

| Campo | Definição |
|---|---|
| O que é | Se o aluno começou pelo material que o motor de sugestão pôs em primeiro, e o que aconteceu depois |
| Regra | Para cada sugestão vigente (aluno × tópico × conteúdo), o primeiro material personalizado aberto **depois** de `atualizado_em` (primeiro lote no escopo `material` daquele tópico): `seguiu = material_tipo` igual ao primeiro formato de `ordem`. Desfecho: acerto de primeira tentativa (`questao_aluno.tentativa = 1`) nas atividades do tópico, com intervalo de Wilson, para quem seguiu e para quem não seguiu |
| Onde | RPC `metricas_aderencia_sugestao(classe_ids[], inicio, fim)`, só para dev; chave `dev.aderencia_sugestao` |
| Público | Dev e TCC, com `vw_alunos_pesquisa_elegiveis` e supressão |
| Marca | **Proposta**, sobre a spec §6.4 |
| Limite | Observacional: quem segue a sugestão pode ser quem já ia melhor. O número diz se vale testar, não que a sugestão funciona |

Antes de implementar, conferir no código do motor (`sugestao_material.py`) que os nomes de formato
em `ordem` são os mesmos de `material_tipo` na telemetria. Se não forem, o mapa entra na função, com
teste.

### P6. Cobertura do material — precisa de app novo

| Campo | Definição |
|---|---|
| O que é | Fração do material percorrida: texto (rolagem máxima ÷ altura rolável), áudio (maior posição ouvida ÷ duração), apresentação (slides vistos ÷ total) |
| Coleta nova | No escopo `material` do lote: `conteudo_altura_px` e `janela_altura_px` (texto), `midia_duracao_seg` e `midia_posicao_max_seg` (áudio), `slides_vistos` e `slides_total`. Campos opcionais, para build antigo continuar gravando |
| Onde | Colunas novas em `telemetria_time_metric_entries`, preenchidas nos dois caminhos (API e direto); a fração é calculada numa view |
| Marca | **Fonte externa** (Guo et al., tempo relativo à duração) |
| Custo | Build novo, versão mínima e espera da adoção. Por isso é o último |

### P7. Ganho de aprendizagem — fora do escopo, só desenho

Instrumento de pré/pós com formas paralelas, ganho normalizado `(pós − pré) / (100 − pré)` por
aluno e por turma, e teste atrasado de 2 a 4 semanas. É a F7 da spec e depende de CEP e TCLE/TALE.
Este documento não propõe tabela: o desenho do instrumento é pedagógico e vem antes.

### Fora da proposta

- **Corte de 15 s do tempo ativo.** Kovanović mostra que a escolha importa, mas testar outro corte
  exige reprocessar eventos brutos que o lote não guarda. Fica registrado como limitação.
- **DAU/MAU, D1/D7/D30 de calendário, meta de sequência.** Ver §3.

## 5. Escopo de implementação sugerido

| PR | Conteúdo | App novo? | Depende de |
|---|---|---|---|
| A | P1 + P2 + P3: `vw_metricas_sessoes_estudo`, `metricas_continuidade_turma`, chaves no catálogo, testes de estrutura e e2e em Postgres com os gatilhos | Não | — |
| B | P4: `vw_metricas_girando_em_falso`, chave `prof.girando_em_falso`, testes | Não | — |
| C | P5: `metricas_aderencia_sugestao`, chave `dev.aderencia_sugestao`, testes | Não | Conferir o mapa de formatos |
| D | P6: coleta no app (os dois caminhos, API e direto) e colunas no banco | **Sim** | Versão mínima e build |

A, B e C não mexem no coletor nem no pipeline de análise: só leem tabelas que já existem. A
telemetria e a realimentação por ciclo ficam intactas. Exibir os números no console é um passo
separado, que este documento não decide.

A cabeça do Alembic na `main` é `20261110_04` (nome fora de ordem: a cadeia passa por `20261115_03`
antes dela). As migrations novas partem dela, e o número precisa ser conferido de novo antes do
sync, por causa da colisão entre PRs.

## 6. O que não afirmar no TCC

- Que o TrailUp "mede retenção como o Duolingo": a definição é adaptada (dia → semana, uso →
  estudo).
- Que 30 min de corte de sessão é "o padrão": é o do Firebase/GA4; o Amplitude usa 5 min.
- Que tempo ativo mede atenção ou aprendizagem: mede interação com o material aberto, estimada com
  um corte de 15 s nunca validado.
- Que aderência à sugestão prova efeito da recomendação: é observacional.
- Números de efeito de Duolingo e Khan Academy como evidência independente: são da própria empresa.

## Referências

Empresas e ferramentas:

- Amplitude. *Track sessions*. https://amplitude.com/docs/data/sources/instrument-track-sessions
- Amplitude. *Understanding retention analytics*. https://amplitude.com/guides/retention-analytics
- Duolingo. *Growth model*. https://blog.duolingo.com/growth-model-duolingo/
- Firebase. *New changes coming to sessions and user engagement*. https://firebase.blog/posts/2018/12/new-changes-sessions-user-engagement
- Google. *Dimensions and metrics* (Analytics). https://support.google.com/analytics/answer/9191807
- Kahoot. *New free Kahoot! reports*. https://kahoot.com/blog/2020/05/06/analytics-new-free-kahoot-reports-formative-assessment/
- Khan Academy. *How do mastery levels work?* https://support.khanacademy.org/hc/en-us/articles/5548760867853
- Khan Academy. *Efficacy results, November 2024*. https://blog.khanacademy.org/khan-academy-efficacy-results-november-2024/
- Lenny's Newsletter. *How Duolingo reignited user growth*. https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth
- Game Dev Reports. *GameAnalytics: mobile gaming benchmarks in 2025*. https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks

Literatura:

- Baker, R. S. et al. (2004). Off-task behavior in the Cognitive Tutor classroom. *CHI 2004*. https://hci.rwth-aachen.de/materials/conferences/CHI2004/1p383.pdf
- Beck, J. E.; Gong, Y. (2013). Wheel-spinning: students who fail to master a skill. *AIED 2013*, LNCS 7926, 431–440.
- Corbett, A. T.; Anderson, J. R. (1995). Knowledge tracing. *User Modeling and User-Adapted Interaction*, 4, 253–278.
- Guo, P. J.; Kim, J.; Rubin, R. (2014). How video production affects student engagement. *L@S 2014*. https://up.csail.mit.edu/other-pubs/las2014-pguo-engagement.pdf
- Hake, R. R. (1998). Interactive-engagement versus traditional methods. *American Journal of Physics*, 66, 64–74.
- Jiang, X. et al. (2024). The effectiveness of Duolingo English courses in developing reading and listening proficiency. *CALICO Journal*, 41(1).
- Kizilcec, R. F.; Piech, C.; Schneider, E. (2013). Deconstructing disengagement. *LAK 2013*.
- Kovanović, V. et al. (2015). Penetrating the black box of time-on-task estimation. *LAK 2015*, 184–193; e *Journal of Learning Analytics*, 2(3), 81–110.
- Kulik, J. A.; Fletcher, J. D. (2016). Effectiveness of intelligent tutoring systems. *Review of Educational Research*, 86(1), 42–78.
- Roediger, H. L.; Karpicke, J. D. (2006). Test-enhanced learning. *Psychological Science*, 17(3), 249–255.
- Sailer, M.; Homner, L. (2020). The gamification of learning: a meta-analysis. *Educational Psychology Review*, 32, 77–112.
- Settles, B.; Meeder, B. (2016). A trainable spaced repetition model for language learning. *ACL 2016*, 1848–1858.
- VanLehn, K. (2011). The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems. *Educational Psychologist*, 46(4), 197–221.

Legislação:

- Lei 15.211/2025 (ECA Digital). https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15211.htm
