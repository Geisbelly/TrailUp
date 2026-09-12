import { normalizeBrainHexProfile, type BrainHexProfile } from "@/constants/brainHexProfiles";
import { supabase } from "@/database/supabase";
import { normalizeStoreItem, type StoreItem, type StoreProfileTheme, type StoreSection, type StoreSnapshot } from "@/services/loja/storeModel";

export type { StoreItem, StoreProfileTheme, StoreSection, StoreSnapshot } from "@/services/loja/storeModel";
const fallbackTheme: StoreProfileTheme = { iconKey: "storefront-outline", themeKey: "default", chestKey: "treasure-chest", accentColor: null, version: 1 };
type RawItem = Omit<StoreItem, "state"> & { gate_met?: boolean; owned?: boolean; active?: boolean };

function requestId() { return String(Date.now()) + "-" + Math.random().toString(36).slice(2); }

export async function carregarLoja(alunoId: string, profileName?: string | null, section?: StoreSection): Promise<StoreSnapshot> {
  const normalized = normalizeBrainHexProfile(profileName);
  const [profileResult, itemsResult, balanceResult, ownedResult] = await Promise.all([
    supabase.from("perfil").select("id").ilike("nome", normalized ?? profileName ?? "").maybeSingle(),
    supabase.rpc("trailup_loja_catalogo", { p_section: section ?? null }),
    supabase.from("loja_saldos").select("balance,currency").eq("aluno_id", alunoId).maybeSingle(),
    supabase.from("loja_posses").select("item_id").eq("aluno_id", alunoId),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (balanceResult.error) throw balanceResult.error;
  if (ownedResult.error) throw ownedResult.error;
  const owned = new Set((ownedResult.data ?? []).map((row) => Number(row.item_id)));
  const rawItems = ((itemsResult.data ?? []) as unknown as Record<string, unknown>[]).map((item) => ({
    id: Number(item.id),
    slug: String(item.slug ?? ""),
    section: item.section as StoreSection,
    name: String(item.name ?? ""),
    description: String(item.description ?? ""),
    assetKey: (item.asset_key as string | null) ?? null,
    price: Number(item.price ?? 0),
    currency: String(item.currency ?? "coins"),
    gate: (item.gate as Record<string, unknown> | null) ?? null,
    metadata: (item.metadata as Record<string, unknown>) ?? {},
    gate_met: item.gate_met as boolean | undefined,
    owned: item.owned as boolean | undefined,
    active: item.active as boolean | undefined,
  })) as RawItem[];
  const items = rawItems.filter((item) => !section || item.section === section).map((item) => normalizeStoreItem({ ...item, owned: owned.has(item.id) }));
  let theme = fallbackTheme;
  if (profileResult.data?.id) {
    const themeResult = await supabase.from("loja_perfis").select("icon_key,theme_key,chest_key,accent_color,version").eq("perfil_id", profileResult.data.id).maybeSingle();
    if (themeResult.error) throw themeResult.error;
    if (themeResult.data) theme = { iconKey: themeResult.data.icon_key, themeKey: themeResult.data.theme_key, chestKey: themeResult.data.chest_key, accentColor: themeResult.data.accent_color, version: themeResult.data.version };
  }
  return { theme, balance: Number(balanceResult.data?.balance ?? 0), currency: balanceResult.data?.currency ?? "coins", items };
}

export async function comprarItem(itemId: number) {
  const { data, error } = await supabase.rpc("trailup_comprar_loja_item", { p_item_id: itemId, p_request_id: requestId() });
  if (error) throw error;
  return data as { status: string; item_id: number; balance?: number; currency?: string };
}

export function profileThemeKey(profileName?: string | null): BrainHexProfile | "default" {
  return normalizeBrainHexProfile(profileName) ?? "default";
}
