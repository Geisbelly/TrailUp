import { BrainHexProfile } from "../constants/brainHex";

/**
 * --- UNIFIED INTERNAL MODEL (UIM) ---
 * Representação atômica de qualquer dado de entrada (texto, slide, transcrição).
 */
export interface SourceRef {
  page?: number;
  slide?: number;
  timestamp?: string;
  line?: number;
}

export interface InternalBlock {
  id: string;
  kind: "heading" | "paragraph" | "list_item" | "table" | "speaker_note" | "transcript_segment" | "image_caption";
  text: string;
  source_ref: SourceRef;
}

/**
 * --- COMUNICAÇÃO DE SAÍDA (TRANSMUTAÇÃO) ---
 * Estrutura final entregue ao frontend após o processamento alquímico.
 */
export interface SlideContent {
  title: string;
  topics: string[];
  explanation: string;
  visualDescription: string;
  characterQuote: string;
  characterAction: "explaining" | "celebrating" | "thinking" | "warning";
  // Opcionais: so preenchidos pelo fluxo de regeneracao individual de slide
  // (regenerateSlideContent em geminiService.ts), que ainda gera imagem via
  // Gemini pra aquele slide especifico. O schema de geracao em lote
  // (validateBlockBatchGeneration) nao pede mais esses campos ao modelo -
  // o BrainHexPDF gera o deck inteiro por fora e payload.slides nunca sai
  // do servidor (ver comentario em archiveMultiPartToSupabase, server.ts).
  imagePrompt?: string;
  iconPrompts?: string[];
  sourceIds: string[];
}

export interface ProcessedContent {
  markdown: string;
  audioScript: string;
  slides: SlideContent[];
  metadata: {
    blocks_processed: number;
    confidence: number;
    parser_used: string;
    generation_mode?: "legacy_aggregate" | "block_batches";
    content_blocks_total?: number;
    content_block_batches?: number;
    content_block_batch_size?: number;
    content_block_concurrency?: number;
    batch_block_ids?: string[][];
    content_generation_provider?: "gemini" | "openai" | "mixed";
    content_generation_models?: string[];
    content_generation_fallback_count?: number;
  };
  slideImages?: string[];
  audioBase64?: string | null;
  audioMp3Base64?: string | null;
  /** Imagens embutidas em arquivos .pptx/.docx do professor (ver
   * extractImageMediaFromFiles em geminiService.ts) - "imagem do conteudo
   * base", usada como fallback de imageAttachments quando o professor nao
   * anexou um arquivo de imagem avulso. */
  extractedMedia?: { data: string; mimeType: string; name: string }[];
  /** Capítulo bruto por bloco — só populado quando generation_mode é
   * "block_batches" (ver consolidateBlockBatchGenerations). Usado pelo
   * endpoint /api/v1/generate/block para persistir cada bloco separado,
   * em vez de só o markdown/audioScript já consolidado acima. */
  chapters?: { blockId: string; markdown: string; audioScript: string; slides: SlideContent[] }[];
}

export interface EnrichedContentBlock {
  id: string;
  ordem: number;
  tema: string;
  topico: string;
  objetivos: string[];
  conteudo_base: string;
  conteudo_aprofundado: string;
  conceitos_chave: string[];
  exemplos_contextos: string[];
  ponte_proximo_bloco: string;
  source_ids: string[];
}

/**
 * --- INTERFACES DE SERVIÇO (ENDPOINTS FUNCIONAIS) ---
 */
export interface TransmutationRequest {
  fileData: { 
    data: string; // Base64
    mimeType: string; 
    name: string 
  };
  profile: BrainHexProfile;
}

export interface AudioRequest {
  text: string;
  voice?: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' | 'Aoede' | 'Leda' | 'Schedar' | 'Achird' | 'Sulafat' | 'Orus';
}

export interface ImageRequest {
  prompt: string;
  retries?: number;
}

/**
 * Chaves customizadas por chamada, usadas pelos endpoints de regeneracao
 * (ver executeWithModelFallback em geminiService.ts) - alternativa as
 * variaveis de ambiente (GEMINI_API_KEY, OPENAI_API_KEY) quando o chamador
 * quer usar um conjunto de chaves proprio nessa chamada especifica.
 */
export interface ApiKeysConfig {
  geminiKeys?: string[];
  openAIKey?: string;
}
