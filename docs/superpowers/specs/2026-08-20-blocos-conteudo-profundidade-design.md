# Design: Profundidade e quantidade dos blocos de conteúdo

Data: 2026-08-20
Status: aprovado para plano de implementação

## Contexto

Professores relatam que o material de estudo gerado tem **poucos blocos**,
**muito curtos** e **pouco aprofundados**. Levantamento no pipeline
(`api/app/services/content_enrichment.py` na API Python +
`microservice/src/services/geminiService.ts` no microservice) mostrou uma
cadeia de causas técnicas, cada uma com seu próprio "piso mínimo" — e a
maioria desses pisos já foi **reduzida deliberadamente no passado** por
incidentes reais de estouro de teto de tokens de saída.

### Poucos blocos

`_source_segments()` divide o material cadastrado pelo professor
(`conteudos`, `atividades`, `fontes_contexto`, descrição/objetivo do
tópico) por parágrafo/heading (`_split_sections`). `_group_segments()`
agrupa esses segmentos em blocos: `group_count = min(len(segments),
_MAX_BLOCKS_CEILING=60, max(baseline_groups, size_based_groups))`, onde
`baseline_groups = min(_MAX_BLOCKS=24, nº de segmentos)`. Não existe
nenhum mecanismo que gere blocos além do que o material bruto contém — a
contagem de blocos é um reflexo direto e proporcional do que o professor
cadastrou. Material escasso vira poucos blocos por construção, não por bug.

### Blocos curtos / pouco aprofundados — dois pisos empilhados

1. **Enriquecimento** (`content_enrichment.py`, `_ENRICHMENT_INSTRUCTIONS`
   item 4 + `_minimum_expanded_length`): exige só **30% e 200 caracteres**
   a mais que `conteudo_base`. Teto de `_MAX_EXPANDED_CHARS = 12_000`.
2. **Geração do markdown final** (`geminiService.ts`, dentro de
   `processMediaWithGemini`): exige só **55% de cobertura** de
   `conteudo_aprofundado` no markdown (áudio: 35%) — **reduzido de 75%**
   porque, em produção, os modelos convergiam consistentemente em 90-98%
   do piso antigo sem nunca cruzar (assinatura de teto de tokens apertado,
   não de "preguiça" do modelo — ver comentário em `geminiService.ts:866-874`).

Empilhados: um bloco pode legalmente terminar com só ~30% × 55% ≈ **71%**
do tamanho do texto-base do professor no material final entregue ao aluno
— e a tolerância de último recurso (95% de cada piso) permite cair ainda
mais em casos extremos.

### Achado extra: orçamento de tokens sendo gasto à toa

`processMediaWithGemini` gera markdown, `audioScript` **e `slides`** na
mesma chamada Gemini, dividindo o mesmo `maxOutputTokens`
(`GEMINI_CONTENT_GENERATION_RESPONSE_SCHEMA.required` inclui `"slides"`;
há até um fallback OpenAI dedicado, `generateSlides()`). Rastreando o
pipeline principal (`runPipeline` → `splitProcessedContentIntoParts` →
`renderAndUploadPresentationViaBrainHexPdf`), esse `slides` **nunca é
enviado ao BrainHexPDF** (que gera sua própria apresentação a partir do
`markdown` como `sourceText` — ver
`docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md`) nem
é consumido em nenhum outro lugar do fluxo principal. O único uso restante
de `processed.slides` no arquivo é `processed.slides?.[0]?.title` dentro da
rota legada `/api/v1/archive` (caminho antigo do frontend, fora do pipeline
principal), só para derivar um título de fallback. Ou seja: cerca de 1/3 do
orçamento de saída da chamada principal de conteúdo é gasto gerando algo
que ninguém lê.

## Decisões fixas (validadas com o usuário)

1. **Liberar o orçamento antes de subir o teto.** Remover a geração de
   `slides` da chamada de conteúdo do microservice (schema, chapter
   merging, fallback OpenAI, `ContentPart`) é a alavanca de menor risco e
   maior retorno — reduz custo (menos texto gerado) e libera orçamento real
   pra markdown/áudio, sem precisar subir `maxOutputTokens` para obter o
   mesmo ganho.
2. **Elevar os dois pisos mínimos, com folga.** Enriquecimento: 30%/200
   chars → ~50%/350 chars. Cobertura do markdown final: 55% → ~70% (áudio:
   35% → ~45%). `maxOutputTokens` default sobe moderadamente (16 384 →
   24 576) como margem extra, não como alavanca principal — já é
   configurável via env (`CONTENT_GENERATION_BATCH_MAX_OUTPUT_TOKENS`/
   `CONTENT_GENERATION_MERGED_MAX_OUTPUT_TOKENS`), risco baixo de mudar só
   o fallback default.
3. **Complementação curricular só para material escasso, ancorada no
   objetivo do tópico.** Blocos com `conteudo_base` abaixo de um limiar
   (~800 caracteres) são marcados como "escassos" na chamada de
   enriquecimento. Só para esses, nova instrução permite adicionar
   conceitos curriculares padrão sobre o tema — sempre servindo
   diretamente ao `objetivo` cadastrado do tópico, nunca contradizendo ou
   substituindo o que o professor escreveu, só preenchendo lacuna na mesma
   direção. Blocos com material já rico continuam sob a instrução atual
   (fidelidade estrita, só aprofunda o que já está lá).
