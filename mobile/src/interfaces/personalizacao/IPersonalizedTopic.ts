import {
  ContentBlock,
  ContentBlockType,
} from "@/interfaces/componentes_simples/IContentBlock";
import { IAPersonalizationPatch } from "@/interfaces/personalizacao/IAContracts";

export type PersonalizedHeroFormat =
  | "pdf"
  | "documento"
  | "apresentacao"
  | "imagem"
  | "audio"
  | "video"
  | "cards"
  | "quiz"
  | "markdown"
  | "texto"
  | null;

export type PersonalizedUiConfig = {
  tema?: "dark" | "light" | "focus" | "energetic" | null;
  ritmo_conteudo?: "lento" | "normal" | "acelerado" | null;
  complexidade_visual?: "minima" | "normal" | "rica" | null;
  elementos_gamificacao?: "ocultos" | "sutis" | "destacados" | null;
  tom_feedbacks?: "suporte" | "neutro" | "desafiador" | null;
  precisa_texto?: boolean;
  tipo_modal?: "suporte" | "conquista" | "dica" | "desafio" | null;
  contexto_texto?: Record<string, unknown> | null;
};

export type PersonalizedStudyCard = {
  id: string;
  titulo: string | null;
  frente: string;
  verso: string;
  descricao?: string | null;
  imagemUrl?: string | null;
};

export type PersonalizedQuestionType =
  | "quiz"
  | "true_false"
  | "fill_blank"
  | "essay"
  | string;

export type PersonalizedQuestion = {
  id: number;
  enunciado: string;
  tipo: PersonalizedQuestionType | null;
  alternativas: string[] | null;
  resposta_correta: string | null;
  explicacao?: string | null;
  midia_url?: string | null;
  anexos?: unknown[] | null;
  arquivos?: unknown[] | null;
  midias?: unknown[] | null;
  pdf_url?: string | null;
  documento_url?: string | null;
  apresentacao_url?: string | null;
  audio_url?: string | null;
  video_url?: string | null;
  imagem_url?: string | null;
  isPersonalizedLocal?: boolean;
};

export type PersonalizedActivity = {
  id: number;
  titulo: string;
  descricao: string | null;
  conteudo?: string | null;
  tipo: PersonalizedQuestionType | null;
  status: string | null;
  pontuacao_maxima: number | null;
  data_entrega: string | null;
  topico_id: number | null;
  questoes: PersonalizedQuestion[];
  conteudo_ids?: number[];
  anexos?: unknown[] | null;
  arquivos?: unknown[] | null;
  midias?: unknown[] | null;
  pdf_url?: string | null;
  documento_url?: string | null;
  apresentacao_url?: string | null;
  audio_url?: string | null;
  video_url?: string | null;
  imagem_url?: string | null;
  isPersonalizedLocal?: boolean;
  personalizationKey?: string;
};

export type PersonalizedMaterialSummary = {
  id: string;
  tipo: ContentBlockType | "cards" | "quiz";
  title?: string | null;
  description?: string | null;
  hasArquivoUrl: boolean;
  source: "personalizado" | "fallback";
};

export type PersonalizedNodeHint = {
  topicoId: number;
  hasPersonalizedContent: boolean;
  heroFormat: PersonalizedHeroFormat;
  recommended: boolean;
  isFocus: boolean;
  summary?: string | null;
  title?: string | null;
  formatos: string[];
};

export type PersonalizedPlanMeta = {
  recordId?: number | null;
  cycleId?: string | null;
  heroFormat: PersonalizedHeroFormat;
  presentationMode?: "atividade_primeiro" | "conteudo_primeiro" | "atividade_fim" | "misto";
  formatosGerados: string[];
  justification?: string | null;
  level?: string | null;
  tone?: string | null;
  style?: string | null;
  source: "cache" | "remote" | "fallback";
  uiConfig: PersonalizedUiConfig;
  refreshPolicy: {
    mode: "once" | "analysis";
    triggerActions: string[];
  };
};

export type PersonalizedTopicStep = {
  item_key: string;
  ordem: number;
  kind: "content" | "activity";
  title: string;
  description?: string | null;
  required: boolean;
  pontuacao_maxima?: number | null;
  blocks?: ContentBlock[];
  activity?: PersonalizedActivity | null;
  metadata?: Record<string, unknown> | null;
};

export type PersonalizedTopicPayload = {
  topicoId: number;
  classeId: number;
  heroFormat: PersonalizedHeroFormat;
  steps: PersonalizedTopicStep[];
  primaryBlocks: ContentBlock[];
  primaryActivities: PersonalizedActivity[];
  studyCards: PersonalizedStudyCard[];
  fallbackBlocks: ContentBlock[];
  fallbackActivities: any[];
  materialSummaries: PersonalizedMaterialSummary[];
  planMeta: PersonalizedPlanMeta;
  nodeHint: PersonalizedNodeHint;
  aiPatch?: IAPersonalizationPatch | null;
};
