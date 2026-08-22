# XP de slides com checkpoint (D1a) — Design

## Contexto

Sub-parte do sub-projeto D (o maior de uma pilha de pedidos sobre
personalização/BrainHexPDF — A, B, C e D2 já entregues ou em PR:
[BrainHexPDF#11](https://github.com/Geisbelly/BrainHexPDF/pull/11),
[BrainHexPDF#12](https://github.com/Geisbelly/BrainHexPDF/pull/12)/[TrailUp#92](https://github.com/Geisbelly/TrailUp/pull/92),
[BrainHexPDF#13](https://github.com/Geisbelly/BrainHexPDF/pull/13),
[TrailUp#93](https://github.com/Geisbelly/TrailUp/pull/93)).

D1 (XP de slides) se revelou maior do que o esperado durante a
investigação e foi quebrado em fases: **D1a** (este documento) monta a
infraestrutura inteira — ponte de comunicação, resolução de IDs,
persistência com idempotência — e conecta **1 tipo de interação (quiz)**
ponta a ponta, como prova de conceito verificável de verdade no app. D1b
(fase seguinte, fora deste documento) estende pros demais tipos de
interação do deck (checklist, decisão, revelação secreta, boss battle,
interação única) depois que D1a comprovar que o mecanismo funciona.

## Descoberta que definiu a arquitetura

A ideia inicial (o próprio deck chamar o Supabase direto) foi descartada:
escrever como o aluno exigiria embutir o **token de sessão dele** no HTML
do deck, que fica hospedado numa URL estável e reaproveitável no Storage —
risco de vazamento de credencial real, diferente do `?hideQuiz=1` do
sub-projeto B (que não carrega nada sensível).

**Mecanismo escolhido**: uma ponte `postMessage` de verdade entre o deck e
o app — o deck nunca tem acesso a nenhuma credencial, só emite um evento
`{itemKey, pontuacaoObtida, pontuacaoMaxima}`; quem grava no banco é o app
(que já tem a sessão autenticada do aluno). Funciona nos dois ambientes:

- **Nativo**: `react-native-webview` (`mobile/package.json`, v13.15.0, já
  suporta isso nativamente) injeta automaticamente
  `window.ReactNativeWebView.postMessage(string)` dentro da página; o
  componente `WebView` recebe via prop `onMessage`.
- **Web**: `window.parent.postMessage(string, '*')` de dentro do iframe;
  a página host escuta via `window.addEventListener('message', handler)`.

**Risco de segurança que o design precisa mitigar**: no navegador,
`window.addEventListener('message')` recebe mensagem de **qualquer
origem** por padrão. O handler precisa validar `event.source ===
iframeRef.current?.contentWindow` (garante que a mensagem veio
especificamente do nosso próprio iframe, não de outra aba/origem) antes de
processar qualquer coisa.

**Risco aceito, não resolvido aqui**: o valor de XP enviado pelo deck não
tem validação forte do servidor — um aluno com o DevTools aberto no
WebView/iframe poderia, em teoria, chamar a função de report manualmente
com um valor inflado. Isso é consistente com o nível de confiança que o
resto do sistema de XP/pontuação já tem hoje (não é uma regressão de
segurança nova introduzida por este design) — fica registrado como
limitação conhecida, não como algo a resolver nesta fase.

## Persistência e idempotência

O deck **já** tem idempotência local: `savedData` (persistido em
`localStorage` do navegador, `BrainHexPDF/src/utils/deckExportUtils.ts`,
bloco `STORAGE_KEY`) só soma XP na primeira vez que uma interação é
respondida corretamente (`handleQuizAnswer`, linha ~1641: `if
(!wasAlreadyCorrect) { totalXp += 150; ... }`). O evento de progresso só
precisa disparar dentro desse mesmo `if` — a checagem de "já ganhou isso
antes" não precisa ser reinventada.

No lado do banco, `personalizacao_item_progresso` (usado hoje por
`salvarProgressoItemPersonalizado`, `mobile/src/context/TrilhaContext.tsx:1699`)
já faz **merge por máximo** (não soma) por `item_key` — reenviar o mesmo
evento (ex.: localStorage do dispositivo foi limpo, ou o aluno reabre o
deck) não duplica pontuação, só reafirma o mesmo valor máximo. Isso cobre
o caso que o `localStorage` do deck sozinho não cobre (troca de
dispositivo, reinstalação do app).

`item_kind` já suporta `"content" | "activity" | "cards"` — sem variante
específica pra slide. Reaproveita `"activity"` (mais próximo
semanticamente: quiz é uma atividade avaliativa) em vez de estender o tipo.

## Wiring — bem mais simples do que a investigação inicial temia

A suspeita inicial era que `personalizacaoId`/`classeId`/`alunoId`
precisariam ser passados como props novas por 4 camadas de componente. **Não
é necessário**: `salvarProgressoItemPersonalizado` (exposto pelo hook
`useTrilha()`, `mobile/src/context/TrilhaContext.tsx:2003`) já resolve
`personalizacaoId`/`classeId`/`alunoId` internamente a partir do estado do
próprio contexto. Só precisa passar **uma função de callback** pelas
camadas, não IDs crus.

**Correção de rota importante encontrada durante a investigação**:
`mobile/src/components/PersonalizedTopicView.tsx` (citado até no
`CLAUDE.md` como ponto de entrada do aluno) é **código morto** — não é
importado/renderizado em nenhum lugar do app real (confirmado por busca
global). A tela de verdade é `mobile/src/app/(tabs)/trilha/[id].tsx`
(`TrilhaConteudoScreen`), que já chama `useTrilha()` e já tem
`salvarProgressoItemPersonalizado` e `topicoId` em escopo exatamente onde
`<ContentRenderer>` é invocado (linha ~1556). A cadeia de wiring correta é:

1. `mobile/src/app/(tabs)/trilha/[id].tsx`: novo `useCallback` que traduz o
   evento do deck pro formato de `salvarProgressoItemPersonalizado`
   (já disponível em escopo), passado como prop `onDeckProgressEvent` pro
   `ContentRenderer` (que já recebe `topicoId` no mesmo local, linha ~1559).
2. `ContentRenderer.tsx`: já declara `topicoId`/`enableItemIA` na interface
   `Props` mas não os usa hoje (achado da investigação — prop morta,
   provavelmente de uma feature planejada e não terminada) — acrescenta
   `onDeckProgressEvent` e efetivamente conecta ao renderizar o bloco
   `embed`, repassando pro `DocumentBlock`.
3. `DocumentBlock.tsx`: repassa pro `WebContentFrame`.
4. `WebContentFrame.tsx`: implementa a ponte de fato (native `onMessage` /
   web `addEventListener('message')` com validação de `event.source`),
   parseia o JSON e chama `onProgressEvent`.

## Escopo desta fase (D1a)

- Só a interação de **quiz** (`handleQuizAnswer`) é conectada ponta a
  ponta.
- Verificação **empírica** (não assumida) se o XP aparece no
  `GameHeader`/`MetaXp`/`ProgressaoPontos` existente sem mudança adicional
  — a investigação não confirmou isso com certeza. Se não aparecer
  automaticamente, isso vira trabalho de D1b/D4, não bloqueia esta PR (o
  objetivo desta fase é a pontuação chegar ao banco corretamente, com
  idempotência — a exibição é secundária).
- Demais interações do deck (checklist, decisão, revelação secreta, boss
  battle, interação única) ficam para D1b, reaproveitando a mesma ponte já
  montada aqui.

## Testes

- **BrainHexPDF**: teste de string (mesmo padrão já usado no repo) em
  `deckExportUtils.test.ts` verificando que o HTML gerado contém a função
  `reportProgressToHost` e que `handleQuizAnswer` a chama dentro do bloco
  `!wasAlreadyCorrect`.
- **TrailUp/mobile**: sem infraestrutura de teste de componente RN (mesmo
  critério já usado nos sub-projetos B/D2) — a lógica de parsing/validação
  da mensagem (`WebContentFrame.tsx`) pode ser extraída como função pura
  testável (ex. `parseDeckProgressMessage(raw: string): DeckProgressEvent | null`)
  em `mobile/src/utils/`, testada isoladamente com `node:test`. A validação
  de origem (`event.source`) fica no componente, não testável sem
  infraestrutura de DOM — coberta por verificação manual.
- Verificação manual (obrigatória antes de finalizar): gerar/abrir um deck
  de exemplo dentro do app real (ou simulação equivalente), responder um
  quiz corretamente, e confirmar no banco (`personalizacao_item_progresso`)
  que a linha com o `item_key` esperado foi gravada com a pontuação certa.
