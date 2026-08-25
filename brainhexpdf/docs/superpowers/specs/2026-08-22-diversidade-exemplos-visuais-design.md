# Diversidade de exemplos visuais no deck — Design

## Contexto

Sub-projeto C de uma pilha maior de pedidos (A — correções visuais rápidas,
[PR#11](https://github.com/Geisbelly/BrainHexPDF/pull/11) — e B — quiz
dinâmico por modoOperacao, [PR#12](https://github.com/Geisbelly/BrainHexPDF/pull/12)
— já entregues).

Pedido: "as apresentações ficam repetindo o mesmo exemplo visual quando
deveriam usar outros e aplicar o uso de todos os exemplos visuais do
conteudo de referencia". Escopo confirmado com o usuário: **só o fix
funcional** (distribuir o uso das imagens), sem passada de design
visual/estético adicional (a skill `frontend-design`, cogitada inicialmente,
é voltada a identidade visual de UI nova — paleta, tipografia, hero — não a
lógica de seleção de conteúdo, então não se aplica aqui).

## Causa raiz

`server.ts:1408` (instrução #7 do prompt principal de geração do deck) não
tem nenhuma orientação de diversidade — só instrui a preencher
`referenceImageIndex` quando uma imagem for "diretamente relevante ao
subtópico de um slide", sem noção de quais imagens já foram usadas em
slides anteriores. `src/utils/slideIllustrations.ts`, no primeiro loop
(resolução do `referenceImageIndex` escolhido pelo modelo, linhas ~171-212),
processa cada slide isoladamente, sem rastrear uso entre slides. Resultado:
nada impede o modelo de escolher o mesmo índice de imagem pra vários
subtópicos diferentes do mesmo deck, enquanto outras imagens anexadas pelo
professor nunca aparecem.

## Fix — duas camadas (mesmo padrão já usado nesta sessão pra
quiz/truncamento: prompt + rede de segurança determinística)

### 1. Prompt (`server.ts`, instrução #7)

Acrescentar orientação explícita de distribuição ao texto da instrução 7,
citando a contagem de imagens disponíveis (já exibida em
`attachmentsListing`, `server.ts:1373`): tentar usar cada imagem anexada
pelo menos uma vez ao longo do deck antes de repetir a mesma imagem numa
segunda vez, especialmente entre subtópicos diferentes.

Isso sozinho é só uma sugestão (nenhuma garantia de que o modelo obedeça) —
por isso a camada 2.

### 2. Reforço determinístico (`src/utils/slideIllustrations.ts`)

No primeiro loop de `resolveSlideIllustrations` (o que processa
`referenceImageIndex`/`restyleReferenceImage` vindos do modelo), rastrear:
- `usedIndices: Set<number>` — todo índice de attachment já consumido por
  algum slide anterior no deck.
- `usedIndicesBySubtopic: Map<string, number>` — qual índice foi usado pela
  última vez para cada subtópico.

Ao processar um slide com `referenceImageIndex` válido:
- Se o subtópico deste slide **já usou esse mesmo índice antes** (reuso
  legítimo — é o mesmo assunto reaparecendo, ex. "DNS parte 1" e "DNS parte
  2"), mantém como está. Não mexe no comportamento já existente pra esse
  caso.
- Se o índice **já foi usado por um subtópico diferente** e existe pelo
  menos uma imagem anexada que **nunca** apareceu em nenhum slide do deck
  até agora, redireciona este slide pra uma dessas imagens não usadas
  (a de menor índice disponível, para determinismo/testabilidade) em vez de
  repetir.
- Caso contrário (índice não repetido, ou repetido mas sem alternativa não
  usada disponível), mantém o índice escolhido pelo modelo sem alteração.

Isso prioriza **cobertura** (usar todas as imagens do professor) sobre
relevância estrita além do básico — trade-off consciente e aceito: todas as
imagens vêm do material de referência do próprio professor para aquele
tópico, então usá-las é razoável mesmo quando não é a correspondência mais
específica possível para aquele slide exato.

Não afeta o segundo loop (geração de ilustração de fallback por subtópico
único, que só roda quando `attachments.length === 0`, conforme o fix do
sub-projeto A) nem a lógica de `restyleReferenceImage`/geração de imagem
estilizada em si — só qual **índice de attachment** alimenta essas etapas
seguintes.

## Testes

Mesmo padrão TDD (`node:test`/`node:assert/strict`) usado nos sub-projetos
anteriores. Cobrir em `slideIllustrations.test.ts`:
- Modelo repete o mesmo índice em 2 subtópicos diferentes com uma 3ª imagem
  nunca usada disponível → o 2º subtópico é redirecionado pra imagem não
  usada.
- Mesmo subtópico reaparecendo em 2 slides com o mesmo índice → não é
  redirecionado (reuso legítimo preservado).
- Todas as imagens já usadas (sem alternativa disponível) → mantém o índice
  original mesmo repetido (não há pra onde redirecionar).
- `restyleReferenceImage: true` num slide redirecionado → o restyle é
  aplicado sobre a imagem **nova** (a que foi redirecionada), não a
  originalmente escolhida pelo modelo.
