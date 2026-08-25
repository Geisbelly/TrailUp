# Correções visuais rápidas do deck — Design

## Contexto

Após o PR #10 (truncamento de quiz descontrolado + divisão de slides por peso),
o usuário reportou mais 4 problemas visuais/comportamentais no deck exportado,
levantados a partir de capturas de tela reais em produção. Este é o
"sub-projeto A" de uma pilha maior de pedidos, decomposta por escopo: os
demais (frequência de quiz por preferência do aluno, diversidade de exemplos
visuais, XP de slides + reaproveitamento de imagens entre mídias) cruzam
outros repositórios/arquitetura e ficam fora deste documento.

Todos os 4 itens abaixo foram **reproduzidos e confirmados** renderizando o
deck real (`generateInteractiveHtml`) com dados de exemplo no navegador, não
apenas inferidos do código.

## Escopo

Only `BrainHexPDF`: `src/utils/deckExportUtils.ts` e `src/utils/quizSanitize.ts`.
Mesmo pipeline já modificado no PR #10 (`fix/quiz-descontrolado-e-slides-desproporcionais`).
Sem decisão de arquitetura pendente — todos os fixes são autocontidos.

## Item 1 — Badge de ambiente colapsa para "R…"

**Bug confirmado:** no modo retrato (proporção 9:16 real do app), o badge de
`thematicStorytelling.environmentSetting` (`deckExportUtils.ts:226-230`, dentro
de `.immersion-context`) divide espaço com o badge fixo "💡 Analogia"
(`shrink-0`). Com `flex-basis: 0` e pouco espaço disponível, o texto trunca
para 1 caractere + reticência (ex.: "Reino dos Servidores Raiz..." → "R…").

**Fix:** remover o badge de ambiente do `immersion-context`. A informação já é
comunicada de forma legível na fala do mentor
(`s.characterGuide?.speechText || s.thematicStorytelling?.narrativeBeat`),
que já aparece na mesma faixa (`immersion-strip`). O campo
`thematicStorytelling.environmentSetting` continua existindo no schema/tipo —
só para de ser renderizado como badge separado.

## Item 2 — Badge "OBJ:" corta no meio da palavra

**Bug confirmado:** reproduzido mesmo na largura máxima do card (1080px,
bem longe de qualquer aperto de tela). O badge (`deckExportUtils.ts:174-178`)
usa `truncate max-w-[280px]` no elemento `inline-flex` que tem dois filhos —
`<span class="font-bold">OBJ:</span>` + o texto do objetivo como nó de texto
solto. `text-overflow: ellipsis` não funciona de forma confiável quando o
conteúdo que estoura não é um único nó de texto direto do elemento com
`overflow: hidden` — é o bug clássico de truncamento em flexbox (filhos flex
têm `min-width: auto` por padrão, então não respeitam o `overflow` do pai).

**Fix:** envolver o texto do objetivo no próprio `<span>`, com `truncate` e
`min-w-0` aplicados a esse span (não ao container), e adicionar `min-w-0`
também ao container flex para permitir que o span filho realmente encolha:

```html
<span class="inline-flex items-center gap-1 ... min-w-0" title="...">
  <span class="font-bold shrink-0">OBJ:</span>
  <span class="truncate min-w-0">${s.pedagogicalObjective}</span>
</span>
```

## Item 3 — Espaço vazio em slides com pouco conteúdo

**Bug confirmado:** um slide sem imagem/widget e com pouco texto renderiza
como uma caixinha pequena centralizada num card que ocupa a altura fixa do
modo (hoje `min-height: 560px` padrão / `680px` retrato, herdada do
`aspect-ratio`), deixando uma área escura vazia grande acima/abaixo.

**Fix:** o `.deck-container` passa a ter `height: auto` (em vez de forçar
`min-height` alto + `aspect-ratio` fixo), respeitando um **piso** e um
**teto**:
- Teto: mantém o `max-height: 94vh` já existente (evita estourar a tela em
  slides muito densos — a paginação por peso do PR #10 já limita isso na
  prática).
- Piso: novo `min-height` bem menor que o atual (ponto de partida ~320px no
  modo padrão / ~420px no modo retrato — ajustado empiricamente durante a
  implementação, no mesmo espírito dos comentários de calibração já
  existentes em `slidePagination.ts`, ex. `MAX_CONTENT_WEIGHT`). Evita que um
  slide com só um título pareça cortado/abrupto.
- `aspect-ratio` deixa de ser uma restrição rígida: vira só a proporção
  *inicial/preferencial* onde fizer sentido, mas o conteúdo real dita a altura
  final dentro do intervalo piso-teto.

Não mexe em `paginateSlidesByDensity` nem nos pesos calibrados no PR #10 —
o problema aqui é puramente de CSS do container, não de quando dividir um
slide.

## Item 4 — Resposta certa do quiz sempre na 1ª posição

**Bug confirmado (código):** `deckExportUtils.ts` renderiza `quiz.options` na
ordem literal em que vêm do modelo/schema; não existe nenhum passo de
embaralhamento no pipeline (`server.ts` → `sanitizeQuizContent` →
`paginateSlidesByDensity`).

**Fix:** nova função `shuffleQuizOptions(slides: SlideData[]): SlideData[]`
em `src/utils/quizSanitize.ts`, ao lado de `sanitizeQuizContent`. Embaralhamento
**determinístico**, com seed derivada de `slide.id` (não `Math.random()`) —
importante porque o HTML exportado é gerado uma vez e reutilizado por todos os
alunos daquele perfil/tópico; um embaralhamento não-determinístico faria a
ordem mudar a cada re-render/reload da mesma página, o que é uma experiência
pior do que a ordem fixa atual. Aplica-se a `slide.quiz.options` e a
`slide.interactiveElement.quizOptions` (mesmos dois formatos que
`sanitizeQuizContent` já trata). Chamada em `server.ts` junto com
`sanitizeQuizContent`, antes de `paginateSlidesByDensity`.

## Testes

Mesmo padrão TDD (`node:test`/`node:assert/strict`) usado no PR #10:
- `deckExportUtils.test.ts`: badge de ambiente não aparece mais no HTML
  gerado; badge "OBJ:" longo não gera texto cortado sem reticência (assert no
  HTML bruto, já que jsdom não está no projeto — mesma abordagem de asserção
  em string usada nos testes existentes desse arquivo).
- `quizSanitize.test.ts`: novo describe/bloco de testes para
  `shuffleQuizOptions` — mesma entrada produz mesma ordem em chamadas
  repetidas (determinismo), a opção correta não fica sempre no índice 0 para
  um conjunto de slides de teste, e a função preserva todos os itens (não
  perde nem duplica opções).

Fora do escopo de teste automatizado: o item 3 (altura flexível) é validado
visualmente (captura de tela via `claude-in-chrome`, como feito durante este
brainstorming), já que é uma questão de CSS/layout sem asserção de conteúdo
textual óbvia.