4. **Contagem de blocos permanece dirigida pelo material de entrada.**
   Não se cria blocos novos artificialmente — a resposta para "poucos
   blocos" é que cada bloco existente carrega bem mais profundidade real
   (decisões 2 e 3), não uma contagem inflada.

## Arquitetura

```
API Python (content_enrichment.py)
  _source_segments()          — SEM MUDANÇA (segmentação por parágrafo/heading)
  _group_segments()           — SEM MUDANÇA (contagem de blocos = f(material))
  │  NOVO: marca bloco como "escasso" quando len(conteudo_base) < ~800 chars
  ▼
  enrich_base_blocks() / _enrich_base_blocks_with_gemini() / _with_openai()
  │  _ENRICHMENT_INSTRUCTIONS: piso 30%/200 → ~50%/350
  │  NOVO: instrução condicional de complementação curricular
  │        (só quando bloco escasso, ancorada no `objetivo` do tópico)
  ▼
  conteudo_aprofundado (por bloco, mais profundo)
  │
  ▼
microservice (geminiService.ts, processMediaWithGemini)
  GEMINI_CONTENT_GENERATION_RESPONSE_SCHEMA
  │  REMOVE campo "slides" (nunca chega ao BrainHexPDF)
  │  minimumMarkdownLength: 55% → ~70% de conteudo_aprofundado
  │  minimumAudioLength: 35% → ~45%
  │  maxOutputTokens default: 16_384 → 24_576
  ▼
  markdown, audioScript (mais profundos, sem "slides" morto competindo
  pelo orçamento de output)
  │
  ▼
  splitProcessedContentIntoParts() → renderAndUploadPresentationViaBrainHexPdf()
  (SEM MUDANÇA — sourceText continua vindo do markdown; ver
  docs/superpowers/specs/2026-08-20-brainhexpdf-slides-design.md pro lado
  da apresentação)
```

## Mudanças por arquivo

### `api/app/services/content_enrichment.py`

- `_MIN_EXPANSION_RATIO`: `0.30` → `0.50`.
- `_MIN_EXPANSION_CHARS`: `200` → `350`.
- Novo `_SCARCE_BLOCK_CHARS_THRESHOLD = 800`.
- `_group_segments()` (ou uma função nova logo após, chamada antes de
  `enrich_base_blocks`): marca cada bloco com `"escasso": len(conteudo_base)
  < _SCARCE_BLOCK_CHARS_THRESHOLD` antes de enviá-lo para
  `_enrich_base_blocks_with_gemini`/`_with_openai`.
- `_ENRICHMENT_INSTRUCTIONS`: atualiza item 4 com os novos números; novo
  item explicando o campo `"escasso"` por bloco e a permissão condicional
  de complementação curricular ancorada em `objetivos`/`topico`.
- `_ENRICHMENT_SCHEMA`: sem mudança estrutural (o campo `"escasso"` é
  informado na requisição, não pedido de volta na resposta).
- Testes (`api/tests/test_content_enrichment.py`): atualiza expectativas
  de piso mínimo; novo teste cobrindo marcação de bloco escasso e novo
  teste de que bloco rico não recebe a instrução de complementação.

### `microservice/src/services/geminiService.ts`

- `GEMINI_CONTENT_GENERATION_RESPONSE_SCHEMA`: remove propriedade `slides`
  do item de `chapters` e do array `required`.
- Remove `slides` de `ContentPart`/`ChapterContent` (ou tipo equivalente),
  da função `generateSlides()` (fallback OpenAI) e de
  `mergeSplitFallbackChapters`.
- `splitProcessedContentIntoParts`: assinatura perde o campo `slides` de
  `content`/`ContentPart`.
- `minimumMarkdownLength`: fator `0.55` → `0.70`.
- `minimumAudioLength`: fator `0.35` → `0.45`.
- `DEFAULT_CONTENT_GENERATION_MAX_OUTPUT_TOKENS` (e o equivalente
  `_MERGED_`): `16_384` → `24_576`.
- Prompt de geração (texto que acompanha `GEMINI_CONTENT_GENERATION_RESPONSE_SCHEMA`):
  remove instruções de gerar slides.
- Testes (`src/services/contentGenerationService.test.ts`,
  `src/services/geminiBlockBatches.test.ts`): removem fixtures/expectativas
  de `slides` na resposta da chamada de conteúdo; atualizam pisos mínimos
  esperados.

### `microservice/server.ts`

- Rota principal (`runPipeline`): `resultado.slides` deixa de existir —
  ajusta o que hoje monta `parts` a partir de `resultado.markdown`/
  `resultado.audioScript` só.
- Rota legada `/api/v1/archive`: `processed.slides?.[0]?.title` (linha
  ~1543) perde a fonte `processed.slides` — cai direto no fallback
  `class_name` já existente na mesma expressão (`?? class_name`), sem
  precisar de outra mudança ali.

## Fora de escopo

- Motor de apresentação do BrainHexPDF — coberto por
  `docs/superpowers/specs/2026-08-20-brainhexpdf-slides-design.md`.
- Geração granular/retomável por bloco (falhas parciais, retry) — já
  implementada, `docs/superpowers/specs/2026-08-18-geracao-granular-retomavel-design.md`.
- Rota legada `/api/v1/archive` e o motor clássico/imersivo de slides que
  ela ainda referencia (`buildPresentationDesignPlan`) — fora do pipeline
  principal, sem mudança funcional além da remoção pontual citada acima.
- Mudar como o professor cadastra/estrutura o material de origem (upload,
  parsing de PDF/DOCX, etc.) — está fora do escopo desta spec.
