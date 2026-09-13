export type BagItemType = "resumo" | "anotacao" | "card";
export type BagItemOrigin = "aluno" | "plataforma";

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
  type: BagItemType;
  title: string;
  content?: string | null;
  front?: string | null;
  back?: string | null;
  classId?: number | null;
  topicId?: number | null;
  contentId?: number | null;
};

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
  const origin = row.origem === "plataforma" ? "plataforma" : "aluno";
  const type = row.tipo === "card" || row.tipo === "anotacao" ? row.tipo : "resumo";
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
  return item.editable && item.origin === "aluno"
    ? ["editar", "excluir", "compartilhar"]
    : ["compartilhar"];
}
