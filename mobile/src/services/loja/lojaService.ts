import { normalizeBrainHexProfile, type BrainHexProfile } from "@/constants/brainHexProfiles";
import { supabase } from "@/database/supabase";
import { normalizeStoreItem, type StoreItem, type StoreProfileTheme, type StoreSection, type StoreSnapshot } from "@/services/loja/storeModel";
import { limitesDaTurma, montarExtrato, type LinhaRazao } from "@/services/loja/extratoModel";
import { avisarEfeitoNaAtividade, lerInventario, lerPermissao, lerRespostaDeUso, type LinhaInventario, type PermissaoDeUso, type RespostaDeUso } from "@/services/loja/usoItem";
import { ACOES_QUE_RENDEM, resolverGanhoMoedas } from "@/services/loja/ganhoMoedasModel";
import { purchaseErrorMessage } from "@/services/loja/storeTheme";

export type { StoreItem, StoreProfileTheme, StoreSection, StoreSnapshot } from "@/services/loja/storeModel";
const fallbackTheme: StoreProfileTheme = { iconKey: "storefront-outline", themeKey: "default", chestKey: "treasure-chest", accentColor: null, version: 1 };
type RawItem = Omit<StoreItem, "state"> & { gate_met?: boolean; active?: boolean };

function requestId() { return String(Date.now()) + "-" + Math.random().toString(36).slice(2); }

export async function carregarLoja(alunoId: string, classeId: number, profileName?: string | null, section?: StoreSection): Promise<StoreSnapshot> {
  const [itemsResult, balanceResult] = await Promise.all([
    supabase.rpc("loja_catalogo", { p_classe_id: classeId }),
    supabase.rpc("loja_saldo"),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (balanceResult.error) throw balanceResult.error;
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
    metadata: {
      efeito: item.efeito,
      gratisRestantes: item.gratis_restantes,
      emPosse: item.em_posse ?? 0,
      comprasRestantes: item.compras_restantes ?? null,
      estoqueRestante: item.estoque_restante ?? null,
      precoFator: item.preco_fator ?? 1,
    },
    gate_met: item.gate_met as boolean | undefined,
    active: item.disponivel as boolean | undefined,
  })) as RawItem[];
  const items = rawItems.filter((item) => !section || section === "itens" || section === "informacoes").map((item) => normalizeStoreItem(item));
  const theme = fallbackTheme;
  return { theme, balance: Number(balanceResult.data ?? 0), currency: "coins", items };
}

/** Compra `quantidade` unidades num pedido só: tudo ou nada, uma chave para o pedido inteiro. */
export async function comprarItem(itemCode: string, classeId: number, quantidade = 1) {
  const { data, error } = await supabase.rpc("loja_comprar", {
    p_item: itemCode,
    p_classe_id: classeId,
    p_idempotency_key: requestId(),
    p_quantidade: quantidade,
  });
  if (error) throw error;
  const businessError = purchaseErrorMessage(data);
  if (businessError) throw new Error(businessError);
  return data as { ok: boolean; compra_id?: number; compra_ids?: number[]; quantidade?: number; saldo?: number; preco?: number; erro?: string };
}

/** Unidades do aluno na turma, por item: ativas, usadas e estornadas. */
export async function carregarInventario(classeId: number): Promise<LinhaInventario[]> {
  const { data, error } = await supabase.rpc("loja_inventario", { p_classe_id: classeId });
  if (error) throw error;
  return lerInventario(data);
}

/** Quantos usos deste item ainda cabem nesta atividade/questão, e o limite que segura quando não cabe. */
export async function usosPermitidos(classeId: number, item: string, alvoTipo: "atividade" | "questao", alvoId: number): Promise<PermissaoDeUso> {
  const { data, error } = await supabase.rpc("loja_usos_permitidos", {
    p_classe_id: classeId,
    p_item: item,
    p_alvo_tipo: alvoTipo,
    p_alvo_id: alvoId,
  });
  if (error) return { ativos: 0, restantes: 0, bloqueio: "resposta_invalida", limite: null, usados: 0 };
  return lerPermissao(data);
}

/** Gasta UMA unidade (a mais antiga) do item. O banco escolhe a unidade e confere os limites. */
export async function usarItem(classeId: number, item: string, alvoTipo: "atividade" | "questao", alvoId: number, parametro: Record<string, unknown> | null = null): Promise<RespostaDeUso> {
  const { data, error } = await supabase.rpc("loja_usar_item", {
    p_item: item,
    p_classe_id: classeId,
    p_alvo_tipo: alvoTipo,
    p_alvo_id: alvoId,
    p_idempotency_key: requestId(),
    p_parametro: parametro,
  });
  if (error) return { ok: false, erro: "resposta_invalida" };
  const resposta = lerRespostaDeUso(data);
  if (resposta.ok) avisarEfeitoNaAtividade();
  return resposta;
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

/**
 * Gasta a segunda chance mais antiga. Com `questaoId`, mira a questão (o limite por questão vale);
 * sem, o banco escolhe a questão elegível da atividade. Sem unidade, não reabre a questão.
 */
export async function gastarSegundaChance(classeId: number, atividadeId: number, questaoId?: number): Promise<RespostaDeUso> {
  const resposta = questaoId
    ? await usarItem(classeId, "segunda_chance", "questao", questaoId)
    : await usarItem(classeId, "segunda_chance", "atividade", atividadeId);
  return resposta.erro === "sem_unidade" ? { ...resposta, erro: "sem_token" } : resposta;
}

/** Tetos da Loja definidos pelo professor para a turma (`loja_config_classe`). */
export async function carregarLimitesTurma(classeId: number) {
  const { data, error } = await supabase
    .from("loja_config_classe")
    .select("prazo_max_dias_total,prazo_max_por_ativ,retry_max_por_topico,prazo_extensao_min_dias,prazo_extensao_max_dias,tempo_extra_min_minutos,tempo_extra_max_minutos,tempo_max_por_ativ")
    .eq("classe_id", classeId)
    .maybeSingle();
  if (error) throw error;
  return limitesDaTurma(data);
}
