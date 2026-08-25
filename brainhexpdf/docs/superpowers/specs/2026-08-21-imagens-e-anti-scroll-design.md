# Design: Imagens visuais reais e fim do scroll nos slides

Data: 2026-08-21
Status: aprovado para plano de implementação

## Contexto

Spec anterior (`docs/superpowers/specs/2026-08-20-brainhexpdf-slides-design.md`,
já implementada e em produção) resolveu dois problemas: reaproveitar
imagens do material quando o Gemini aponta um `referenceImageIndex`
relevante, e paginar slides por densidade de conteúdo pra reduzir scroll.

Testando ao vivo em produção (2026-08-21) após uma geração nova, dois
problemas persistem:

1. **Sem imagens genuínas.** O tópico testado (Redes/DNS) não tinha
   nenhuma imagem cadastrada pelo professor — a spec anterior só sabe
   *reaproveitar* imagem existente, não gerar uma quando não há nenhuma.
   Resultado: slide só com texto e ícone decorativo, nenhum elemento
   visual real.
2. **Scroll ainda existe na capa.** `slidePagination.ts`
   (`NON_SPLITTABLE_TYPES`) exclui explicitamente slides do tipo `cover`
   da paginação por densidade — e o slide problemático observado
   (`type: 'cover'`, com storytelling completo + fala do guia + vários
   parágrafos) é exatamente esse tipo. A exceção que deveria proteger um
   caso simples acabou sendo o buraco real.

## Decisões fixas (validadas com o usuário)

1. **Reaproveitar vs. reilustrar é decisão do Gemini, por imagem.** Quando
   uma imagem do material é relevante a um slide, o modelo escolhe entre
   usá-la como está (`referenceImageIndex` sozinho, comportamento atual) ou
   pedir uma versão nova estilizada pro perfil BrainHex
   (`referenceImageIndex` + `restyleReferenceImage: true`) — usando a
   imagem original como base (multimodal: imagem + prompt de estilo), não
   não uma imagem do zero desconectada do exemplo real. Limite de 2-3
   reilustrações por deck (instrução de prompt), pra conter custo/latência.
2. **Sem imagem nenhuma no material → gera 1 ilustração por subtópico.**
   Não por slide (custo) — agrupa os slides gerados pelo campo `subtopic`
   (já existe no schema) e gera uma imagem por grupo, aplicada ao primeiro
   slide daquele subtópico. Texto→imagem, baseada no conteúdo real do
   subtópico + estética do perfil.
3. **`cover` entra na paginação por densidade.** Remove a exceção. Slides
   do tipo `cover` divididos viram `story_intro` na segunda parte (layout
   padrão de 2 colunas), em vez de repetir ícone/grade de resumo da capa.
4. **Orçamento de peso mais rigoroso.** `estimateSlideWeight` passa a
   contar peso de imagem presente (hoje não contava nada — uma lacuna
   real, já que toda imagem agora consome espaço de coluna real) e um
   overhead fixo para o tipo `cover` (ícone + fala do guia + grade de
   Rank/XP/Perfil, hoje não contabilizados). Teto geral desce de 1400 para
   ~1000.
5. **Sem Puppeteer/Chrome headless.** Avaliado e descartado: esse mesmo
   serviço já teve uma cadeia de incidentes de produção com Chrome
   headless (`docs/api/superpowers/specs/2026-07-30-apresentacao-html-direto-design.md`
   — certificado, disco cheio, cache, libs de sistema faltando) que levou
   à remoção deliberada do Puppeteer do pipeline. Medição de altura real
   renderizada fica fora de escopo; a paginação continua sendo estimativa
   heurística (itens 3 e 4).

## Arquitetura

```
BrainHexPDF render-and-store
  generateDeckSlidesInBatches(...)          [prompt ganha instrucao de
                                              restyleReferenceImage + limite
                                              de 2-3 reilustracoes/deck]
  │
  ▼
  slides com referenceImageIndex (+ restyleReferenceImage opcional)
  │
  ▼
  NOVO: resolveOrGenerateSlideImages(slides, attachments, {targetProfile, theme})
    1. referenceImageIndex sem restyle → reaproveita como esta
       (resolveReferenceImageDataUris, SEM MUDANCA)
    2. referenceImageIndex + restyleReferenceImage=true → generateImageWithKeyRotation
       COM imagem de referencia (NOVO parametro multimodal) + prompt de
       estilo do perfil → novo referenceImageDataUri
    3. attachments.length === 0 → agrupa slides restantes por subtopic,
       gera 1 imagem por grupo via generateImageWithKeyRotation (texto→
       imagem) → referenceImageDataUri no primeiro slide do grupo
  │
  ▼
  insertReflectionCheckpoints(...)           [SEM MUDANCA]
  │
  ▼
  paginateSlidesByDensity(...)               [MUDA: cover divisivel, pesos
                                               de imagem/cover, teto ~1000]
  │
  ▼
  generateInteractiveHtml(...)               [SEM MUDANCA de renderizacao —
                                               referenceImageDataUri ja
                                               renderiza, ver spec anterior]
```

