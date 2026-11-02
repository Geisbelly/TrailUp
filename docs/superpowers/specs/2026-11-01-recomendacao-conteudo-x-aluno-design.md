# Recomendação de material: o conteúdo cruzado com o aluno

Data: 01/11/2026. Migration `20261102_07`. Continua a
[sugestão de material por aluno](2026-08-25-sugestao-de-material-por-aluno-design.md) e a
[sugestão com evidência](2026-11-01-sugestao-com-evidencia-e-notificacao-no-horario-design.md).

## Pedido

A API deve recomendar a disposição, os tipos e a ordem do material de cada aluno, a partir das
características e das métricas dele. A recomendação deve mudar quando uma necessidade do aluno é
analisada, e cada mudança fica no log com o motivo.

A usuária acrescentou: o conteúdo também decide. Há conteúdo que depende de ser visto, e há
produto que precisa ser escrito e visual. A preferência do aluno não pode passar por cima do
conteúdo que depende de um formato para ser entendido.

## O que foi medido (produção, só leitura, agregado, sem PII)

- **O motor quase nunca rodou.** `personalizacao_sugestao` tinha 1 linha desde 25/08. O log tinha
  2 `criada`, 0 `revisada` e 0 `mantida`.
- **A revisão não tinha gatilho.** Ela só olhava o tópico do lote de telemetria, e o aluno dessa
  sugestão tinha 181 lotes, nenhum no tópico dela. O ciclo saía cedo quando o lote vinha sem
  material, então concluir uma atividade não revisava nada.
- **A regra de dificuldade (DAT-21) nunca disparou.** Havia 0 pares aluno × tópico com duas
  atividades concluídas com acerto. Em `personalizacao_item_progresso`, nenhum item tinha acerto.
- **O modo de estudo nunca foi aplicado.** No banco os nomes são `Conteúdo Primeiro` (3 alunos),
  `Pergunta Primeiro` (2) e `Misto` (1). O motor só conhecia `imediato`, `analitico` e
  `exploratorio`.
- **As afinidades do quiz são quase planas** (por exemplo 18, 16, 14, 14, 13, 13, 12). Somando o
  vetor inteiro, os 6 alunos caíam na mesma ordem.
- **O histórico de estado mental estava vazio** (`aluno_mental_state_history`: 0 linhas em 27
  análises). O ciclo de telemetria não passa pelo nó que grava `ai_patch`. Por isso não há fonte
  para "estado negativo recorrente".
- **Não há dado de WPM.** Em 26 materiais analisados o scroll foi 0, e o tempo ativo médio foi de
  6,5 s.
- **O app não aplicava a ordem.** Cada formato é um passo próprio, e a reordenação era feita
  dentro de um passo só, então não mudava nada. A sugestão também chegava depois da retomada.
  Além disso, o `item_key` do passo é posicional: reordenar sem cuidado quebraria o progresso.
- **As duas tabelas de sugestão tinham RLS ligada e nenhuma policy.** O app só lia a ordem pela
  API.

## Decisão: camadas, recalculadas a cada decisão

| Camada | Entra quando | Efeito |
| --- | --- | --- |
| 0, necessidade do aluno | acerto médio < 60% em ≥ 2 atividades concluídas do tópico | cards no topo (DAT-21) |
| 1, o conteúdo pede | dimensão `essencial` na análise do tópico | o formato da dimensão abre a sequência |
| 2, preferência | sempre | perfil acima da fatia uniforme, modo declarado, telemetria |

- Dentro de uma camada, a ordem sai do score do aluno. Se o conteúdo pede texto e visual como
  essenciais, os dois abrem a sequência, e a preferência do aluno decide qual dos dois vem
  primeiro.
- O nível `ajuda` soma pontos (+0,35) e não cria camada.
- Entrar em uma camada ou sair dela é sempre uma `revisada`, mesmo que a ordem fique igual,
  porque o motivo mostrado ao aluno mudou.
- As camadas são recalculadas a cada decisão, nunca acumuladas. Quando a dificuldade é superada,
  o log registra a volta à ordem do aluno.
- Formato essencial que não foi gerado vira `necessidade` (`formato_essencial_faltando`). Não
  se sugere formato que não existe.
- **O perfil conta pelo excesso sobre a fatia uniforme** (soma ÷ 7), normalizado pelo maior
  excesso. Com um vetor perfeitamente plano, vale a ordem canônica.
- **Estado mental recorrente vai para o log e não reordena.** O catálogo não tem regra que ligue
  emoção a formato (DAT-45), e a emoção do pipeline é regra fixa (erro conta como "frustrado").
- O WPM ficou de fora: não há dado.

Cada item da ordem leva:

- `camada`;
- `motivo_aluno`, uma frase curta para a tela ("Comece por aqui: …");
- `motivos` e `evidencias`, para o professor e o log. Eles nunca vão para a tela do aluno.

## O que o conteúdo pede (`demanda_formato.py`)

- **Dimensões e formatos:** visual → apresentação, escrito → texto, sonoro → áudio, prática →
  cards. Os níveis são `essencial`, `ajuda` e `indiferente`.
- **O modelo analisa uma vez por tópico, no worker.** É o mesmo molde das falas do boss: versão
  própria (`DEMANDA_FORMATO_VERSION`), a chamada é pulada quando o `source_hash` bate, e um
  target nunca vira `failed` por causa dela. Roda nos jobs de base e na matrícula, para que um
  tópico anterior à migration não espere o professor editá-lo. Não regera mídia.
