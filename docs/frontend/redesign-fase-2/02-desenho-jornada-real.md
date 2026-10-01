# Desenho — Jornada real do aluno (Fase 9)

Terceiro modo da aba **Trilha visual** do detalhe do aluno, ao lado de Hexágonos e Lista
(decisão 5 de `01-analise-dashboard.md`). Mostra os passos **na ordem em que o aluno
realmente estudou**, os desvios em relação à ordem da trilha e, por passo, um
histórico de intervenções do professor.

Protótipo: `prototipos/professor/v9/Console Visao Geral (Fase 2).dc.html`, linhas 688-800
(tela), 891-910 (passos e tipos), 1076-1123 (conectores), 913-918 e 1195-1202 (histórico).

Tudo abaixo foi conferido no banco real (somente leitura, 29/09/2026), na turma 54.

## 1. O que já existe e quem pode ler

| Fonte | O que traz | Professor lê hoje? |
|---|---|---|
| `telemetria_eventos_app` | Um evento por ação, com `occurred_at`, `topico_id`, `conteudo_id`, `atividade_id`, `questao_id`, `attempt_number`, `is_correct`. Nomes úteis: `topic_open`, `content_open`, `content_complete`, `content_revisit`, `activity_start`, `activity_complete`, `question_attempt`, `topic_complete`, `session_interrupt` | **Sim** (`telemetria_eventos_app_professor_sel`) |
| `estudo_sessoes` | Abertura e fechamento por `scope` (`topic`/`content`/`activity`), com `duracao_sec`, em pedaços de até 60 s. Existe desde 21/09/2026 | **Não**: a única policy é `aluno_id = auth.uid()`. A migration desta fase acrescenta a do professor |
| `questoes` | `enunciado`, `resposta_correta` | Sim |
| `topicos`, `atividades`, `conteudos` | nome, ordem, título | Sim |
| `eventos_aluno` | Gamificação (`atividade_acertada`…) com data | Sim, mas repete o que os eventos do app já dizem, com menos detalhe |
| `atividade_aluno`, `conteudo_aluno` | Estado atual, sem histórico (`updated_at` foi reescrito em massa) | Sim, mas não serve para ordem |
| `intervencoes` (Fase 8) | Sínteses da IA por turma ou aluno | Sim, depois da `20260929_01`, mas **não tem referência de passo** |

`scroll` e `tap` (86% dos eventos) ficam de fora: não dizem nada sobre a ordem do estudo.

## 2. O que é um passo

**Um passo é uma visita a um tópico com estudo dentro.**

- A **visita** começa no primeiro evento de um tópico e acaba quando o aluno muda de tópico
  ou fica 30 min sem evento.
- A visita **vira passo** se tiver pelo menos uma resposta, um conteúdo concluído, o tópico
  concluído, ou 60 s de tempo registrado no tópico.
