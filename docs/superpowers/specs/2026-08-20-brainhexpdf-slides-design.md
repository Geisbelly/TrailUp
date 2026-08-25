# Design: Qualidade visual dos slides do BrainHexPDF

Data: 2026-08-20
Status: aprovado para plano de implementação

## Contexto

O BrainHexPDF (`../BrainHexPDF`, repositório irmão) é o motor de apresentação
integrado desde `docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md`:
gera o deck (JSON estruturado, via Gemini) e renderiza o HTML completo,
chamado pelo `microservice/` (trailup) via `POST /api/v1/render-and-store`.

Levantamento no código (`server.ts`, `src/types.ts`,
`src/utils/visualReferenceAnalyzer.ts`, `src/utils/deckExportUtils.ts`)
confirmou as causas técnicas de cada problema relatado:

1. **Sem elementos visuais representativos.** O prompt do Gemini não pede
   diagramas reais. Quem gera `visualDiagram`/`visualExamples` é
   `enrichDeckWithVisualReferences`, uma função separada que usa
   **templates genéricos por keyword-matching** (`analyzeAndGenerateVisualDiagram`),
   com dados fixos e fabricados ("18.5k req/seg", "Client / Interface", "API
   Gateway") desconectados do conteúdo real da aula — só entra em ação quando
   o slide não trouxe `visualDiagram` próprio do Gemini, o que é o caso comum.
2. **Falta de imagens do material de referência.** O endpoint de produção
   `POST /api/v1/render-and-store` (único caminho usado pelo microservice
   hoje) **não aceita `attachments` no request body** — só recebe
   `sourceText` (markdown já sintetizado). A função interna
   `generateDeckSlidesInBatches` já sabe repassar `attachments` como
   `inlineData` multimodal pro Gemini, mas nada nunca preenche esse parâmetro
   no fluxo real. Do lado do microservice, `fetchFontesAsFileData` **já**
   baixa os arquivos do professor (incluindo imagens, com `mimeType`) como
   base64 em memória (`filesData`) para gerar markdown/áudio via
   `processMediaWithGemini` — mas esse mesmo `filesData` nunca é repassado
   para `renderAndUploadPresentationViaBrainHexPdf`. Ou seja: os bytes das
   imagens do professor já chegam ao microservice, só não seguem adiante.
3. **Scroll em vez de responsivo.** `#slide-stage` (`deckExportUtils.ts`)
   usa `overflow-y-auto` como mecanismo de segurança. O número de slides é
   fixado por `resolveTargetSlideCount` **antes** de qualquer conteúdo
   existir, e cada slide é obrigado a acumular parágrafos + storytelling +
   guia + exemplo + takeaways + interativo + componente rico + decorações —
   sem noção de quanto cabe fisicamente no card 16:9 (`min-height: 560px`,
   `max-height: 94vh`).
4. **Sem espaço de anotação.** Existe `presenterNotes` no schema, mas o
   prompt nunca instrui o Gemini a preenchê-lo, e o único lugar que o exibe é
   `PresenterModal.tsx` (modo apresentador/professor) — não é um espaço
   visível no material consumido pelo aluno.
5. **Poluição visual.** O prompt (`buildPedagogicalSystemPrompt`) exige em
   **todo** slide, simultaneamente: `thematicStorytelling`, `characterGuide`,
   `writtenExample`, `keyTakeaways`, um `interactiveType` completo, "elementos
   temáticos ricos" (`timelineSteps`/`metricCards`/`comparisonColumns`/
   `bentoCards` — plural, sem limite), e `aiDecorations` com três SVGs
   customizados por slide (borda, divisor, ícone). Nenhuma triagem por tipo
   de slide.

## Decisões fixas (validadas com o usuário)

1. **Escopo cross-repo.** Esta spec cobre os dois lados: `microservice/`
   (trailup) passa a extrair e repassar imagens do material de referência, e
   BrainHexPDF passa a aceitá-las e usá-las. Não é dividido em duas specs.
2. **Imagem real substitui o diagrama genérico**, não convive com ele. Um
   slide com imagem de referência relevante não recebe também o
   `visualDiagram` fabricado por `analyzeAndGenerateVisualDiagram`.
