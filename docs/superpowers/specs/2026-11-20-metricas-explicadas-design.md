# Métricas explicadas no console e no app

Data: 2026-11-20 · Status: aguardando aprovação da autora

## Por quê

Pedido da autora: "as métricas no console do professor e do aluno devem ter uma explicação clara de
como funcionam (com um ícone explicando como aquela métrica é coletada, confiança etc)".

O console e o app mostram dezenas de números. Quem os lê não sabe de onde vêm, e por isso tira
conclusões que eles não sustentam. Exemplos: achar que "tempo" é tempo com o app aberto, quando é
tempo interagindo; achar que "abandono" é abandono medido, quando é a faixa alta de um modelo; achar
que "acerto antes e depois do Guia" prova que o Guia ajudou. A explicação existe para impedir essas
leituras, e não para enfeitar o card.

## Objetivo

Cada métrica mostrada ao professor (console web) e ao aluno (app) ganha um ícone de informação. Ao
tocar nele, abre uma explicação curta com:

1. **O que mede**, em uma frase.
2. **Como é coletada**: de onde vem o dado, em palavras de gente. Por exemplo, "o app soma os
   segundos em que você tocou, rolou ou ouviu o material", e não `telemetria_lotes.active_sec`.
3. **Quando atualiza**, por exemplo "a cada envio do app, cerca de 60 s" ou "uma vez por dia".
4. **Confiança**: um selo fixo, explicado abaixo.
5. **Limites**, incluindo a amostra mínima quando houver.
6. **O que não significa**: a leitura errada mais provável, dita com todas as letras.

## Fora do escopo

- Mudar qualquer conta. Se a leitura da fonte mostrar uma conta errada, ela vira follow-up registrado
  no PR, e o texto descreve o que o código faz **hoje**.
- Painel técnico e abas de desenvolvedor: já mostram `sem_dado` e não são do professor nem do aluno.
- Migration, colunas novas em `metricas_catalogo` e estado ao vivo da auditoria (decisão da autora:
  selo fixo, opção 1).
- Métricas novas.
- O relatório em PDF do aluno (`perfil/relatorio.tsx`).

## O que não pode acontecer, mesmo funcionando

- Um texto que promete o que o código não mede. A memória "TCC: o que não afirmar" vale aqui: análise
  heurística é "estimativa", não há amostra validada, e o Guia não "melhora" nada medido.
- Um texto que contradiz o CLAUDE.md. Por exemplo, chamar `dwell_sec` de tempo de estudo, ou dizer que
  o vetor observado do perfil é usado pelo produto.
- Um ícone com dois significados: o de interrogação já tem dono nos dois clientes.
- Uma explicação que só abre com o mouse em cima (no celular e no teclado ela nunca apareceria).
- Uma explicação sem contraste AAA.

## Decisões já tomadas

### Confiança: selo fixo por métrica, três níveis (autora, opção 1)

| Selo | Quando se aplica | Exemplos |
|------|------------------|----------|
| **Medido** | contagem ou soma direta de um registro | tempo ativo, atividades entregues, dias ativos, total de alunos |
| **Calculado com regra** | regra fixa e determinística sobre dados medidos | média de notas, acerto, conclusão, retorno semanal, sequência, faixa de XP, posição no ranking |
| **Estimativa** | modelo, heurística ou IA; não há validação em amostra | risco de abandono (modelo de evasão), insights, "onde a turma trava", emoção, leitura do ciclo |

