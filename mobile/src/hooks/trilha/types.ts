import type { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";

export type StudyBlockSnapshot = {
  key: string;
  topicoId: number;
  conteudoId: number | null;
  atividadeId: number | null;
  isPersonalizedLocal: boolean;
  itemKey: string | null;
  itemTitle: string | null;
  itemKind: "content" | "activity" | "cards";
  startedAtMs: number;
};

export type StudyBlockSignature = Omit<StudyBlockSnapshot, "startedAtMs"> & {
  signature: string;
};

export type ProgressoItemPersonalizado = {
  topicoId: number;
  itemKey: string;
  itemKind: "content" | "activity" | "cards";
  itemTitle: string;
  status: "em_andamento" | "concluido";
  percentualConcluido: number;
  tempoGastoMin: number;
  metadata?: Record<string, unknown>;
};

export type StudySessionParams = {
  classeId: number;
  topicoId: number;
  topicoInicialId: number;
  screenName: string;
  routeName: string;
};

export type { ContentBlock };
