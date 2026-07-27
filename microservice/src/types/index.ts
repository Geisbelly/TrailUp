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
