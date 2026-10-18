import { normalizeBrainHexProfile, type BrainHexProfile } from "@/constants/brainHexProfiles";
import { supabase } from "@/database/supabase";
import { normalizeStoreItem, type StoreItem, type StoreProfileTheme, type StoreSection, type StoreSnapshot } from "@/services/loja/storeModel";
import { limitesDaTurma, montarExtrato, type LinhaRazao } from "@/services/loja/extratoModel";
import { ACOES_QUE_RENDEM, resolverGanhoMoedas } from "@/services/loja/ganhoMoedasModel";
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

/** Quanto cada ação rende em moedas nesta turma (global, com a sobreposição da turma). */
export async function carregarGanhoMoedas(classeId: number) {
  const tipos = ACOES_QUE_RENDEM.map((a) => a.tipo);
  const [globais, daTurma] = await Promise.all([
    supabase.from("eventos_pontuacao").select("tipo,moedas").in("tipo", tipos),
    supabase.from("eventos_pontuacao_classe").select("tipo,moedas").eq("classe_id", classeId).in("tipo", tipos),
  ]);
  if (globais.error) throw globais.error;
  if (daTurma.error) throw daTurma.error;
  return resolverGanhoMoedas(globais.data ?? [], daTurma.data ?? []);
}

/**
 * Últimas linhas do razão de moedas do aluno (a policy só devolve as dele).
 * `nomes`: código do item → nome, do catálogo já carregado.
 */
export async function carregarExtrato(alunoId: string, nomes: ReadonlyMap<string, string>, limite = 10) {
  const razao = await supabase
    .from("moedas_ledger")
    .select("id,delta,motivo,evento_tipo,compra_id,criado_em")
    .eq("aluno_id", alunoId)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (razao.error) throw razao.error;
  const linhas = (razao.data ?? []) as LinhaRazao[];
  const compraIds = linhas.map((l) => l.compra_id).filter((id): id is number => id != null);
  const itemDaCompra = new Map<number, string>();
  if (compraIds.length) {
    const compras = await supabase.from("loja_compras").select("id,item_codigo").in("id", compraIds);
    if (!compras.error)
      for (const c of compras.data ?? []) itemDaCompra.set(Number(c.id), nomes.get(String(c.item_codigo)) ?? String(c.item_codigo));
  }
  return montarExtrato(linhas, itemDaCompra, new Date());
}

/** Tetos da Loja definidos pelo professor para a turma (`loja_config_classe`). */
export async function carregarLimitesTurma(classeId: number) {
  const { data, error } = await supabase
    .from("loja_config_classe")
    .select("prazo_max_dias_total,prazo_max_por_ativ,retry_max_por_topico")
    .eq("classe_id", classeId)
    .maybeSingle();
  if (error) throw error;
  return limitesDaTurma(data);
}