3. **Paginação dinâmica por densidade de conteúdo**, não contagem fixa de
   slides. A medição é determinística (tamanho de texto + nº de
   componentes), feita no BrainHexPDF depois que o conteúdo existe — não
   delegada ao Gemini tentar prever quanto cabe em pixels.
4. **Despoluição: no máximo 1 componente rico por slide** (diagrama real OU
   timeline OU metricCards OU bentoCards OU comparisonColumns — nunca
   empilhados) e `aiDecorations` reduzido a só `customIconSvg` (remove
   `customBorderSvg`/`customDividerSvg` do schema e do prompt).
5. **Bloco de anotação = slide de checkpoint periódico** com perguntas-guia
   de reflexão, inserido programaticamente a cada bloco de subtópicos — não
   um componente que compete por espaço em todo slide de conteúdo.

## Arquitetura — fluxo de imagens de referência

```
microservice/server.ts
  fetchFontesAsFileData(fontes)
    → filesData: {data: base64, mimeType, name}[]   (JÁ EXISTE, sem mudança)
  │
  ├─ processMediaWithGemini(filesData, ...)          (SEM MUDANÇA — markdown/áudio)
  │
  └─ NOVO: imageAttachments = filesData.filter(f => f.mimeType.startsWith('image/'))
       │
       ▼
     renderAndUploadPresentationViaBrainHexPdf({ ..., attachments: imageAttachments })
       │  (brainHexPdfClient.ts — NOVO campo `attachments` no POST body)
       ▼
     BrainHexPDF POST /api/v1/render-and-store
       │  (NOVO: destructura `attachments` do req.body)
       ▼
     generateDeckSlidesInBatches({ ..., attachments })  (JÁ aceitava — só não recebia)
       │  Gemini vê as imagens multimodalmente, escolhe por slide
       │  `referenceImageIndex` (índice no array de attachments) quando relevante
       ▼
     enrichDeckWithVisualReferences(deck)
       │  NOVO: slide com referenceImageIndex → pula analyzeAndGenerateVisualDiagram
       ▼
     deckExportUtils.ts → generateInteractiveHtml
       NOVO: renderiza <img> com data URI a partir do attachment referenciado
       (sem upload adicional no Storage — os bytes já estão em mãos como base64)
```

