import { supabase } from "@/database/supabase";

import {
  normalizeBagItem,
  type BagDraft,
  type BagFilter,
  type BagItem,
} from "./bagModel";

function rpcParams(filter: BagFilter = {}) {
  return {
    p_origem: filter.origin ?? null,
    p_tipo: filter.type ?? null,
    p_classe_id: filter.classId ?? null,
    p_topico_id: filter.topicId ?? null,
    p_busca: filter.search?.trim() || null,
  };
}

function parseList(payload: unknown): BagItem[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((row) => normalizeBagItem(row as Record<string, unknown>));
}

export async function listBagItems(filter: BagFilter = {}): Promise<BagItem[]> {
  const { data, error } = await supabase.rpc("bag_listar", rpcParams(filter));
  if (error) throw new Error(error.message || "Não foi possível carregar a Bag.");
  return parseList(data);
}

function draftParams(draft: BagDraft) {
  return {
    p_tipo: draft.type,
    p_titulo: draft.title.trim(),
    p_conteudo: draft.content?.trim() || null,
    p_frente: draft.front?.trim() || null,
    p_verso: draft.back?.trim() || null,
    p_classe_id: draft.classId ?? null,
    p_topico_id: draft.topicId ?? null,
    p_conteudo_id: draft.contentId ?? null,
    p_metadata: {},
  };
}

export async function createBagItem(draft: BagDraft): Promise<string> {
  const { data, error } = await supabase.rpc("bag_criar", draftParams(draft));
  if (error) throw new Error(error.message || "Não foi possível salvar o item.");
  return String((data as { id?: unknown } | null)?.id ?? "");
}

export async function updateBagItem(itemId: number, draft: BagDraft): Promise<string> {
  const { data, error } = await supabase.rpc("bag_atualizar", {
    p_id: itemId,
    ...draftParams(draft),
  });
  if (error) throw new Error(error.message || "Não foi possível atualizar o item.");
  return String((data as { id?: unknown } | null)?.id ?? `item:${itemId}`);
}

export async function deleteBagItem(itemId: number): Promise<void> {
  const { error } = await supabase.rpc("bag_excluir", { p_id: itemId });
  if (error) throw new Error(error.message || "Não foi possível excluir o item.");
}
