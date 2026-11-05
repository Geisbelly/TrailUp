# Notificações v2: mais tipos, mais controle, orçamento por categoria

Data: 2026-11-05 · Status: Fase 1 (motor) em `20261105_03`; fases 2 a 5 por fazer

## Por quê

Medido em produção em 05/11/2026 (só leitura):

- 297 dos ~440 avisos na caixa dos alunos são `revisao_diaria`. Fora a rotina, quase nada chega.
- Cada tipo tem um texto fixo por perfil (`notificacoes_textos_perfil`). O aluno lê a mesma frase todo dia.
- O aluno tem uma rotina por tipo (`UNIQUE (aluno_id, tipo)`), sem escolher dias da semana; `semanal`
  repete a cada 7 dias a partir de quando foi salva.
- Não existe intervalo mínimo por tipo. O anti-spam é o teto de 6 por dia, o dedupe por tipo × motivo
  × dia, o silêncio fixo de 22h a 7h e o modo foco.
- A matriz de Monterrat (`20261102_18`) **corta** quem tem peso abaixo de 50%: o Socializer nunca
  recebe `rank`, e só Seeker e Achiever recebem `novo_material`.
- Missão nova, evento abrindo, prazo chegando, atividade nova, guilda e batalha não avisam ninguém.
- Chat e convite entram direto em `notificacoes` (`social_notificar_evento`), por fora do motor: não
  respeitam teto, silêncio nem foco.

## Decisões (Geisbelly, 05/11)

1. **Texto híbrido.** Banco de variações para os disparos constantes, gerado em lote pela IA e
   revisado. IA ao vivo só nos momentos de alto valor, como já é hoje (`agente_notificacao`).
2. **Avisos da turma:** missão e evento, prazos, conteúdo e atividade nova, alterações do professor,
   recado do professor, mensagens do chat, guildas (silenciável), batalhas, e rank **subiu** e rank
   **caiu** como tipos separados.
3. **Perfil prioriza, não exclui.** Todo aluno pode receber todo tipo; o peso do perfil decide a
   ordem e quem fica de fora quando o orçamento aperta.
4. **O aluno controla** dias da semana, vários horários e o próprio silêncio.
5. **Intensidade é dado do sistema, por aluno**, calculada pelo uso. O aluno não escolhe.
6. **Anti-spam por orçamento de categoria**, além do intervalo mínimo por tipo.

Tudo isso é motor de entrega, sem modelo de linguagem: vive no banco (regra de fronteira). A API só
entra para gerar o lote de variações (Fase 5) e continua com a sugestão da IA de hoje.

## Catálogo de tipos

Proposta. Prioridade base de 0 (baixa) a 3 (urgente). "Intervalo" é o mínimo entre dois pushes
**do mesmo tipo** para o mesmo aluno.

