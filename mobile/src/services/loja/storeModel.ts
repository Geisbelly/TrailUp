export type StoreSection = "informacoes" | "itens" | "combos" | "bonus" | "presentes";
/** `limit`: o aluno já comprou o máximo da turma ou o estoque acabou. Ter unidades na Bag não bloqueia comprar mais. */
export type StoreItemState = "available" | "blocked" | "limit" | "unavailable";
export type StoreProfileTheme = { iconKey: string; themeKey: string; chestKey: string; accentColor: string | null; version: number };
export type StoreItem = {
  id: string; slug: string; name: string; description: string;
  assetKey: string | null; price: number; currency: string; gate: Record<string, unknown> | null;
  section: StoreSection;
  state: StoreItemState; metadata: Record<string, unknown>;
};
export type StoreSnapshot = { theme: StoreProfileTheme; balance: number; currency: string; items: StoreItem[] };
type RawStoreItem = Omit<StoreItem, "state"> & { gate_met?: boolean; active?: boolean };

/** Mesmo teto do banco (`loja_comprar`): até 20 unidades por pedido. */
export const MAX_POR_PEDIDO = 20;

function contagem(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

/** Quantas unidades ainda cabem num pedido: limite de compras da turma, estoque e o teto por pedido. */
export function maxQuantidade(item: Pick<StoreItem, "metadata">): number {
  const tetos = [contagem(item.metadata?.comprasRestantes), contagem(item.metadata?.estoqueRestante)].filter(
    (n): n is number => n !== null,
  );
  return Math.min(MAX_POR_PEDIDO, ...tetos);
}

export function emPosse(item: Pick<StoreItem, "metadata">): number {
  return contagem(item.metadata?.emPosse) ?? 0;
}

export function normalizeStoreItem(item: RawStoreItem): StoreItem {
  const state: StoreItemState =
    item.active === false ? "unavailable"
    : item.gate && item.gate_met !== true ? "blocked"
    : maxQuantidade(item) <= 0 ? "limit"
    : "available";
  return { ...item, state };
}
