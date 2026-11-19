# Desafios de lógica e palavras cruzadas como missão — design

Data: 2026-11-17 · Estado: para aprovação · Abordagem escolhida: **A (o desafio mora dentro da missão)**

## Intenção

Dar ao aluno um **extra de engajamento** ligado ao conteúdo que ele estuda: **desafios de lógica**
e **palavras cruzadas**. Não é atividade avaliativa. Entra como **missão**, só para os perfis
BrainHex que gostam desse tipo de coisa, e paga **moedas e pontos no rank**. Não vale nota, a
menos que o professor queira.

O professor recebe os desafios como **propostas** junto com os cards e as atividades que a IA já
sugere: **2 de lógica e 2 cruzadinhas por conteúdo**. Ele escolhe quais entram.

## Objetivos

1. A sugestão por conteúdo do console propõe 2 desafios de lógica e 2 cruzadinhas. O professor
   revisa e seleciona onde já seleciona cards e atividades.
2. O que ele seleciona vira missão da turma, com perfis-alvo, ativa na hora.
3. No app, o aluno do perfil-alvo vê a missão (aba Social e rastreador da Trilha), abre o desafio,
   resolve e recebe **uma vez por desafio** moedas e pontos que **contam de verdade no rank**.
4. A correção é feita pelo banco, sem IA e sem passar pela API.
5. Junto, por decisão da pessoa (17/11), duas correções que valem para **todas** as missões:
   - **O prêmio de missão passa a somar no rank** (hoje paga 0 ponto; ver "Achados").
   - **O aluno deixa de conseguir fabricar o próprio prêmio de missão** (ver "Achados").

## Fora do escopo

- **Nota.** O desafio nunca entra em `atividade_aluno`, em `trailup_recalcular_nota_classe_aluno`
  nem no progresso do tópico.
  - A alavanca para "valer nota" é `classe.xp_peso_nota_pct` (`20261102_13`), ligada pelo
    professor. Ela só passa a enxergar o prêmio de missão depois da correção do objetivo 5, porque
    o XP lê `eventos_aluno.classe_id` (`20261107_01`).
  - Um "vale nota" por desafio fica para depois.
- Adaptar o texto do desafio a cada perfil, regerar o desafio quando o conteúdo muda, desafio de
  guilda, desafio na geração da trilha inteira (ver Console) e telemetria da tela do desafio.
- Recalcular o passado: os prêmios de missão já pagos com 0 ponto ficam como estão.

## O que não pode acontecer

- **O aluno ler a resposta**, pela tabela, pela RPC ou depois de errar.
- **Prêmio pago duas vezes** pelo mesmo desafio: clique duplo, rede ruim, duas abas, nem trocando
  de perfil ativo.
- **O aluno gravar um prêmio** direto em `eventos_aluno`.
- **Desafio para o perfil errado** ou para aluno de outra turma.
- **Piorar a sugestão de cards e atividades**: ela não pode ficar mais lenta nem falhar por causa
  dos desafios. Lembrar que a cota é do tier free e que o worker tem limite de 150 s.
- **Nota mudar sem o professor pedir.**
- **Desafio empurrar outras missões para fora da lista do aluno.**

## Achados no código da `origin/main` que mudam o desenho

Conferidos lendo o código. Não houve medição em produção.

1. **Prêmio de missão paga 0 ponto no rank.**
   - O laço de missão grava `INSERT INTO eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)`
     com `referencia = 'missao:<id>'` e **sem `classe_id`** (`20261021_20:285-286`).
   - `fn_eventos_aluno_resolve_classe_id` não conhece o prefixo `missao` (`20261003_01`), então a
     turma fica nula.
   - `trg_eventos_aluno_valor_do_banco` zera o valor quando há referência e não há turma
     (`20261021_06:902-905`).
   - O rank descarta evento sem turma (`20261021_16:176`).
   - **Correção:** o prêmio passa a gravar `classe_id = missao.classe_id`, explicitamente, no laço
     e na RPC nova. Conferir `fn_fator_de_atraso` e o caminho das moedas com a turma preenchida.