- **O texto analisado** é o do professor mais o texto extraído dos arquivos dele
  (`fontes_personalizacao.descricao`, só os de visibilidade `classe`). Os nomes dos arquivos
  anexados também entram.
- **Sem modelo, vale uma regra fixa conservadora**, gravada com `origem = 'heuristica'`. Só marca
  `essencial` quando há sinal estrutural: imagem, vídeo, slides ou áudio anexados, tabela, código
  ou fórmula. Palavra solta no texto dá no máximo `ajuda`.
  - A regra fixa não conta como análise atual: o modelo é tentado de novo depois de 30 min.
  - Ela nunca substitui uma análise antiga do modelo.
- `origem = 'professor'` fica reservada. O worker nunca a sobrescreve, nem quando a gravação do
  professor acontece durante a chamada ao modelo (`WHERE` no próprio UPSERT).
- **O agregado do tópico usa o nível mais forte entre os conteúdos.** Junto vão os ids dos
  conteúdos que pediram aquele nível e uma `assinatura`, que o log grava.

Na regra de evidência, `demanda_do_conteudo` tem confiança `moderada`, com DAT-14 e DAT-40. São
o outro lado de "formatos para todos, não por perfil". O corpus não tem um estudo que meça casar
formato com conteúdo, e a curadora precisa confirmar a fonte. `CATALOGO_VERSAO` subiu para
`2026-11-02`.

## Fronteira: o que é banco e o que é API

| Banco (`20261102_07`) | API |
| --- | --- |
| `conteudo_demanda_formato`: a análise gravada, que o professor dono lê | gerar a análise (modelo) |
| policy: o aluno lê a própria sugestão, o professor dono lê a sugestão e o log | decidir a ordem (motor) |
| a trava do estudo (`estudo_trava_sel`) também vale para a sugestão | criar a sugestão e revisá-la |
| gatilhos que marcam `revisao_pendente`/`revisao_motivo` | atender a marca e limpá-la |

Os dois gatilhos:

- **`atividade_aluno`:** a conclusão ou a mudança de acerto marca a sugestão daquele aluno no
  tópico, com `atividade_concluida`.
- **`conteudo_demanda_formato`:** uma análise nova ou alterada marca as sugestões do tópico, com
  `demanda_do_conteudo`. A mesma análise gravada de novo não marca.

Os dois são `SECURITY DEFINER`, nunca escrevem em `atividade_aluno` e, quando falham, só emitem
um WARNING: a conclusão da atividade não se desfaz.

A API atende a marca em dois momentos:

- na leitura da sugestão (`GET /personalizar/{aluno}?topico_id=`), antes de devolver;
- no ciclo de telemetria do aluno, para todas as marcas da turma, mesmo sem material no lote.

A limpeza da marca confere `revisao_pendente_em`. Se uma marca nova chega durante a revisão, ela
continua para a próxima.

## App (mobile)

- A sugestão é lida direto do Supabase, em paralelo com o material. Tem um cache próprio, e a
  resposta da API complementa sem apagar o que o banco trouxe.
- A sugestão da tela congela no render em que a retomada calcula o índice. Por isso, a retomada e
  a ordem usam a mesma sugestão.
- O `item_key` e o id de cada passo são calculados na ordem canônica, antes da permuta. O
  progresso, o checkpoint e a telemetria continuam apontando para o mesmo material.
- A sugestão só troca a ordem dentro do mesmo conteúdo, e os formatos não são agrupados num passo
  só. A telemetria atribui o passo inteiro a um formato.
- O selo "Comece por aqui" mostra o `motivo_aluno`.
- Sem sugestão, o comportamento é o de antes. O teste compara com uma cópia literal da função
  antiga.

## Verificação

- Testes de unidade do motor, da demanda, do ciclo, do worker e da estrutura da migration.
- E2e no Postgres local, com o esqueleto da produção (`test_e2e_recomendacao_conteudo_x_aluno.py`):
  - RLS lida como `authenticated`;
  - a trava do estudo;
  - os gatilhos, disparados pelo aluno, e a falha deles sem desfazer a conclusão;
  - o SQL do repositório e da demanda;
  - o downgrade.
- No app: `npm test`, `npm run typecheck` e o lint dos arquivos alterados.
- **A migration não foi aplicada em produção.** Até ela ser aplicada:
  - o app cai na ordem canônica, ou no que tiver em cache;
  - a API não marca nem lê demanda (detecta as colunas e a tabela);
  - o worker devolve `sem_tabela`.

## Fora do escopo (para depois)

- **Laço do `agente_ui` e `VALID_NEXT`:** o `agente_intervencao` e o `agente_cronometro` nunca
  rodam com o modelo respondendo. Em 27 ciclos, o `agente_ui` rodou 232 vezes.
- **Uma fonte honesta de estado de engajamento.** O histórico mental está vazio; gravar a emoção
  do pipeline como estado mental contrariaria DAT-45.
- **WPM:** precisa de contagem de palavras no servidor e de scroll por bloco.
- **`media_generation`** tira cards e markdown de `formatos_gerados`. A base por perfil grava
  `formato_prioritario = "cards"` fixo.
- **Console:** mostrar ao professor a análise do conteúdo e deixar que ele a corrija
  (`origem = 'professor'`).
