import { normalizeBrainHexProfile, type BrainHexProfile } from "@/constants/brainHexProfiles";
import { supabase } from "@/database/supabase";
import { normalizeStoreItem, type StoreItem, type StoreProfileTheme, type StoreSection, type StoreSnapshot } from "@/services/loja/storeModel";
import { purchaseErrorMessage } from "@/services/loja/storeTheme";

export type { StoreItem, StoreProfileTheme, StoreSection, StoreSnapshot } from "@/services/loja/storeModel";
const fallbackTheme: StoreProfileTheme = { iconKey: "storefront-outline", themeKey: "default", chestKey: "treasure-chest", accentColor: null, version: 1 };
type RawItem = Omit<StoreItem, "state"> & { gate_met?: boolean; owned?: boolean; active?: boolean };

function requestId() { return String(Date.now()) + "-" + Math.random().toString(36).slice(2); }

export async function carregarLoja(alunoId: string, classeId: number, profileName?: string | null, section?: StoreSection): Promise<StoreSnapshot> {
  const [itemsResult, balanceResult, ownedResult] = await Promise.all([
    supabase.rpc("loja_catalogo", { p_classe_id: classeId }),
    supabase.rpc("loja_saldo"),
    supabase.from("loja_compras").select("item_codigo").eq("aluno_id", alunoId).neq("status", "estornada"),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (balanceResult.error) throw balanceResult.error;
  if (ownedResult.error) throw ownedResult.error;
  const owned = new Set((ownedResult.data ?? []).map((row) => String(row.item_codigo)));
  const rawItems = ((itemsResult.data ?? []) as unknown as Record<string, unknown>[]).map((item) => ({
    id: String(item.codigo ?? ""),
    slug: String(item.codigo ?? ""),
    section: "itens" as StoreSection,
    name: String(item.nome ?? ""),
    description: String(item.descricao ?? ""),
    assetKey: String(item.efeito ?? "gift-outline"),
    price: Number(item.preco ?? 0),
    currency: String(item.currency ?? "coins"),
    gate: null,
    metadata: { efeito: item.efeito, gratisRestantes: item.gratis_restantes },
    gate_met: item.gate_met as boolean | undefined,
    owned: owned.has(String(item.codigo)),
    active: item.disponivel as boolean | undefined,
  })) as RawItem[];
  const items = rawItems.filter((item) => !section || section === "itens" || section === "informacoes").map((item) => normalizeStoreItem(item));
  const theme = fallbackTheme;
  return { theme, balance: Number(balanceResult.data ?? 0), currency: "coins", items };
}

export async function comprarItem(itemCode: string, classeId: number) {
  const { data, error } = await supabase.rpc("loja_comprar", { p_item: itemCode, p_classe_id: classeId, p_idempotency_key: requestId() });
  if (error) throw error;
  const businessError = purchaseErrorMessage(data);
  if (businessError) throw new Error(businessError);
  return data as { ok: boolean; compra_id?: number; saldo?: number; preco?: number; erro?: string };
}

export function profileThemeKey(profileName?: string | null): BrainHexProfile | "default" {
  return normalizeBrainHexProfile(profileName) ?? "default";
}