2. **O aluno pode fabricar prêmio.**
   - `eventos_aluno_posse_ins` aceita qualquer tipo que não seja "creditado" (`20260909_03:120-123`).
   - As moedas só deduplicam por `(aluno, tipo, referencia)` (`20261020_03:201-210`): basta trocar
     a referência para receber de novo.
   - **Correção:** um gatilho `BEFORE INSERT` recusa escrita de cliente (claims `authenticated`)
     para qualquer tipo usado como `recompensa_tipo` de missão. Segue o padrão de `20261102_04`,
     e o sinal `app.missao_premiando` libera o caminho legítimo.
   - Antes, conferir no código do mobile e em produção (`BEGIN READ ONLY`) que nenhum desses tipos
     é gravado pelo app.
3. **A guarda de `missoes` não congela missão da IA.**
   - Só `origem = 'sistema'` é congelada (`20261103_05:200-202`), e o console edita missão `ia`
     (`aprovacao.ts`).
   - `missoes_professor_all` é `FOR ALL`, então o professor conseguiria inserir ou alterar
     `desafio` sem passar pela RPC: sem gabarito e sem a grade validada.
   - **Correção:** `fn_missoes_guarda` congela `desafio`, `conteudo_id`, `criterio`, `escopo` e
     `desafio_grupo` quando `desafio IS NOT NULL`, e só a RPC (sinal de sessão próprio) escreve
     `desafio`.
   - Os perfis-alvo continuam editáveis pelo professor.
   - O corpo vigente da guarda e o do gatilho de eventos saíram de `pg_get_functiondef` /
     cadeia de trocas (`20261103_06`, `20261103_07`). Toda mudança segue esse padrão de troca
     por âncora.
4. **`missoes_aluno_sel` não filtra perfil.**
   - O perfil é filtrado no app (`missaoModel.ts`) e no avaliador.
   - O app usa o `perfilAtivo` local, e o banco lê `alunos.perfil_ativo` via
     `fn_perfil_da_missao`, que pode dar `NULL`.
   - **A RPC de resposta é a autoridade:** ela aceita o aluno se **algum** perfil-alvo do desafio
     é perfil representativo dele, e não só o ativo. Assim, app e banco não discordam quando o
     aluno troca de perfil.
