# Graph Report - microservice  (2026-08-02)

## Corpus Check
- 60 files · ~314,167 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 482 nodes · 983 edges · 21 communities (18 shown, 3 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `20148fa5`
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

## God Nodes (most connected - your core abstractions)
1. `processMediaWithGemini()` - 26 edges
2. `buildApp()` - 19 edges
3. `buildPresentationDesignPlan()` - 16 edges
4. `compilerOptions` - 14 edges
5. `runPipeline()` - 13 edges
6. `BrainHexProfile` - 12 edges
7. `buildDeckHtml()` - 12 edges
8. `generateGeminiContent()` - 12 edges
9. `generateStructuredContentWithFallback()` - 10 edges
10. `generateSlideImage()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `extractFromZip()` --references--> `jszip`  [EXTRACTED]
  src/services/geminiService.ts → package.json
- `Request` --references--> `Logger`  [EXTRACTED]
  server.ts → src/lib/logger.ts
- `generateSlideIcons()` --calls--> `generateSlideIconWithFallback()`  [EXTRACTED]
  server.ts → src/services/slideIconService.ts
- `generateSlideAssets()` --calls--> `buildImageStyleSuffix()`  [EXTRACTED]
  server.ts → src/lib/slideAssetGenerator.ts
- `runPipeline()` --calls--> `buildPresentationDesignPlan()`  [EXTRACTED]
  server.ts → src/constants/presentationThemes.ts

## Import Cycles
- None detected.

## Communities (21 total, 3 thin omitted)

### Community 0 - "server.ts"
Cohesion: 0.06
Nodes (62): AppOptions, archiveMultiPartToSupabase(), archiveToSupabase(), buildApp(), buildPresentationMaterialMetadata(), downloadFonteStreamed(), express-serve-static-core, fetchFontesAsFileData() (+54 more)

### Community 1 - "geminiService.ts"
Cohesion: 0.06
Nodes (65): mapWithConcurrency(), addWavHeader(), ContentGenerationProvider, block(), chapter(), slide(), withGeminiApiKeys(), clientForGeminiKey() (+57 more)

### Community 2 - "slideAssetGenerator.ts"
Cohesion: 0.10
Nodes (36): generateSceneImages(), presentationImageDirection(), presentationLayoutForSlide(), buildFullSlidePrompt(), buildImageStyleSuffix(), FullSlideInput, generateFullSlideImages(), generateOneLegacySlide() (+28 more)

### Community 3 - "dependencies"
Cohesion: 0.05
Nodes (41): clsx, cors, dotenv, express, @google/genai, html2canvas, jszip, lamejs (+33 more)

### Community 4 - "slideTemplate.ts"
Cohesion: 0.12
Nodes (31): main(), outputDir, sceneDataUrl(), slideTitles, BRAIN_HEX_CONFIG, BrainHexConfig, PROFILES, buildPresentationDesignPlan() (+23 more)

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
Cohesion: 0.13
Nodes (15): jspdf, jspdf, App(), BrainHexProfile, GUARDIAN_VOICE_PROFILES, GuardianVoiceProfile, cn(), GeminiTtsVoice (+7 more)

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

### Community 18 - "textSanitize.ts"
Cohesion: 0.50
Nodes (3): DOUBLE_QUOTE, sanitizeLatin1(), SINGLE_QUOTE

## Knowledge Gaps
- **136 isolated node(s):** `name`, `private`, `version`, `description`, `dev` (+131 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `App.tsx`, `devDependencies`?**
  _High betweenness centrality (0.239) - this node is a cross-community bridge._
- **Why does `extractFromZip()` connect `geminiService.ts` to `dependencies`, `resolveRealSlideOrder`?**
  _High betweenness centrality (0.126) - this node is a cross-community bridge._
- **Why does `jszip` connect `dependencies` to `geminiService.ts`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _136 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05824561403508772 - nodes in this community are weakly interconnected._
- **Should `geminiService.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06414414414414414 - nodes in this community are weakly interconnected._
- **Should `slideAssetGenerator.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10299003322259136 - nodes in this community are weakly interconnected._