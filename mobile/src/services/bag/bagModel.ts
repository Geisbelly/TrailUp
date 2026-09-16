export type BagItemType = "resumo" | "anotacao" | "card" | "loja";
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
};

const STUDY_BAG_ITEM_TYPES = ["resumo", "anotacao", "card"] as const;

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
  const type = row.tipo === "card" || row.tipo === "anotacao" || row.tipo === "loja" ? row.tipo : "resumo";
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
  if (draft.type !== "resumo" && draft.type !== "anotacao" && draft.type !== "card") {
    return "Escolha um tipo de item.";
  }
  if (!String(draft.title ?? "").trim()) return "Informe um título.";
  if (draft.type === "card") {
    if (!String(draft.front ?? "").trim()) return "Preencha a frente do card.";
    if (!String(draft.back ?? "").trim()) return "Preencha o verso do card.";
  } else if (!String(draft.content ?? "").trim()) {
    return "Preencha o conteúdo do item.";
  }
  return null;
}

export function actionsForBagItem(item: Pick<BagItem, "editable" | "origin">): string[] {
  if (item.origin === "loja") return [];
  return item.editable && item.origin === "aluno"
    ? ["editar", "excluir", "compartilhar"]
    : ["compartilhar"];
}
