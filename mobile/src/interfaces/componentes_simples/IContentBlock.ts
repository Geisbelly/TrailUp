export type ContentDisplayMode = "pagina" | "rolagem";

export type ContentBlockType =
  | "texto"
  | "markdown"
  | "imagem"
  | "audio"
  | "video"
  | "cards"
  | "pdf"
  | "documento"
  | "apresentacao"
  | "apresentacao-slides"
  | "embed"
  | "youtube";

export type RichPresentationSlide = {
  title: string;
  points: string[];
  explanation: string | null;
  characterQuote: string | null;
  imagemReferencia: string | null;
  icones: string[];
};

export type ContentBlockPayload =
  | string
  | {
      url?: string | null;
      uri?: string | null;
      src?: string | null;
      html?: string | null;
      markdown?: string | null;
      texto?: string | null;
      legenda?: string | null;
      mimeType?: string | null;
      title?: string | null;
      defaultDisplayMode?: ContentDisplayMode;
      cards?: {
        id?: string | number;
        titulo?: string | null;
        frente?: string | null;
        verso?: string | null;
        descricao?: string | null;
        imagemUrl?: string | null;
      }[];
      slides?: RichPresentationSlide[];
      metadata?: unknown;
    };

export type ContentBlock = {
  id: string | number;
  tipo: ContentBlockType;
  payload: ContentBlockPayload;
};