| Categoria | Tipo | Quem produz | Intervalo | Prio. | Silenciável |
|---|---|---|---|---|---|
| estudo | `revisao_diaria` | rotina do aluno | 6 h (era 20 h: a fase 2 permite 3 horários por dia) | 1 | sim |
| estudo | `retomada_login` | login | 20 h | 1 | sim |
| estudo | `pausa_saudavel` | tempo de uso | 3 h | 1 | sim |
| estudo | `lembrete`, `suporte` | IA (`notificacoes_ia`) | 12 h | 2 | sim |
| estudo | `sequencia` | gatilho (já existe) | 20 h | 1 | sim |
| turma | `novo_material` | gatilho (já existe) | 6 h | 1 | sim |
| turma | `conteudo_novo` | gatilho em `topicos`/`conteudos` (publicado) | 6 h | 1 | sim |
| turma | `atividade_nova` | gatilho em `atividades` | 3 h | 2 | sim |
| turma | `missao_nova` | gatilho em `missoes` (`ativa`) | 3 h | 2 | sim |
| turma | `prazo_24h` | cron sobre `atividades.data_entrega` e `missoes.janela_fim`, só quem não entregou | 6 h | 2 | sim |
| turma | `prazo_2h` | idem | 1 h | 3 | não |
| turma | `evento_abrindo` | cron (`eventos_classe.inicio`), e "começa em 1 h" | 2 h | 2 | sim |
| turma | `evento_terminando` | cron (`eventos_classe.fim` − 1 h) | 2 h | 2 | sim |
| turma | `alteracao` | `alteracao_aluno` (já existe, passa a entrar pelo motor) | 3 h | 2 | não |
| turma | `recado_professor` | RPC do console | sem intervalo | 3 | não |
| social | `chat_privado` | gatilho (já existe, passa a entrar pelo motor) | 10 min, agrupado | 2 | sim |
| social | `guilda_mensagem` | gatilho em `guilda_mensagens`, agrupado | 30 min | 1 | sim |
| social | `guilda_convite` | gatilho em `guilda_convites` | 1 h | 2 | sim |
| social | `amigo_rank` | já existe | 12 h | 1 | sim |
| competição | `rank_subiu` | snapshot do rank (já existe como `rank`) | 12 h | 1 | sim |
| competição | `rank_caiu` | idem, hoje desligado (`rank_notificar_descida = 0`) | 24 h | 1 | sim |
| competição | `batalha_desafio` | gatilho em `guilda_desafios` (novo desafio) | 1 h | 2 | sim |
| competição | `batalha_resultado` | `guilda_desafios.status` encerrado | 3 h | 1 | sim |
| conquista | `conquista` | gatilho (já existe) | 1 h | 1 | não |

