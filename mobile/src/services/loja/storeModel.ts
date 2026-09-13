export type StoreSection = "informacoes" | "itens" | "combos" | "bonus" | "presentes";
export type StoreItemState = "available" | "blocked" | "owned" | "unavailable";
export type StoreProfileTheme = { iconKey: string; themeKey: string; chestKey: string; accentColor: string | null; version: number };
export type StoreItem = {
  id: string; slug: string; name: string; description: string;
  assetKey: string | null; price: number; currency: string; gate: Record<string, unknown> | null;
  section: StoreSection;
  state: StoreItemState; metadata: Record<string, unknown>;
};
export type StoreSnapshot = { theme: StoreProfileTheme; balance: number; currency: string; items: StoreItem[] };
type RawStoreItem = Omit<StoreItem, "state"> & { gate_met?: boolean; owned?: boolean; active?: boolean };

export function normalizeStoreItem(item: RawStoreItem): StoreItem {
  const state: StoreItemState = item.active === false ? "unavailable" : item.owned ? "owned" : item.gate && item.gate_met !== true ? "blocked" : "available";
  return { ...item, state };
}
