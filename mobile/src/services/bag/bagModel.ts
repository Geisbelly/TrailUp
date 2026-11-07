export type BagItemType = "resumo" | "anotacao" | "card" | "material" | "loja";
export type BagItemOrigin = "aluno" | "plataforma" | "loja";
export type BagDraftType = Exclude<BagItemType, "loja">;

export type BagItem = {
  id: string;
  sourceId: number;
  origin: BagItemOrigin;
  editable: boolean;
  type: BagItemType;
  title: string;
  content: string | null;
  front: string | null;
  back: string | null;
  classId: number | null;
  topicId: number | null;
  contentId: number | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BagFilter = {
  origin?: BagItemOrigin | null;
  type?: BagItemType | null;
  classId?: number | null;
  topicId?: number | null;
  search?: string | null;
};

export type BagDraft = {
  type: BagDraftType;
  title: string;
  content?: string | null;
  front?: string | null;
  back?: string | null;
  classId?: number | null;
  topicId?: number | null;
  contentId?: number | null;
  metadata?: Record<string, unknown>;
};

/** Formatos de material que a Bag guarda como atalho (o CHECK da `20261106_05` aceita os mesmos). */
export const BAG_MATERIAL_FORMATS = ["audio", "apresentacao", "markdown", "pdf", "video", "documento", "imagem"] as const;
export type BagMaterialFormat = (typeof BAG_MATERIAL_FORMATS)[number];

export function isBagMaterialFormat(value: unknown): value is BagMaterialFormat {
  return typeof value === "string" && (BAG_MATERIAL_FORMATS as readonly string[]).includes(value);
}

/**
 * O material salvo é um ATALHO: formato, o bloco e o tópico. Não guarda URL — o link é assinado
 * e expira, e abrir o item leva o aluno ao tópico, onde o app assina de novo.
 */
export function materialDraft(input: {
  formato: BagMaterialFormat;
  bloco: string;
  titulo: string;
  classId: number;
  topicId: number;
  contentId?: number | null;
}): BagDraft {
  return {
    type: "material",
    title: input.titulo.trim().slice(0, 160) || "Material",
    content: null,
    classId: input.classId,
    topicId: input.topicId,
    contentId: normalizeBagContentId(input.contentId),
    metadata: { formato: input.formato, bloco: input.bloco },
  };
}

/** Tipo do bloco na tela do tópico → formato que a Bag guarda. Cards já chegam à Bag como "Gerados". */
export function bagFormatForBlockType(tipo: unknown): BagMaterialFormat | null {
  switch (String(tipo ?? "")) {
    case "audio": return "audio";
    case "apresentacao": case "apresentacao-slides": case "embed": return "apresentacao";
    case "markdown": case "texto": return "markdown";
    case "pdf": return "pdf";
    case "video": case "youtube": return "video";
    case "documento": return "documento";
    case "imagem": return "imagem";
    default: return null;
  }
}

export function bagMaterialFormat(item: Pick<BagItem, "type" | "metadata">): BagMaterialFormat | null {
  if (item.type !== "material") return null;
  return isBagMaterialFormat(item.metadata.formato) ? item.metadata.formato : null;
}

const STUDY_BAG_ITEM_TYPES = ["resumo", "anotacao", "card", "material"] as const;

export function bagTypeFilterOptions(origin: BagItemOrigin | null): BagItemType[] {
  return origin === "loja" ? [] : [...STUDY_BAG_ITEM_TYPES];
}

export function shouldShowBagTypeFilters(origin: BagItemOrigin | null): boolean {
  return origin !== "loja";
}

export function isBagClassReady(classId?: number | null): boolean {
  return Number.isFinite(Number(classId)) && Number(classId) > 0;
}

/** IDs negativos identificam blocos personalizados apenas no estado do app. */
export function normalizeBagContentId(contentId?: unknown): number | null {
  const value = Number(contentId);
  return Number.isInteger(value) && value > 0 ? value : null;
}

type BagItemRow = Record<string, unknown>;

function nullableString(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result ? result : null;
}

function nullableNumber(value: unknown): number | null {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function normalizeBagItem(row: BagItemRow): BagItem {
  const origin = row.origem === "plataforma" || row.origem === "loja" ? row.origem : "aluno";
  const type = row.tipo === "card" || row.tipo === "anotacao" || row.tipo === "material" || row.tipo === "loja" ? row.tipo : "resumo";
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  return {
    id: String(row.id ?? `${origin}:${row.source_id ?? ""}`),
    sourceId: Number(row.source_id ?? row.id ?? 0),
    origin,
    editable: origin === "aluno" && row.editavel !== false,
    type,
    title: String(row.titulo ?? "Item de estudo"),
    content: nullableString(row.conteudo),
    front: nullableString(row.frente),
    back: nullableString(row.verso),
    classId: nullableNumber(row.classe_id),
    topicId: nullableNumber(row.topico_id),
    contentId: nullableNumber(row.conteudo_id),
    metadata,
    createdAt: nullableString(row.criado_em),
    updatedAt: nullableString(row.atualizado_em),
  };
}

export function validateBagDraft(draft: Partial<BagDraft>): string | null {
  if (draft.type !== "resumo" && draft.type !== "anotacao" && draft.type !== "card" && draft.type !== "material") {
    return "Escolha um tipo de item.";
  }
  if (!String(draft.title ?? "").trim()) return "Informe um título.";
  if (draft.type === "material") {
    if (!isBagMaterialFormat(draft.metadata?.formato)) return "Material sem formato.";
    if (!draft.topicId) return "Material sem tópico.";
    return null;
  }
  if (draft.type === "card") {
    if (!String(draft.front ?? "").trim()) return "Preencha a frente do card.";
    if (!String(draft.back ?? "").trim()) return "Preencha o verso do card.";
  } else if (!String(draft.content ?? "").trim()) {
    return "Preencha o conteúdo do item.";
  }
  return null;
}

export function actionsForBagItem(item: Pick<BagItem, "editable" | "origin"> & { type?: BagItemType }): string[] {
  if (item.origin === "loja") return [];
  // Material é atalho: abre no tópico e sai da Bag; não tem texto para editar nem compartilhar.
  if (item.type === "material") return item.editable ? ["abrir", "excluir"] : ["abrir"];
  return item.editable && item.origin === "aluno"
    ? ["editar", "excluir", "compartilhar"]
    : ["compartilhar"];
}