Todas as imagens são enviadas em todas as partes/lotes de geração (mesmo
padrão já usado hoje para `attachments` dentro de
`generateDeckSlidesInBatches`, comentário "SEMPRE passa todos os anexos em
todos os blocos"), para que qualquer subtópico possa referenciar qualquer
imagem do material, independente de em qual parte ele caiu.

## Arquitetura — paginação dinâmica (fim do scroll)

- Prompt deixa de exigir "EXATAMENTE N slides"; o Gemini gera 1 slide por
  subtópico com liberdade de densidade de conteúdo (mantendo a exigência de
  profundidade/fidelidade ao material-fonte já existente no prompt).
- Nova função em `deckExportUtils.ts` (ex.: `estimateSlideWeight` +
  `splitOversizedSlide`) mede, por slide gerado: caracteres totais de
  `contentParagraphs` + `writtenExample.explanation` + presença de cada
  componente opcional (cada um consome um "custo" fixo calibrado contra o
  espaço real do card 16:9 — `min-height: 560px` / `max-height: 94vh`).
- Slide que estoura o orçamento é dividido em duas (ou mais) partes
  sequenciais antes da renderização final: título/subtítulo do subtópico
  repetidos com sufixo de parte (ex.: "Parte 1/2"), parágrafos e componente
  rico redistribuídos entre as partes na ordem em que vieram.
- `#slide-stage` mantém `overflow-y-auto` só como rede de segurança residual
  (ex.: viewport extremo do usuário), não como comportamento esperado do
  fluxo normal.
- Efeito colateral aceito: o número total de slides do deck passa a ser
  variável e só conhecido depois da geração — consistente com o ponto já
  registrado em aberto no design de 2026-08-15 sobre partes de
  apresentação vs. partes de markdown/áudio não precisarem se alinhar 1:1.

## Mudanças no schema (`src/types.ts`)

- `SlideData.referenceImageIndex?: number` — novo.
- `SlideData.aiDecorations`: `AiVisualDecorations` perde
  `customBorderSvg`, `customDividerSvg`, `borderDescription`,
  `dividerDescription`, `cornerOrnamentType`, `borderStylePreset` — mantém
  só `customIconSvg` + `iconDescription` + `medievalClassArchetype` +
  `medievalPromptDescription`.
- Novo `SlideType`: `'reflection_checkpoint'`.
- Novo `ReflectionCheckpointInfo { guidingQuestions: string[] }` — 2 a 3
  perguntas geradas a partir do conteúdo já coberto no bloco anterior.
- Slide passa a ter no máximo um dentre `visualDiagram` /
  `referenceImageIndex` / `timelineSteps` / `metricCards` /
  `comparisonColumns` / `bentoCards` preenchido — os demais ficam vazios
  (validação reforçada no prompt, não no schema Zod/Gemini, que não suporta
  XOR nativamente).

## Mudanças no prompt (`buildPedagogicalSystemPrompt` / `generateDeckSlidesInBatches`)

- Remove a exigência de contagem fixa de slides; passa a orientar por
  subtópico (mínimo de subtópicos a cobrir, sem forçar 1:1 com slides).
- Remove instrução de gerar múltiplos "elementos temáticos ricos" por slide;
  passa a instruir: escolher **um** componente rico mais adequado ao
  subtópico.
- Remove instrução de `customBorderSvg`/`customDividerSvg`.
- Adiciona instrução: quando houver imagens anexadas relevantes ao
  subtópico do slide, preencher `referenceImageIndex` com o índice da
  imagem correspondente (0-based, na ordem dos `attachments` enviados) em
  vez de descrever um diagrama.
- Insere, a cada bloco de subtópicos (ex.: a cada 3–4 slides de conteúdo),
  instrução para gerar um slide `reflection_checkpoint` com 2–3
  `guidingQuestions` derivadas do que acabou de ser coberto.

## Mudanças no `microservice/`

- `src/services/brainHexPdfClient.ts`: `RenderAndUploadPresentationParams`
  ganha `attachments?: { data: string; mimeType: string; name: string }[]`;
  incluído no `body` do POST quando não vazio.
- `server.ts`: onde `filesData` já existe (antes de
  `processMediaWithGemini`), filtra por `mimeType.startsWith('image/')` e
  passa o resultado para cada chamada de
  `renderAndUploadPresentationViaBrainHexPdf` dentro de
  `runAudioAndPresentationInParallel` — mesmo array em todas as partes.

## Mudanças no BrainHexPDF

- `server.ts` (`/api/v1/render-and-store`): destructura `attachments` do
  `req.body` e repassa para `generateDeckSlidesInBatches`.
- `src/utils/visualReferenceAnalyzer.ts` (`enrichDeckWithVisualReferences`):
  quando `slide.referenceImageIndex` está definido, não chama
  `analyzeAndGenerateVisualDiagram` para aquele slide.
- `src/utils/deckExportUtils.ts`:
  - novo passo de paginação por densidade antes de `generateInteractiveHtml`;
  - renderização de `<img>` (data URI) quando `referenceImageIndex`
    aponta para um attachment existente;
  - renderização do slide `reflection_checkpoint` (novo layout simples:
    perguntas-guia + espaço reservado, sem os demais componentes ricos).

## Fora de escopo

- Blocos de conteúdo curtos/rasos na API Python (`personalizacao.py`,
  `gerador_conteudo.txt`) — problema relatado junto, mas é um subsistema
  independente (geração de texto na API, não geração de slides no
  BrainHexPDF); tratado em spec separada.
- Persistir as imagens de referência como arquivos individuais no Supabase
  Storage — ficam embutidas como data URI dentro do HTML já gerado, sem
  upload adicional.
- Motor de apresentação legado Python (`slides_pdf.py`/`MultiOutputPipeline`,
  ReportLab) — já fora de escopo desde 2026-08-15, sem mudança aqui.
- Autenticação/rotas antigas do BrainHexPDF (`/api/generate-deck`, UI) — sem
  mudança.
