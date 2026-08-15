# Graph Report - microservice  (2026-08-02)

## Corpus Check
- 60 files · ~316,154 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 492 nodes · 1010 edges · 27 communities (23 shown, 4 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9f4a9e6b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.ts
- geminiService.ts
- slideAssetGenerator.ts
- dependencies
- slideTemplate.ts
- devDependencies
- contentGenerationService.ts
- validators.ts
- App.tsx
- compilerOptions
- logger.ts
- README.md
- materialsMerge.ts
- rateLimit.ts
- dedupedTimeoutRunner.ts
- resolveRealSlideOrder
- serialQueue.ts
- createConcurrencyGate
- textSanitize.ts
- index.ts
- generateGeminiContent
- generateLongConversationalAudio
- geminiKeyRotation.test.ts
- wav.test.ts
- mapWithConcurrency

## God Nodes (most connected - your core abstractions)
1. `processMediaWithGemini()` - 26 edges
2. `buildApp()` - 22 edges
3. `buildPresentationDesignPlan()` - 16 edges
4. `compilerOptions` - 14 edges
5. `runPipeline()` - 13 edges
6. `BrainHexProfile` - 12 edges
7. `buildDeckHtml()` - 12 edges
8. `generateGeminiContent()` - 12 edges
9. `generateSlideImage()` - 11 edges
10. `generateStructuredContentWithFallback()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `App()` --references--> `jspdf`  [EXTRACTED]
  src/App.tsx → package.json
- `extractFromZip()` --references--> `jszip`  [EXTRACTED]
  src/services/geminiService.ts → package.json
- `Request` --references--> `Logger`  [EXTRACTED]
  server.ts → src/lib/logger.ts
- `generateSceneImages()` --calls--> `presentationLayoutForSlide()`  [EXTRACTED]
  server.ts → src/constants/presentationThemes.ts
- `generateSceneImages()` --calls--> `generateSlideImage()`  [EXTRACTED]
  server.ts → src/services/geminiService.ts

## Import Cycles
- None detected.

## Communities (27 total, 4 thin omitted)

### Community 0 - "server.ts"
Cohesion: 0.05
Nodes (65): AppOptions, archiveMultiPartToSupabase(), archiveToSupabase(), buildApp(), buildPresentationMaterialMetadata(), downloadFonteStreamed(), express-serve-static-core, fetchFontesAsFileData() (+57 more)

### Community 1 - "geminiService.ts"
Cohesion: 0.11
Nodes (27): ContentGenerationProvider, ContentPart, DEFAULT_GEMINI_IMAGE_FALLBACK_MODELS, DEFAULT_GEMINI_TEXT_FALLBACK_MODELS, DEFAULT_GEMINI_TTS_FALLBACK_MODELS, distributeEvenly(), executeWithModelFallback(), extractFromZip() (+19 more)

### Community 2 - "slideAssetGenerator.ts"
Cohesion: 0.11
Nodes (34): presentationImageDirection(), presentationLayoutForSlide(), buildFullSlidePrompt(), buildImageStyleSuffix(), FullSlideInput, generateFullSlideImages(), generateOneLegacySlide(), generateSceneImageViaGemini() (+26 more)

### Community 3 - "dependencies"
Cohesion: 0.05
Nodes (43): clsx, cors, dotenv, express, @google/genai, html2canvas, jspdf, jszip (+35 more)

### Community 4 - "slideTemplate.ts"
Cohesion: 0.11
Nodes (33): main(), outputDir, sceneDataUrl(), slideTitles, BRAIN_HEX_CONFIG, BrainHexConfig, PROFILES, PRESENTATION_DESIGN_VERSION (+25 more)

### Community 5 - "devDependencies"
Cohesion: 0.06
Nodes (30): autoprefixer, description, devDependencies, autoprefixer, tailwindcss, tsx, @types/cors, @types/express (+22 more)

### Community 6 - "contentGenerationService.ts"
Cohesion: 0.12
Nodes (27): callOpenAIStructured(), CONTENT_GENERATION_RESPONSE_SCHEMA, CONTENT_GENERATION_SLIDES_SCHEMA, CONTENT_GENERATION_TEXT_SCHEMA, ContentGenerationQualityError, DEFAULT_GEMINI_CONTENT_GENERATION_MODEL, DEFAULT_OPENAI_CONTENT_GENERATION_FALLBACK_MODEL, errorDetails() (+19 more)

### Community 7 - "validators.ts"
Cohesion: 0.13
Nodes (25): RFC-1918, RFC-6890, PresentationLayout, PresentationThemeInput, BaseContentBlock, ContentBlock, ContentEnrichmentRequest, FonteItem (+17 more)

### Community 8 - "App.tsx"
Cohesion: 0.26
Nodes (7): App(), GUARDIAN_VOICE_PROFILES, GuardianVoiceProfile, cn(), GeminiTtsVoice, generateNaturalAudio(), generateSlideImage()

### Community 9 - "compilerOptions"
Cohesion: 0.11
Nodes (17): DOM, DOM.Iterable, ES2022, compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules (+9 more)

### Community 10 - "logger.ts"
Cohesion: 0.19
Nodes (13): buildLogger(), createLogger(), CreateLoggerOptions, emit(), formatValue(), LEVEL_PRIORITY, LogFields, LoggerInternals (+5 more)

### Community 11 - "README.md"
Cohesion: 0.13
Nodes (14): Apresentacoes tematicas, Comandos, Documentacao, Documentacao detalhada (arquitetura separada), Documentos novos, Endpoints, Estado atual (2026-07-28), Estrutura (+6 more)

### Community 12 - "materialsMerge.ts"
Cohesion: 0.28
Nodes (4): computeMergedMaterials(), MaterialsMap, MergeResult, TERMINAL_STATUSES

### Community 13 - "rateLimit.ts"
Cohesion: 0.25
Nodes (4): createRateLimiter(), RateCheckResult, RateLimiter, RateLimiterOptions

### Community 15 - "resolveRealSlideOrder"
Cohesion: 0.48
Nodes (4): parseRelsMap(), parseSlideIdOrder(), resolveRealSlideOrder(), sortByFilenameNumber()

### Community 17 - "createConcurrencyGate"
Cohesion: 0.27
Nodes (16): block(), slide(), consolidateBlockBatchGenerations(), generateOpenAIFallbackChapters(), mergeContentBlocksIntoOne(), mergeSplitFallbackChapters(), normalizedStringList(), normalizedText() (+8 more)

### Community 18 - "textSanitize.ts"
Cohesion: 0.50
Nodes (3): DOUBLE_QUOTE, sanitizeLatin1(), SINGLE_QUOTE

### Community 21 - "index.ts"
Cohesion: 0.20
Nodes (10): BrainHexProfile, RegenerateOptions, ApiKeysConfig, AudioRequest, EnrichedContentBlock, ImageRequest, InternalBlock, ProcessedContent (+2 more)

### Community 22 - "generateGeminiContent"
Cohesion: 0.33
Nodes (10): clientForGeminiKey(), cooldownKey(), geminiApiKeys(), generateGeminiContent(), getAi(), isGeminiModelUnavailableError(), isGeminiQuotaOrRateLimitError(), isGeminiTransientUnavailableError() (+2 more)

### Community 23 - "generateLongConversationalAudio"
Cohesion: 0.33
Nodes (9): chapter(), encodePcmToWavAndMp3(), generateConversationalAudio(), generateLongConversationalAudio(), generateLongNaturalAudio(), joinAudioChapters(), require, splitTtsChapters() (+1 more)

### Community 24 - "geminiKeyRotation.test.ts"
Cohesion: 0.48
Nodes (6): withGeminiApiKeys(), parseGeminiApiKeys(), resetGeminiKeyRotationForTests(), resolveGeminiImageFallbackModels(), resolveGeminiTextFallbackModels(), resolveGeminiTtsFallbackModels()

## Knowledge Gaps
- **139 isolated node(s):** `name`, `private`, `version`, `description`, `dev` (+134 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `devDependencies`?**
  _High betweenness centrality (0.235) - this node is a cross-community bridge._
- **Why does `extractFromZip()` connect `geminiService.ts` to `dependencies`, `resolveRealSlideOrder`?**
  _High betweenness centrality (0.127) - this node is a cross-community bridge._
- **Why does `jszip` connect `dependencies` to `geminiService.ts`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _139 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05299608551641072 - nodes in this community are weakly interconnected._
- **Should `geminiService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10582010582010581 - nodes in this community are weakly interconnected._
- **Should `slideAssetGenerator.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1073170731707317 - nodes in this community are weakly interconnected._