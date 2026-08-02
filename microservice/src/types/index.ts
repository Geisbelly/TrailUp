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
  imagePrompt: string;
  iconPrompts: string[];
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