**Agrupado**: dentro do intervalo, a pendente que ainda não saiu é reescrita ("Ana e mais 2 mandaram
mensagens") em vez de criar outra, o mesmo mecanismo de `novo_material` que conta tópicos.

`rank` vira `rank_subiu`. Quem silenciou `rank` continua silenciado nos dois.

## Orçamento por categoria

Teto por aluno e por dia local, contado sobre o que **saiu** (push enviado ou entrega na caixa):

| Categoria | Teto/dia | Observação |
|---|---|---|
| estudo | 2 | rotinas + IA |
| turma | 3 | `prazo_2h` e `recado_professor` furam o teto da categoria, nunca o global |
| social | 3 | chat agrupado conta 1 por janela |
| competição | 2 | |
| conquista | 2 | excedente vai só para a caixa, sem push |

O **teto global** continua (hoje `max_por_dia = 6`) e passa a vir da intensidade do aluno.

Além disso, **30 min entre dois pushes quaisquer**. Exceção: prioridade 3. O que não cabe espera a
próxima janela livre até expirar. Se expirar, vai para a caixa sem push, e `motivo = orcamento`.

### Quem perde a vaga

Quando duas pendentes disputam a mesma vaga, sai antes a de maior **prioridade efetiva**:

```
prioridade_efetiva = prioridade_base + peso_do_perfil(tipo, perfil da tela)
```

O peso vem da matriz de Monterrat estendida aos tipos novos, de 0 a 1. Com isso o Socializer **recebe**
`rank_subiu` (peso 0,13), mas perde a vaga para quase qualquer outra coisa. `perfil_peso_minimo_pct`
deixa de barrar: vira 0 e fica para quem quiser voltar a cortar. O perfil usado é o da tela
(`notificacoes_perfil_do_aluno`, PR #961), não o dominante.

## Intensidade por aluno

Tabela `aluno_notificacao_intensidade` (só `SECURITY DEFINER`; aluno não lê nem escreve), recalculada
por `pg_cron` uma vez por dia:

| Nível | Teto global/dia | Quando |
|---|---|---|
| `baixa` | 3 | abriu menos de 10% dos pushes nos últimos 14 dias, **ou** silenciou 2+ tipos |
| `normal` | 6 | padrão, e todo aluno com menos de 10 pushes na janela |
| `alta` | 8 | abriu 40%+ e usa o app em 4+ dias da semana |

"Abriu" é `notificacoes.read` ou a abertura pelo push (o app já registra a leitura). Os limiares vão
para `notificacoes_config` e a mudança de nível vai para um log append-only, para a análise do TCC.
O professor vê o nível no console, só leitura.

## Controle do aluno

- **Dias da semana:** `notificacoes_agendamentos.dias_semana smallint[]` (ISO, 1 = segunda), nulo = todo dia.
  `notificacoes_proxima_ocorrencia` pula os dias fora da lista.
- **Vários horários:** a chave de unicidade passa a `(aluno_id, tipo, hora_local, minuto_local)`.
  Limite de 3 horários por tipo, conferido na RPC. A `notificacoes_salvar_rotina` aceita `p_dias_semana`.
  O app agenda cada horário localmente, como já faz com a diária.
- **Silêncio próprio:** `alunos_notificacao_preferencias (aluno_id, silencio_inicio, silencio_fim)`,
  com o padrão de `notificacoes_config` (22h e 7h). Mínimo de 6 h e máximo de 14 h, para o aluno não
  zerar o silêncio por engano nem calar o dia inteiro.
- Tela no app: a de lembrete diário (`perfil/lembrete-diario.tsx`) vira "Notificações", com os dias,
  os horários, o silêncio e a lista dos tipos silenciáveis.

## Texto: banco de variações

Decisão de 05/11: o banco cresce **em lotes de 3 em 3 dias**, primeiro X variações, depois mais X,
até o teto de **500**. Cada variação leva **pesos de características**, e o sorteio escolhe a que mais
combina com o estado do aluno naquele momento. O texto usa **variáveis** para os dados, nunca o dado
escrito.

### A variação

`notificacoes_variacoes`:

| Coluna | O que guarda |
|---|---|
| `tipo`, `perfil` | para quem e para quê (perfil BrainHex da tela) |
| `titulo`, `corpo` | com variáveis, ex.: "{nome}, faltam {prazo_horas} h para {atividade}" |
| `variaveis text[]` | as variáveis que o texto usa; o banco confere na gravação |
| `caracteristicas jsonb` | pesos de 0 a 1 por característica (abaixo) |
| `lote`, `gerada_em`, `modelo` | rastreio do lote |
| `ativo`, `motivo_inativa` | |
| `enviadas`, `abertas` | contadores para medir a variação |

### Estado alvo: emoção e empenho também são tipos

Decisão de 05/11: além do tipo da notificação, cada variação é escrita **para um estado do aluno**,
e o estado é um eixo de primeira classe, não só um peso. O banco tem um conjunto próprio de variações
para cada estado, dentro do teto de 500 do tipo:

| Eixo | Estados | De onde vem |
|---|---|---|
| emoção | `neutro`, `frustrado`, `ansioso`, `sobrecarregado`, `cansado`, `confiante` | último `kind` em `aluno_mental_state_history` (os quatro negativos são os da recorrência do `agente_intervencao`) |
| empenho | `engajado`, `oscilando`, `estagnado`, `inativo`, `quase_abandonando` | `vw_metricas_engajamento_aluno_classe`: `risco_abandono_faixa` do modelo de evasão do core (`20261031_08`; `alto` = quase abandonando, `atencao` = oscilando) e os sinais de inativo e estagnado da `20261031_05` |

Coluna nova `estado_alvo` em `notificacoes_variacoes` (ex.: `emocao:frustrado`, `empenho:quase_abandonando`,
ou `qualquer`). O sorteio tenta primeiro as variações do estado atual do aluno, empenho antes de
emoção quando os dois valem, e cai em `qualquer` se o estado não tiver nenhuma elegível. A geração
em lote divide os X de cada tipo × perfil entre os estados, com prioridade para os estados com menos
variações.

Empenho também muda **quanto** o aluno recebe, não só o texto: `quase_abandonando` e `inativo`
recebem menos e melhor (teto da intensidade `baixa`, com a vaga indo para reengajamento e novidade da
turma). Insistir em quem está saindo empurra a saída. Os coeficientes do modelo de evasão são de
universitários do Reino Unido (o próprio core avisa); a faixa vale como sinal, não como diagnóstico.

### Características (pesos de 0 a 1)

O modelo atribui os pesos ao gerar; a guarda confere que todos estão entre 0 e 1 e que nenhuma
característica fora da lista aparece.

| Grupo | Características | Casa com o estado do aluno |
|---|---|---|
| emoção | `acolhe_frustracao`, `acalma_ansiedade`, `poupa_cansaco`, `celebra_confianca` | último `kind` em `aluno_mental_state_history` (janela da memória, `_JANELA_RECORRENCIA`) |
| empenho | `reengaja`, `sem_cobranca`, `retoma_ritmo` | faixa de risco e sinais de inativo e estagnado |
| progresso | `comeco`, `meio`, `quase_la` | `topico_aluno.percentual_concluido` do tópico em foco |
| ausência | `retorno_curto`, `retorno_longo` | dias desde a última sessão (`aluno_sessoes_app`) |
| ritmo | `sequencia_viva`, `sequencia_quebrada` | sequência de dias (`aluno_atividade_diaria`) |
| momento | `manha`, `tarde`, `noite`, `fim_de_semana` | hora e dia locais do aluno |
| urgência | `calma`, `urgente` | horas até o prazo, quando há prazo |
| social | `turma`, `individual` | se o aluno tem guilda ou amigos ativos |

### O sorteio

Ao enfileirar, o banco (`notificacoes_escolher_variacao(aluno, tipo, contexto)`):

1. lê o **estado do aluno** em um registro só (emoção, progresso, ausência, sequência, momento,
   urgência, social), com o mesmo cuidado da `ler_memoria`: estado que não se lê vira neutro, nunca erro;
2. filtra por tipo e perfil da tela, ativas, e **só as que têm todas as variáveis disponíveis** para
   aquele evento (sem `{prazo_horas}`, uma variação que o usa não entra);
3. tira as últimas 5 que o aluno recebeu do mesmo tipo (`notificacoes_variacoes_uso`);
4. dá a cada uma a nota `soma(peso da característica × sinal do estado)`, mais um pequeno peso pela
   taxa de abertura da variação (só depois de 20 envios, para não premiar o acaso);
5. **sorteia ponderado** pela nota entre as 5 melhores, em vez de pegar sempre a primeira: a melhor
   sai mais, mas o aluno não lê sempre a mesma;
6. sem nenhuma elegível, cai no texto de hoje (`notificacoes_textos_perfil`).

O `contexto` da notificação guarda a variação escolhida e as notas, para a análise do TCC saber por que
aquela saiu.

### Variáveis

Resolvidas pelo banco na hora de enfileirar, como `{nome}` e `{guia}` já são
(`notificacoes_resolver_texto`). O nome nunca vai ao modelo: ele escreve a variável.

`{nome}` `{guia}` `{turma}` `{topico}` `{atividade}` `{missao}` `{evento}` `{professor}`
`{prazo_horas}` `{prazo_data}` `{percentual}` `{dias_sem_entrar}` `{sequencia_dias}` `{posicao}`
`{posicoes_mudou}` `{colega}` `{colegas_n}` `{guilda}` `{guilda_rival}`

A lista fica numa tabela (`notificacoes_variaveis`, com o tipo de dado e os tipos de notificação que a
fornecem), e o prompt da geração recebe só as variáveis que aquele tipo fornece.

### Geração em lotes de 3 em 3 dias

Pela regra de fronteira, **o relógio fica no banco e o modelo na API**:

- `pg_cron` roda a cada 3 dias e, para cada tipo × perfil abaixo da meta, grava um pedido em
  `notificacoes_variacoes_pedidos`. Não chama nada fora do banco.
- O worker da API (o mesmo laço que já processa a fila de personalização) pega os pedidos e faz **uma
  chamada por tipo × perfil**, pedindo X variações com as características e as variáveis.
- Cada variação passa pela guarda `problemas_do_texto` (jargão, tamanho, marcador inválido) e pela
  checagem de variáveis e pesos. **Reprovada não é gravada.** Aprovada entra **ativa**, porque com lotes
  automáticos a revisão humana vira gargalo; o console mostra as variações e o professor ou a equipe
  pode desativar qualquer uma (`motivo_inativa`).
- Pedido que falha (cota, modelo fora) fica para o próximo ciclo; nada é inventado.

**Tamanhos (proposta):**

- X = 4 variações por tipo × perfil por lote (25 tipos × 7 perfis × 4 = até 700 textos por ciclo,
  em 175 chamadas).
- Teto de 500 **por tipo**, somando os 7 perfis (cerca de 70 por perfil). Ao chegar no teto, o tipo
  para de pedir lote novo.
- Depois do teto, cada ciclo pode **trocar** as 10% piores do tipo (menor taxa de abertura, com 20+
  envios) por novas, em vez de crescer.

## Custos
## Custos

- **Disparo:** zero de modelo. `pg_cron` já roda a cada 5 min; os crons novos de prazo e evento
  rodam a cada 5 min e leem só o que vence nas próximas 25 h, pelo índice em `data_entrega` / `fim`.
  O push é um `pg_net` → Expo por notificação. Com 6 a 8 por aluno por dia, 100 alunos dão
  cerca de 800 chamadas por dia, dentro do Expo gratuito e sem peso relevante no plano Free do Supabase.
- **Lote de variações:** no máximo 175 chamadas ao Gemini a cada 3 dias (uma por tipo × perfil),
  menos à medida que os tipos chegam ao teto. Com X = 4 e teto de 500 por tipo, o banco enche em cerca
  de 18 ciclos (~54 dias). O worker para de pedir se a cota do dia passar de um limite em
  `notificacoes_config` (proposta: 60 chamadas por dia), para não tirar a cota do teste com turma real
  (#949) nem do mentor.
- **IA ao vivo:** não muda. Continua só no ciclo de telemetria.

## Fases (um PR cada, a partir da `main`)

1. **Motor:** categorias, orçamento, intervalo por tipo, intervalo global, prioridade efetiva pelo
   perfil da tela (sem cortar), intensidade calculada. Chat e convite passam a entrar pelo motor.
2. **Controle do aluno:** dias da semana, vários horários, silêncio próprio (banco + tela no app).
3. **Turma:** `conteudo_novo`, `atividade_nova`, `missao_nova`, `prazo_24h`/`prazo_2h`,
   `evento_abrindo`/`evento_terminando`, `alteracao` pelo motor, `recado_professor` (RPC + console).
4. **Social e competição:** `guilda_mensagem`, `guilda_convite`, `batalha_desafio`,
   `batalha_resultado`, `rank_subiu`/`rank_caiu`.
5. **Variações:** tabelas (variações, variáveis, uso, pedidos), estado do aluno, sorteio ponderado
   pelas características, pedido de 3 em 3 dias pelo banco, geração e guarda no worker da API, e a
   lista no console para desativar.

Cada fase traz o e2e no Postgres local (esqueleto da produção, papéis reais), como os das
`20261102_*`. Nenhuma migração é aplicada em produção fora do deploy.

## Em aberto

- ~~Teto de 500~~ decidido: **por tipo**, cobrindo os estados de emoção e de empenho.
- X por lote (proposta: 4 por tipo × perfil) e o limite diário de chamadas do worker (proposta: 60).

- Os números das três tabelas (intervalos, orçamento e limiares de intensidade) são proposta.
- ~~`recado_professor`~~ decidido: **2 por turma por dia**.
- Os pesos por perfil dos tipos novos: proponho derivar da matriz de Monterrat que já usamos
  (competição alta para Conqueror e Daredevil, social para Socializer, turma e prazo para Achiever e
  Survivor) e registrar a fonte de cada peso na migração.