## Mudanças por arquivo

### `server.ts` — `generateImageWithKeyRotation`

- Novo parâmetro opcional `referenceImage?: { mimeType: string; data: string }`.
  Quando presente, adiciona um `part` de `inlineData` (imagem) ANTES do
  `part` de texto no `contents.parts` enviado ao Gemini — mesmo padrão
  multimodal já usado em `generateWithKeyRotation`/conteúdo (`inlineData`
  com `mimeType`/`data`).

### `server.ts` — prompt (`buildPedagogicalSystemPrompt`/`fullPrompt`)

- Instrução nova junto da já existente sobre `referenceImageIndex`: quando
  a imagem original já é um bom exemplo visual (ex.: diagrama técnico já
  claro), preencher só `referenceImageIndex`. Quando a imagem se beneficia
  de estilização pro perfil (ex.: foto genérica, ilustração fora do tom do
  perfil), preencher `referenceImageIndex` **e** `restyleReferenceImage:
  true`. Limite: no máximo 2-3 slides com `restyleReferenceImage: true`
  por deck.

### `src/utils/resolveReferenceImages.ts` → renomeado/expandido para `src/utils/slideIllustrations.ts`

- Mantém `fetchHtmlDeckSource`-style de responsabilidade única: função pura
  recebe `slides`, `attachments`, um `generateImage` injetado (pra
  testabilidade sem chamar Gemini de verdade) e devolve `slides` com
  `referenceImageDataUri` resolvido pelos 3 caminhos da decisão 1-2.
- Agrupamento por `subtopic` pro caminho 3 (sem imagem nenhuma no
  material): `Map<string, SlideData[]>`, gera 1 imagem por chave, aplica
  só ao primeiro slide de cada grupo (evita imagem repetida nos outros
  slides do mesmo subtópico).

### `src/utils/slidePagination.ts`

- Remove `'cover'` de `NON_SPLITTABLE_TYPES`.
- `estimateSlideWeight`: soma peso fixo quando `referenceImageDataUri`
  presente; soma overhead fixo quando `type === 'cover'`.
- `MAX_CONTENT_WEIGHT`: 1400 → 1000 (valor a calibrar durante
  implementação, documentado como heurística ajustável — mesmo padrão já
  usado nos outros pesos deste arquivo).
- `splitSlide`: quando `slide.type === 'cover'`, a segunda parte recebe
  `type: 'story_intro'` em vez de manter `'cover'` — evita repetir
  ícone/badge/grade de resumo (Rank/XP/Perfil) que só fazem sentido uma
  vez, no início do deck.

## Testes

- `slideIllustrations.test.ts` (substitui/expande
  `resolveReferenceImages.test.ts`): casos já existentes (reaproveita sem
  restyle) + novo caso com `restyleReferenceImage: true` (verifica que o
  `generateImage` injetado é chamado com a imagem de referência) + novo
  caso de agrupamento por `subtopic` quando `attachments` está vazio.
- `slidePagination.test.ts`: atualiza teste que hoje afirma "cover nunca é
  dividido" para o novo comportamento; novo teste de peso extra por
  imagem/cover; novo teste do rebaixamento de tipo na segunda parte de um
  `cover` dividido.
- `server.ts` (`generateImageWithKeyRotation`): sem teste dedicado hoje
  (chamada real ao Gemini) — mantém esse padrão, sem adicionar mock de
  rede novo fora do já estabelecido no arquivo.

## Fora de escopo

- Medição de altura renderizada via Chrome headless (Puppeteer) — decisão
  4 explícita acima.
- Mudar a paginação de slides do microservice trailup (markdown/áudio) —
  este design é só do lado BrainHexPDF (deck/apresentação).
- Geração granular retomável por imagem (se uma imagem falhar, o slide
  simplesmente fica sem `referenceImageDataUri`, cai no fallback já
  existente de diagrama/ícone — sem retry dedicado nem persistência
  parcial de imagens).