5. **O app esconde toda missão `origem = 'ia'`.**
   - `carregarMissoesDoAluno` só busca a do sistema do dia ou a do professor (`missoesDoDia.ts:44`).
   - `montarMissoes` transforma `ia` em `sistema` (`missaoModel.ts:275`), que aparece como "Do dia".
   - Isso já afeta hoje as missões da IA aprovadas (#151). A correção entra aqui (ver App).
6. **O avaliador não conclui métrica desconhecida.** `fn_avaliar_metrica` devolve `false`
   (`20261021_03`). Mesmo assim, o laço passa a ignorar `desafio IS NOT NULL`: é defesa
   contra alguém editar o `criterio`.
7. **Pontos por turma não existem.**
   - `fn_pontos_do_evento(text)` não lê a turma (`20260909_05:121`).
   - `eventos_pontuacao_classe.pontos` não tem efeito (`20261021_06:25-28`); só as moedas por
     turma valem.
   - O rastreador do app mostra pontos da turma que o banco não paga: corrigir a exibição para
     ler o mesmo que o banco paga.
8. **Caminho da edge:** `frontend/supabase/functions/generate-content-ai/`.

## Abordagens consideradas

| | Como é | Por que sim | Por que não |
|---|---|---|---|
| **A — dentro da missão (escolhida)** | A missão guarda o quebra-cabeça, a resposta fica em tabela separada e uma RPC corrige e paga. | Isolado de nota e progresso; reaproveita perfil-alvo, recompensa e o app de missões. | Tela nova no app; a guarda precisa travar o desafio. |
| B — atividade nova + missão apontando | Novo `atividades.tipo`, com "vale nota" como marcação. | Reaproveita a correção de questão e as cópias. | Mexe em nota e progresso; aparece para todos os perfis; cruzadinha exigiria um tipo de questão inteiro (molde de `20261110_02`). |
| C — exercício solto no tópico | Lista de desafios no tópico. | Simples. | Não é missão nem dá prêmio. |

Escolhida pela pessoa: **A**.

## O desenho

### Banco (migração de desafios + migração das duas correções gerais)

**`missoes`, três colunas novas:**
- `desafio jsonb NULL` é o que o aluno vê, **sem resposta**. `NULL` é missão comum.
  - lógica: `{ "tipo": "logica", "enunciado", "formato": "multipla" | "curta", "alternativas"? }`
  - cruzadinha: `{ "tipo": "cruzadinha", "linhas", "colunas", "palavras": [{ "numero", "direcao": "h"|"v", "linha", "coluna", "tamanho", "pista" }] }`
  - CHECK de forma; cruzadinha com 4 a 10 palavras.
- `conteudo_id bigint NULL REFERENCES conteudos(id) ON DELETE CASCADE`: de onde o desafio saiu.
- `desafio_grupo uuid NULL`: o **mesmo quebra-cabeça** nas linhas de cada perfil.
- CHECK: `desafio IS NULL OR (escopo = 'aluno' AND conteudo_id IS NOT NULL AND desafio_grupo IS NOT NULL)`.
- `criterio = {"metrica": "desafio"}`, que a guarda aceita e o formulário não oferece. O teste de
  paridade com `criterio.ts` / `fn_missao_ia_catalogo` registra essa métrica.

**`missao_desafio_gabarito`** (`desafio_grupo` PK, `resposta jsonb`, `atualizado_em`): uma linha
por quebra-cabeça.
- Lógica: `{ "aceitas": [...] }`. Cruzadinha: `{ "palavras": { "1h": "BANCO", ... } }`.
- RLS só para o professor dono da turma (`app_classes_do_professor()`, via missões do grupo).
- O aluno não tem policy.

**`missao_desafio_tentativa`** (só de acréscimo): `missao_id`, `desafio_grupo`, `aluno_id`,
`acertou`, `palavras_certas`/`palavras_total`, `criado_em`.
- O aluno lê as próprias, o professor as das suas turmas, e só a RPC escreve.
- É a métrica de engajamento.

**Recompensas:** `desafio_logica` e `desafio_cruzadinha` em `eventos_pontuacao`, **com os mesmos
pontos e moedas de `missao_concluida`** (decisão da pessoa, 17/11). As moedas podem ser mudadas por
turma.

**`missao_desafio_criar(p_conteudo_id, p_desafio, p_resposta, p_perfis text[])`**
(`SECURITY DEFINER`, `authenticated`):
- confere a posse antes de ler (`NOT EXISTS` sobre `app_classes_do_professor()`);
- valida a forma e confere que a grade bate com a resposta, letra a letra nos cruzamentos;
- numa transação: gera o `desafio_grupo`, grava uma missão por perfil (`origem = 'ia'`,
  `aprovacao = 'aprovada'`, `categoria = 'secundaria'`, `escopo = 'aluno'`) e a linha do gabarito;
- devolve os ids.

**`missao_desafio_responder(p_missao_id, p_resposta)`** (`SECURITY DEFINER`, aluno):
- **Acesso:** a missão está `ativa`/aprovada numa turma do aluno (`app_classes_do_aluno()`), e
  algum perfil-alvo do grupo é representativo para ele.
- **Limite:** no máximo 20 tentativas por hora por grupo. Acima disso, recusa com código próprio,
  sem gravar nada. É o freio contra descobrir a cruzadinha trocando uma palavra por vez e contra
  escrita em rajada (o banco já caiu por isso).
- **Uma vez por quebra-cabeça:** trava pelo grupo (`pg_advisory_xact_lock` em `(aluno, grupo)`).
  Se alguma linha do grupo já está concluída para o aluno, responde `ja_concluida` e não paga.
- **Comparação:** normaliza (minúsculas, sem acento, espaços colapsados; na resposta curta, número
  com vírgula ou ponto) e compara. Grava a tentativa.
- **Acertou:** marca `missao_aluno` como `concluida` e insere o prêmio com
  `classe_id = missao.classe_id`, `referencia = 'missao:<id>'`, sob `app.missao_premiando`.
- **Retorno:** `{ acertou, ja_concluida, palavras_certas? }`. **Nunca a resposta**, e na
  cruzadinha só **quantas** palavras estão certas.

**Correções gerais (objetivo 5), numa migração própria, antes da de desafios:**
- o laço de missão de `trg_eventos_aluno_after_iud` e `fn_missao_guilda_avaliar` passam a gravar
  `classe_id` no prêmio;
- o gatilho que recusa prêmio gravado pelo cliente (achado 2);
- o laço ignora `desafio IS NOT NULL`.

### Geração (edge `generate-content-ai`)

- **Modo novo `desafios`, por conteúdo**, numa requisição separada da de cards e atividades. O
  pedido que já existe não cresce, e falhar nos desafios não derruba os cards.
- Só para **conteúdo salvo**, porque o desafio precisa de `conteudo_id`. Para conteúdo novo, o
  console avisa "salve para gerar desafios".
- `responseSchema`:
  - 2 desafios de lógica: enunciado, formato, alternativas, resposta e sinônimos aceitos;
  - 2 cruzadinhas: 6 a 10 palavras do próprio conteúdo, cada uma com pista.
- **A IA não monta a grade.** A função pura `montarCruzadinha` (em
  `frontend/supabase/functions/generate-content-ai/`, com teste e importada pelo console como
  `repetidas.ts`):
  - posiciona as palavras e descarta as que não cruzam;
  - devolve `null` com menos de 4 palavras, e cruzadinha `null` não é proposta.
- Reaproveita o filtro de repetidas e o bloco do material.
- **Custo:** dobra as chamadas por clique de "sugerir", de 1 para 2. Fica dentro da rotação de
  chaves que já existe.

### Console

- **`TopicEditDrawer`, sugestão por conteúdo:**
  - no mesmo clique, `desafios` é disparado em paralelo com `content`;
  - a fila de sugestões ganha a terceira lista, "Desafios (missão)": tipo, enunciado ou grade em
    miniatura, resposta, perfis-alvo (com o padrão marcado e editável) e a recompensa;
  - "Aplicar" chama `missao_desafio_criar` para os selecionados;
  - se os desafios falharem, os cards chegam do mesmo jeito, com um aviso.
- **Geração da trilha inteira:** sem desafios na v1, por causa da cota.
- **Aba Missões:**
  - a missão-desafio aparece **uma vez por grupo**, com selo "Desafio" e os perfis;
  - dá para desativar e mudar os perfis, mas não editar o texto;
  - os desafios ficam **fora** do painel e da taxa de aprovação da IA (#151) (`missoesIaApi.ts`,
    filtro `desafio IS NULL`), porque não passaram pelo fluxo de pedido e aprovação.

### App do aluno (mobile)

- **Leitura (`carregarMissoesDoAluno`):**
  - passa a incluir `origem = 'ia'` (aprovação e atividade continuam com a policy);
  - lê `desafio`, `conteudo_id` e `desafio_grupo`, com o fallback `42703`;
  - `montarMissoes` mantém `ia` como origem própria, com o rótulo "Sugerida". Deixa de virar "Do
    dia" e sai da ordenação da diária.
- **Não estourar a lista:**
  - a leitura fica em duas consultas: as missões comuns (como hoje, `desafio IS NULL`) e os
    desafios **do tópico da vez e do anterior** (por `conteudo_id` → tópico), já filtrados pelo
    perfil no servidor (`.in('perfil_alvo', perfisRepresentativos)`);
  - um desafio por grupo; o desafio nunca tira missão comum do limite.
- **Destino no rastreador:** a missão-desafio abre a tela do desafio. A Social ganha "Resolver".
- **Tela `/desafio/[id]`** (`mobile/src/app/desafio/[id].tsx`, na pilha raiz, fora das abas, com
  cabeçalho e "voltar"). Não fica dentro da aba Social: o "Resolver" do rastreador da Trilha
  empurrava a rota da Social e passava por cima do cadeado da aba, que mora no `tabPress`, e a pilha
  da Social ficava só com o desafio, sem "voltar".
  - **Lógica:** alternativas ou campo curto, e "Conferir".
  - **Cruzadinha:** grade numerada, pistas, toque na célula escolhe a palavra, teclado e
    "Conferir". Concluída vira só leitura.
  - **Rascunho:** o parcial fica salvo no aparelho com a chave `desafio:<alunoId>:<grupo>`. O aluno
    entra na chave porque nada limpa o AsyncStorage no logout: num aparelho compartilhado, com a
    chave só do grupo, a resposta de um aluno aparecia para o outro, que levava o prêmio por ela. O
    grupo continua na chave para trocar de perfil ativo não perder o parcial. Sair da tela grava o
    que estava pendente.
  - Acertou: tela de prêmio. Errou: "ainda não", e na cruzadinha quantas palavras estão certas.
  - Limite atingido: "tente de novo daqui a pouco".
- **Exibição da recompensa:** mostrar os pontos de `eventos_pontuacao` (o que o banco paga), e não
  os da turma (achado 7).
- **App antigo:** não vê missão `ia` de jeito nenhum (achado 5), então não há o que tratar.

## Testes que o design pede

- **Correções gerais:**
  - o prêmio de missão sai com `classe_id` e soma no rank;
  - aluno com claims `authenticated` não consegue inserir um tipo de recompensa de missão;
  - os eventos de estudo que o app grava continuam passando.
- **Estrutura das migrações** (padrão `api/tests/test_migration_*`), com as trocas por âncora
  que falham no import.
- **RLS com papel real:**
  - o aluno não lê o gabarito, só as próprias tentativas;
  - o professor de outra turma não lê nada;
  - o professor não insere nem altera `desafio` direto.
- **`missao_desafio_responder`:**
  - duas chamadas certas em paralelo pagam uma vez;
  - resolver pela linha de outro perfil do mesmo grupo não paga de novo;
  - outro perfil ou outra turma recebe recusa;
  - o limite por hora funciona;
  - a resposta nunca volta.
- **Avaliador:** nenhum evento conclui uma missão-desafio.
- **`montarCruzadinha`:** palavras que não cruzam, acento, palavra repetida, e a grade bate com a
  resposta.
- **Edge:** o schema de `desafios` contra o modelo real, uma vez, dentro da cota.
- **Mobile (`node --test` e os grupos isolados):**
  - funções puras da cruzadinha;
  - `montarMissoes` com `ia`;
  - a leitura que separa desafios de missões comuns.

## Decisões minhas (podem ser revistas)

- **Perfis-alvo padrão:** lógica para Mastermind e Achiever; cruzadinha para Seeker e Mastermind.
- **Uma linha por perfil, unidas por `desafio_grupo`.** O avaliador, a policy e o app já entendem
  `perfil_alvo` único, e o grupo garante "uma vez por desafio".
- `origem = 'ia'` + `aprovacao = 'aprovada'` ao aplicar, fora da métrica da #151.
- Geração por conteúdo, só para conteúdo salvo, e fora da geração da trilha inteira.
- 20 tentativas por hora; a cruzadinha mostra quantas palavras estão certas, e não quais.
- No app, só os desafios do tópico da vez e do anterior.

## Para quem construir

- Algoritmo de montagem da grade (guloso por maior palavra basta).
- Ordem dos PRs, um por camada a partir de `origin/main`:
  1. correções gerais (prêmio com turma e brecha);
  2. banco dos desafios;
  3. edge;
  4. console;
  5. mobile.
- O filtro de origem `ia` no mobile pode ir antes, como correção separada.
- Antes do PR 1, medir em produção (`BEGIN READ ONLY`, sem `SET`, pela regra do pooler):
  - se os prêmios de missão de fato saem com valor 0;
  - quais tipos de `eventos_aluno` o app grava hoje.
