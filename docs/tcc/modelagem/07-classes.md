# 7. Diagramas de classes

O sistema não tem um modelo de objetos de domínio único. O domínio vive no banco (ver o [capítulo 5](./05-dados.md)), e as classes de cada serviço organizam o **comportamento**. Este capítulo mostra as estruturas em que a orientação a objetos é decisão de projeto.

## 7.1 Pipeline de análise: estratégia por estágio

`LinearAnalysisOrchestrator` recebe uma implementação por estágio. Cada estágio é um `Protocol`, e `build_linear_analysis_orchestrator` escolhe a implementação pela configuração (`*_MODEL_PROVIDER`). É o padrão Strategy. Ele permite trocar uma regra por um modelo treinado sem tocar no orquestrador, que é o que o nome "desenhado para receber modelos" quer dizer.

```mermaid
classDiagram
  class LinearAnalysisOrchestrator {
    +run(request, state, config) LinearPipelineResult
  }
  class EmotionAnalyzer {
    <<Protocol>>
    +analyze() EmotionStageResult
  }
  class ReadingAnalyzer {
    <<Protocol>>
    +analyze() ReadingStageResult
  }
  class InteractionAnalyzer {
    <<Protocol>>
    +analyze() InteractionStageResult
  }
  class PerformanceAnalyzer {
    <<Protocol>>
    +analyze() PerformanceStageResult
  }
  class AttentionAnalyzer {
    <<Protocol>>
    +analyze() AttentionStageResult
  }
  class DecisionEngine {
    <<Protocol>>
    +decide() DecisionStageResult
  }
  class AdaptiveContentGenerator {
    <<Protocol>>
    +generate() dict
  }

  LinearAnalysisOrchestrator o-- EmotionAnalyzer
  LinearAnalysisOrchestrator o-- ReadingAnalyzer
  LinearAnalysisOrchestrator o-- InteractionAnalyzer
  LinearAnalysisOrchestrator o-- PerformanceAnalyzer
  LinearAnalysisOrchestrator o-- AttentionAnalyzer
  LinearAnalysisOrchestrator o-- DecisionEngine
  LinearAnalysisOrchestrator o-- AdaptiveContentGenerator

  EmotionAnalyzer <|.. DeepFaceEmotionAnalyzer : regra
  EmotionAnalyzer <|.. LocalVisionEmotionAnalyzer : YuNet + FER+
  LocalVisionEmotionAnalyzer --> DeepFaceEmotionAnalyzer : fallback
  ReadingAnalyzer <|.. IsolationForestReadingAnalyzer : regra
  InteractionAnalyzer <|.. HiddenMarkovInteractionAnalyzer : regra
  PerformanceAnalyzer <|.. DeepKnowledgeTracingAnalyzer : regra
  AttentionAnalyzer <|.. RandomForestAttentionAnalyzer : regra
  DecisionEngine <|.. XGBoostDecisionEngine : regra
  DecisionEngine <|.. M2GatedDecisionEngine : regra + M2
  M2GatedDecisionEngine ..> M2Inference
  AdaptiveContentGenerator <|.. GraphAdaptiveContentGenerator : graph_ephemeral
```

## 7.2 Serviços de modelo de linguagem

```mermaid
classDiagram
  class JsonLLMService {
    +settings
    +ainvoke_structured(prompt_name, payload, schema, model, provider, use_rag) T
    -_ainvoke_gemini_with_rotation()
  }
  class OpenAIRagService {
    +vector_store_id
    +top_k
    +is_configured() bool
    +invoke_structured(prompt_name, payload, schema, model) BaseModel
    +upload_public_file(session, filename, content, mime_type, attributes) dict
    -_desfazer_envio()
  }
  class RagOpenAIFilesRepository {
    +buscar_concluido(vector_store_id, source_hash)
    +registrar(...)
    +listar_do_corpus(vector_store_id, corpus)
    +remover(ids)
  }
  class StructuredOutputError
  class MenorSemOpenAIError
  class OpenAIRagError

  JsonLLMService ..> OpenAIRagService : use_rag
  OpenAIRagService ..> RagOpenAIFilesRepository : catálogo
  StructuredOutputError <|-- MenorSemOpenAIError
  JsonLLMService ..> StructuredOutputError : levanta
  OpenAIRagService ..> OpenAIRagError : levanta
```

`listar_do_corpus` e `remover` chegam com a PR #948.

## 7.3 Camadas do backend: rota, serviço e repositório

```mermaid
classDiagram
  direction LR
  class PersonalizacaoRouter {
    POST /personalizar
    POST /personalizar/chat
    /personalizar/jobs/*
  }
  class TelemetriaRouter {
    POST /telemetria/lotes
  }
  class personalizacao_jobs_loop {
    <<worker>>
  }
  class analise_fila_loop {
    <<worker>>
  }
  class PersonalizacaoJobsService {
    <<módulo personalizacao_jobs.py>>
  }
  class PersonalizacaoJobsRepository
  class TelemetriaRepository
  class LinearAnalysisOrchestrator
  class TrailUpGraph {
    <<LangGraph compilado>>
  }
  class MediaAgents {
    <<módulo media_agents.py>>
    disparar_brainhex_async()
  }

  PersonalizacaoRouter ..> TrailUpGraph
  PersonalizacaoRouter ..> PersonalizacaoJobsService
  personalizacao_jobs_loop ..> PersonalizacaoJobsService
  PersonalizacaoJobsService ..> PersonalizacaoJobsRepository
  PersonalizacaoJobsService ..> MediaAgents
  TelemetriaRouter ..> TelemetriaRepository
  TelemetriaRouter ..> LinearAnalysisOrchestrator
  analise_fila_loop ..> LinearAnalysisOrchestrator
  LinearAnalysisOrchestrator ..> TrailUpGraph
```