O selo é texto num chip, sem ícone próprio: o ícone de informação é o único ícone novo. Logo abaixo
do chip vai uma frase fixa por selo, igual em todas as métricas, dizendo o que ele quer dizer (por
exemplo, "Estimativa: sai de um modelo ou de uma regra aproximada e ainda não foi validada com
alunos"). Minha decisão: sem essa frase, o selo vira só mais um rótulo para decifrar. Regra que não
admite exceção: métrica com `requer_validacao` `ml` ou `llm` em `metricas_catalogo` é **Estimativa**.

### Onde ficam os textos: no código de cada cliente (autora, opção B)

- `frontend/src/lib/metricas/explicacoes.json`: textos do professor.
- `mobile/src/constants/metricasExplicadas.json`: textos do aluno, mais curtos e em linguagem do dia a
  dia (minha decisão, já comunicada).
- A chave é a mesma nos dois arquivos. Quando a métrica existe em `metricas_catalogo`, a chave é a de
  lá (`prof.tempo_ativo`, `aluno.sequencia`); quando não existe, ganha uma nova no mesmo padrão
  (`prof.media_notas`).
- **Teste de paridade** no frontend (vitest): lê o JSON do mobile com `fs` e confere que toda chave
  presente nos dois arquivos tem o **mesmo selo**. Foi escolhido JSON, e não TS, para essa leitura
  entre pacotes não depender de transpilação.

### Ícone (minha decisão, já comunicada)

- Console: `Info`, do lucide. Hoje só aparece como nota explicativa no cadastro
  (`CadastroAluno.tsx`, `CadastroProfessor.tsx`, `BrainHexIntroStep.tsx`).
- App: `information-outline`, do MaterialCommunityIcons. Hoje é a nota do item da loja, o tom "info"
  do `DialogContext` e um passo de guia.
- Não usar o de interrogação. No console, `CircleHelp` é "sem dado" no painel técnico; no app,
  `help-circle-outline` abre o guia da seção (`SectionGuideButton`).
- Dívida que existe hoje e não é deste PR: no painel "Mistério", o tile "Desafios resolvidos" usa
  `help-circle-outline`. Fica registrada como follow-up.

## Forma dos dados

```ts
type Selo = "medido" | "regra" | "estimativa";

type ExplicacaoMetrica = {
  nome: string;          // como a métrica se chama na explicação, não o rótulo temático
  selo: Selo;
  oQueMede: string;      // 1 frase
  comoColeta: string;    // 1 a 2 frases
  atualiza: string;      // 1 frase curta
  limites?: string[];    // 0 a 3 itens; a amostra mínima entra aqui
  naoSignifica: string;  // 1 frase
  referencia: string;    // só para manutenção, NUNCA exibido: função/view/arquivo de onde o texto saiu
};
// arquivo = Record<chave, ExplicacaoMetrica>
```

Limites de tamanho, conferidos por teste: aluno, no máximo cerca de 220 caracteres por campo;
professor, no máximo cerca de 360. O teste também recusa campo vazio e selo fora dos três, e exige
`referencia` em toda entrada.

## Interface

### Console: `ExplicacaoDaMetrica` (`frontend/src/components/console/comum/`)

- Botão só com o ícone `Info` (cerca de 14 a 16 px, área clicável de 24 px), ao lado do rótulo do
  card ou do título da seção. `aria-label="Como funciona: <nome>"`.
- Abre um `Popover` (`components/ui/popover.tsx`) por clique ou teclado, nunca por hover. Ordem do
  conteúdo: nome, chip do selo, depois as seções "O que mede", "Como é coletado", "Atualiza",
  "Limites" e "O que não significa".
- Recebe `chave` tipada pelas chaves do JSON: uma chave inexistente não compila.

### App: `ExplicacaoDaMetrica` (`mobile/src/components/metricas/`)

- `Pressable` com `information-outline`, área de toque de 44×44 pt, `accessibilityRole="button"` e
  `accessibilityLabel="Como funciona: <nome>"`.
- Abre um `Modal` próprio, na paleta do perfil (`getProfileShellPalette` / `ThemePalette`), com o
  mesmo conteúdo em ordem. Não usa o `DialogContext`, porque ele aceita só uma `description` em texto
  corrido e substituiria um diálogo que o aluno ainda não leu.
- O `StatTile`, o `SectionTitle` e o `ProgressLine` de `ProfileMetricsViews.tsx` ganham a prop
  opcional `explicacao?: ChaveMetrica`. Os cinco painéis temáticos chamam o mesmo dado por nomes
  diferentes ("Mapa revelado", "Exploração", "Tópicos descobertos"): a chave fica presa ao **campo do
  view model**, e não ao rótulo.

### Contraste

Os textos usam os tokens que já passam AAA: `--foreground` e `--muted-foreground` no console, e
`palette.text` e `palette.textMuted` no app. O chip do selo usa texto `foreground` sobre um fundo
neutro, sem cor de status (verde, amarelo ou vermelho dariam ao selo um juízo que ele não tem).
O console tem `contrasteTokens.test.ts`: o chip entra nele.

## Inventário (o que ganha o ícone)

As chaves marcadas com * já existem em `metricas_catalogo`. O selo é a proposta inicial e se confirma
na leitura da fonte, durante a implementação.

### Console, painel da turma

| Onde | Métrica | Chave | Selo |
|------|---------|-------|------|
| KPIs principais | Total de alunos | `prof.total_alunos` | medido |
| | Média de notas (`classe_aluno.notaMedia`, guardada por `trg_classe_aluno_nota_pelo_banco`) | `prof.media_notas` | regra |
| | Conclusão média | `prof.conclusao_media` | regra |
| KPIs secundários | Taxa de acertos | `prof.taxa_acertos` | regra |
| | Abandono médio | `prof.risco_abandono`* | estimativa |
| | Retorno semanal | `prof.retorno_semanal`* | regra |
| | Chat após erro | `prof.chat_apos_erro` | regra |
| | Tempo médio de uso | `prof.tempo_uso` | medido |
| | Tempo ativo médio | `prof.tempo_ativo`* | medido |
| Seções da visão geral | Precisam de atenção | `prof.precisam_atencao` | a confirmar (`risco.ts`, `sinais.ts`) |
| | Abandono por perfil | `prof.abandono_por_perfil` | estimativa |
| | Distribuição de notas | `prof.distribuicao_notas` | regra |
| | Inatividade por perfil | `prof.inatividade`* | medido |
| | Abandono por etapa | `prof.abandono_por_etapa`* | regra |
| | Risco de reprovação | `prof.risco_reprovacao` | a confirmar (`riscoReprovacao.ts`) |
| | Gargalos e fila de personalização | `prof.gargalos_personalizacao`, `prof.fila_personalizacao` | medido |
| | Tabela de alunos (cabeçalhos com número) | reusa as chaves acima | — |
| Aba Evolução | Evolução da turma, mudanças relevantes | `prof.evolucao`, `prof.mudancas_relevantes` | a confirmar |
| Aba Conteúdo | Conteúdo por tópico | `prof.conteudo_por_topico` (ver `prof.cobertura_material`*) | regra |
| Aba Insights | Cartões de insight | `prof.insights` | estimativa |
| Aba Guia | Onde a turma trava, perguntas por tópico, por aluno | `prof.guia_conceitos`, `prof.guia_topicos`, `prof.guia_por_aluno` | estimativa / medido / regra |

### Console, detalhe do aluno

Cabeçalho (os números de `CabecalhoAluno`), Visão geral (evolução e última atividade), Perfil
(afinidade dos 7 perfis: vem do quiz do cadastro; o vetor observado é sombra e o texto **não** pode
dizer que o produto o usa), Personalização (consumo e progresso dos itens), Tentativas e Sinal de
atenção. As chaves reusam as do aluno (`aluno.*`) quando o número é o mesmo.

### App, aluno

| Onde | Métrica (campo do view model) | Chave | Selo |
|------|-------------------------------|-------|------|
| Perfil, topo | Faixa de XP (`services/faixaXp`) | `aluno.faixa_xp` | regra |
| | Sequência (`sequenciaDeDias`: só olha os últimos 7 dias, então nunca passa de 7) | `aluno.sequencia`* | regra |
| Painéis temáticos | `progresso` (campanha) | `aluno.progresso`* | regra |
| | `acertos` | `aluno.acertos` | regra |
| | `taxaExploracao` / `topicosDescobertos` | `aluno.exploracao` | regra |
| | `conteudosConcluidos`, `atividadesConcluidas` | `aluno.conteudos`, `aluno.atividades` | medido |
| | `totalConquistas` | `aluno.conquistas`* | medido |
| | `diasAtivos` | `aluno.dias_ativos` | medido |
| | `melhorPosicao` | `aluno.ranking`* | regra |
| | `sessionEngajamento` (ativo ÷ ativo + parado, só desde que o app abriu) | `aluno.engajamento_sessao` | regra |
| | `touchTotal` / interações | `aluno.interacoes` | medido |
| | afinidades | `aluno.afinidades` | regra |
| | leitura do ciclo / emoção | `aluno.analise` | estimativa |
| Tempo de estudo | acumulado (`tempo_gasto_min`, tempo ativo) | `aluno.tempo_total` | medido |
| | recente (telemetria desde que o app abriu) | `aluno.tempo_recente` | medido |
| Boss / melhor tempo | `danoTotal`, `melhorTempoMin` | `aluno.dano_boss`, `aluno.melhor_tempo` | medido |
| Ranking (`ranking/[id].tsx`; no console, `RanksSection`) | posição e pontos (`eventos_aluno.valor` sem `fora_do_xp`) | `aluno.ranking`*, `aluno.xp` | regra / medido |

## Como os textos são escritos

Para cada chave, quem implementa lê a fonte de verdade antes de escrever: a função ou view do banco
(pelo MCP do Supabase, só `SELECT` de `pg_proc` e `pg_views`), o coletor no mobile e o cálculo no
cliente. A fonte lida fica registrada em `referencia`. Pontos que o CLAUDE.md já fixa e que os textos
têm de respeitar:

- Tempo de estudo é tempo **ativo** (soma de `active_sec` por escopo, `trailup_tempo_telemetria_min`),
  e não tempo com o material aberto nem sessões do cronômetro.
- Nota média e nota final são calculadas só pelo banco.
- XP é `eventos_aluno.valor` sem `fora_do_xp`; as faixas vêm de `xp_faixa`.
- Célula de estudo abaixo de `n_minimo` volta nula, o que a explicação diz como "aparece só com pelo
  menos N alunos".
- O risco de abandono é a faixa alta de um modelo, não abandono observado.

Divergência entre código e intuição (exemplo já achado: `classe_aluno."acertosPercentual"` não tem
guarda no banco como a nota tem) vira item de follow-up no PR, e não correção escondida.

## Testes

- **Frontend (vitest):** integridade do JSON (campos, selo, tamanho, `referencia`); paridade de selo
  com o JSON do mobile; render do `ExplicacaoDaMetrica` (abre por clique e por Enter, `aria-label`,
  todas as seções); chip do selo no `contrasteTokens.test.ts`; os KPIs mostram o ícone.
- **Mobile (jest):** integridade do JSON; render do componente (abre o modal, `accessibilityLabel`,
  fecha); `ProfileMetricsViews` passa a chave certa nos cinco painéis (mesmo campo, mesma chave).
- **CI local:** os comandos exatos do `ci.yml` nos pacotes tocados (`npm run typecheck`, lint, testes
  do frontend; no mobile, os testes, o typecheck e os 5 grupos isolados, como `test:trail-resume`).
- **Layout:** console no navegador do app (largo e 375 px); app no emulador Android com APK de dev,
  não só na web.

## O que fica para quem implementa

- A redação final de cada texto, a partir da fonte lida.
- O selo final das métricas marcadas "a confirmar".
- O posicionamento exato do ícone em cada card, sem quebrar a linha do rótulo a 375 px.
- A ordem dos commits (sugestão: componente e JSON → console → app). A entrega é um PR só no
  BitStudioLabs/trail-up, que nunca é mesclado por esta sessão.