- Visitas sem nada disso são **passagens rápidas** (abrir o mapa, tocar num tópico, sair).
  Elas não viram círculo, mas o total aparece na faixa de desvios ("12 passagens rápidas
  não contadas").

Por que não "um passo por atividade": o app dispara `activity_start` para os cartões
vizinhos do carrossel, no mesmo segundo. Um passo por atividade virava dezenas de passos de
1 s, a maioria ruído. No aluno com mais dado, a regra da visita dá 34 visitas e cerca de
15 passos. A escala é a mesma do protótipo, e os conectores do protótipo já são por
tópico ("voltou p/ 3").

**Referência estável do passo** (para os comentários do professor): `evento:<id>`, o `id`
(uuid) do primeiro evento da visita. Uma visita só cresce para frente, então o primeiro
evento não muda. A exceção é um evento que chegue atrasado com data anterior (envio
offline), e isso fica registrado como limitação.

## 3. De onde vem cada campo do painel

| Campo do protótipo | Fonte | Decisão |
|---|---|---|
| Conteúdo acessado | `content_open` / `content_complete` da visita + `conteudos.titulo` | "2 conteúdos abertos, 1 concluído", com os títulos |
| Atividade | atividades com `question_attempt` na visita + `atividades.titulo` | quantas foram respondidas, com os títulos |
| **Resposta dada** × esperada | **a resposta escolhida não é gravada em lugar nenhum**: o evento só diz se acertou (`is_correct`) | **Não mostrar "resposta dada"**. O campo vira **"Respostas"**: "7 de 11 certas", e em cada erro a resposta esperada (`questoes.resposta_correta`) |
| Resultado | a última tentativa de cada atividade na visita | concluído / errou / parcial / abandonou |
| Tempo gasto | soma de `estudo_sessoes.duracao_sec` (scope `topic`) aberta entre o início da visita e o início da próxima (no máximo 30 min depois do último evento). Ler não gera evento, então o fim da visita pelo último evento cortaria a leitura | Sem linha em `estudo_sessoes` (antes de 21/09, ou migration não aplicada), mostra "—". **Não** usa a distância entre o primeiro e o último evento: com o app em segundo plano ela dá 20 min onde o registro diz 5 |
| Tentativa | quantas visitas a este tópico já houve + `attempt_number` das respostas | "2ª visita ao tópico"; "refez 2 atividades" |
| Ordem em que foi feito | posição do passo na jornada | "5º de 15" |
| Progresso neste ponto | atividades da trilha acertadas até o fim do passo ÷ atividades da trilha | É o progresso **em atividades**, dito com essas palavras. Não é o percentual de `topico_aluno`, que não tem histórico |
| Leitura da IA (`noteTitle`/`note`) | não existe leitura por passo | Troca por uma **descrição determinística do desvio** ("Voltou ao tópico 3 depois do 4"), sem cara de IA |
| "Ver conteúdo entregue" | não há tela que mostre o material entregue num passo | **Não mostrar** |
| "Abrir conversa do chat" | **zero** eventos de chat no banco (`chat_role` sempre nulo, `vw_metricas_chat_aluno_classe` vazia) | **Não mostrar** |
| XP | fora do escopo desta fase | Não mostrar (a análise já mandava "usar XP real ou tirar") |
| Sugestões da IA no histórico | `intervencoes` não tem referência de passo | **Não mostrar por passo.** Pendurar uma sugestão num passo pela data seria inventar vínculo |

## 4. Desvios (função pura, com testes)

A ordem da trilha é `topicos.ordem`. Para cada passo, olhando os anteriores:

| Tipo | Regra | Conector |
|---|---|---|
| `back`: retorno | ordem do tópico < ordem do passo anterior | "voltou p/ N" |
| `skip`: fora de ordem | ordem > (maior ordem já visitada + 1): pulou tópico ainda não visitado | "pulou p/ N" |
| `retry`: repetição | tópico já visitado **e** refez atividade já respondida | "repetiu" |
| `drop`: abandono | último passo de um tópico que **hoje** não está concluído, tirando o passo mais recente da jornada se tiver menos de 7 dias (ainda pode estar em andamento) | "seguiu" |
| `err`: errou | terminou com resposta errada em alguma atividade | "seguiu" |
| `ok` | nenhum dos anteriores | "seguiu" |

Um passo pode ter mais de um desvio. A cor e o chip usam o primeiro da ordem
`drop → back → skip → retry → err → ok`, e o painel lista todos. A faixa "Desvios
detectados" conta retornos, fora de ordem, repetições e abandonos.

## 5. Banco — migration `20260929_02` (não aplicada)

1. **`estudo_sessoes_professor_sel`**: o professor lê as sessões de estudo das classes dele
   (`classe_id IN app_classes_do_professor()`). Sem isso, o tempo por passo fica "—".
2. **Tabela `professor_intervencoes_passo`**: `professor_id` (default `auth.uid()`),
   `aluno_id`, `classe_id`, `passo_ref`, `topico_id`, `texto` (1 a 2000 caracteres),
   `created_at`.
   - RLS: o professor lê e insere só nas classes dele, e o aluno precisa ser dele.
   - Só existem SELECT e INSERT: um comentário registrado é histórico e não se edita.
   - O aluno não lê.
3. **Sem view nova.** O aluno com mais dado tem 584 eventos úteis, e a montagem no cliente é
   uma passada linear. Uma view não cortaria trabalho e prenderia a regra de passo no SQL,
   onde é mais difícil testar.

## 6. O que não dá para obter

- A **resposta escolhida** pelo aluno (só se ele acertou).
- **Chat**: nenhum dado.
- **Tempo antes de 21/09/2026**: `estudo_sessoes` não existia.
- **Leitura da IA por passo** e sugestão da IA ligada a um passo.
- Histórico do **percentual do tópico** no tempo (só existe o valor atual).