Os 27 repositórios em `api/app/repositories/` escrevem SQL explícito (`text()`), e cada um recebe uma `AsyncSession`. Não há ORM de entidades.

## 7.4 App do aluno: provedor de personalização

O app acessa a personalização por uma interface. A implementação mistura os dois caminhos da regra de fronteira: o que é IA vai para a API, e o que é leitura ou escrita simples vai direto ao Supabase.

```mermaid
classDiagram
  class IPersonalizacaoProvider {
    <<interface>>
    +hasApiConfigured() bool
    +solicitarPersonalizacao()
    +listarPersonalizacoesPersistidasPerfil()
    +obterSugestaoMaterial()
    +listarSugestoesMaterialTurma()
    +listarJobsPersistidosAluno()
    +salvarProgressoPersonalizadoDiretoSupabase()
    +subscribePersonalizacoesPersistidasClasse()
    +conversarComMentorPersonalizacao()
  }
  class TrailupApiProvider
  class PersonalizacaoAuthError
  class PersonalizacaoNetworkError
  class PersonalizacaoRlsError
  IPersonalizacaoProvider <|.. TrailupApiProvider
  TrailupApiProvider ..> PersonalizacaoAuthError
  TrailupApiProvider ..> PersonalizacaoNetworkError
  TrailupApiProvider ..> PersonalizacaoRlsError
```

| Método | Caminho |
|---|---|
| `solicitarPersonalizacao` | API (`POST /personalizar`) |
| `conversarComMentorPersonalizacao` | API (`POST /personalizar/chat`) |
| `obterSugestaoMaterial` | API (`GET /personalizar/sugestao/{aluno}/{tópico}`), porque o motor de sugestão roda lá |
| `listarPersonalizacoesPersistidasPerfil`, `listarSugestoesMaterialTurma`, `listarJobsPersistidosAluno` | Supabase, com RLS |
| `salvarProgressoPersonalizadoDiretoSupabase` | Supabase |
| `subscribePersonalizacoesPersistidasClasse` | Supabase Realtime |

## 7.5 Workers da API

Os workers seguem o mesmo molde: um laço longo no `lifespan` de `app/main.py`, uma função que processa um lote e um contrato com o banco para reivindicar e devolver. Isso permite testar a passada sem o laço.

```mermaid
classDiagram
  direction LR
  class Worker {
    <<molde>>
    +loop(app)
    +processar_uma_vez(app) dict
  }
  class PersonalizacaoJobs {
    personalizacao_jobs_loop
  }
  class AnaliseFila {
    analise_fila_loop
    processar_fila_analise_uma_vez
  }
  class AlteracaoProfessor {
    alteracao_professor_loop
    processar_alteracoes_uma_vez
  }
  class MissoesIa {
    missoes_ia_loop
    processar_pedidos_uma_vez
  }
  class DiagnosticoTopico {
    diagnostico_loop
    processar_diagnosticos_uma_vez
  }
  class RetencaoExterna {
    retencao_externa_loop
    processar_fila_uma_vez
  }
  class CheckpointRetention {
    checkpoint_retention_loop
    run_checkpoint_retention_once
  }
  class FuncoesDoBanco {
    <<Postgres>>
    fn_*_reivindicar()
    fn_*_registrar()
    fn_*_falhou()
  }
  Worker <|.. PersonalizacaoJobs
  Worker <|.. AnaliseFila
  Worker <|.. AlteracaoProfessor
  Worker <|.. MissoesIa
  Worker <|.. DiagnosticoTopico
  Worker <|.. RetencaoExterna
  Worker <|.. CheckpointRetention
  MissoesIa --> FuncoesDoBanco
  DiagnosticoTopico --> FuncoesDoBanco
```

`Worker` é um molde de código, não uma classe base: são funções de módulo com o mesmo formato. O diagrama mostra a convenção. O trio `reivindicar`, `registrar` e `falhou` existe em missões e diagnóstico; os outros workers têm contratos próprios.

## 7.6 Microservice de mídia

```mermaid
classDiagram
  direction LR
  class Server {
    <<server.ts>>
    POST /api/personalizar
    POST /api/v1/archive
  }
  class GeminiService {
    <<geminiService.ts>>
    texto por perfil
    áudio TTS
  }
  class ContentGenerationService {
    <<contentGenerationService.ts>>
    escolhe modelo e provedor
  }
  class MediaResume {
    <<mediaResume.ts>>
    planMediaResume()
    isMaterialDone()
    reusableMarkdownPartes()
  }
  class BrainHexPdfClient {
    <<brainHexPdfClient.ts>>
    renderAndUploadPresentationViaBrainHexPdf()
  }
  class BrainHexPDF {
    <<serviço externo>>
    POST /api/v1/render-and-store
  }
  Server --> GeminiService
  Server --> MediaResume
  Server --> BrainHexPdfClient
  GeminiService --> ContentGenerationService
  BrainHexPdfClient --> BrainHexPDF
```

`mediaResume` decide o que reaproveitar quando uma geração é retomada: arquivo que já existe não é gerado de novo. O microservice continua dono do merge em `conteudo_personalizado.materiais`, mesmo quando a apresentação vem do BrainHexPDF.
