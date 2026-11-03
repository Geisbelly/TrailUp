import { supabase } from "@/integrations/supabase/client";
import { decidirMissao } from "../missoes/missoesApi";
import {
  JANELA_DE_APROVACAO_DIAS,
  lerLimites,
  type HistoricoDeMissaoIa,
  type LimitesDeMissoesIa,
  type MissaoSugerida,
  type PedidoDeMissoesIa,
} from "./missoesIa";

// As tabelas e RPCs novas ainda não estão nos tipos gerados: o `as never` é o mesmo padrão de `notasApi`
// e `missoesApi`. Tudo aqui é direto no Supabase (RLS e funções do banco); nada passa pela API, então
// pedir, ler e decidir funcionam com ela fora do ar. Só propor é da API.

const COLUNAS_DA_MISSAO = "id, classe_id, titulo, descricao, criterio, base_ia, aprovacao, motivo_recusa, criado_em, atualizado_em";
const COLUNAS_DO_PEDIDO = "id, classe_id, topico_id, quantidade, status, tentativas, gerados, ultimo_erro, created_at, finalizado_em";

type ErroDoBanco = { code?: string; message?: string };

export async function buscarLimites(): Promise<{ limites: LimitesDeMissoesIa | null; erro: ErroDoBanco | null }> {
  const { data, error } = await supabase.rpc("missao_ia_limites" as never);
  return { limites: error ? null : lerLimites(data), erro: error };
}

export async function pedirMissoes(args: {
  classeId: number;
  topicoId: number | null;
  quantidade: number;
}): Promise<{ pedidoId: string | null; erro: ErroDoBanco | null }> {
  const { data, error } = await supabase.rpc(
    "missao_ia_pedir" as never,
    { p_classe_id: args.classeId, p_topico_id: args.topicoId, p_quantidade: args.quantidade } as never,
  );
  return { pedidoId: error ? null : String(data), erro: error };
}

export async function listarPedidos(classIds: number[]): Promise<{ pedidos: PedidoDeMissoesIa[]; erro: ErroDoBanco | null }> {
  if (classIds.length === 0) return { pedidos: [], erro: null };
  const { data, error } = await supabase
    .from("missoes_ia_pedidos" as never)
    .select(COLUNAS_DO_PEDIDO)
    .in("classe_id", classIds)
    .order("created_at", { ascending: false })
    .limit(20);
  return { pedidos: error ? [] : ((data ?? []) as unknown as PedidoDeMissoesIa[]), erro: error };
}

/** As da IA que esperam decisão, de qualquer pedido: uma pendente perdida é uma missão que ninguém vê. */
export async function listarPendentes(classIds: number[]): Promise<{ missoes: MissaoSugerida[]; erro: ErroDoBanco | null }> {
  if (classIds.length === 0) return { missoes: [], erro: null };
  const { data, error } = await supabase
    .from("missoes" as never)
    .select(COLUNAS_DA_MISSAO)
    .in("classe_id", classIds)
    .eq("origem", "ia")
    .eq("aprovacao", "pendente")
    .order("criado_em", { ascending: false })
    .limit(100);
  return { missoes: error ? [] : ((data ?? []) as unknown as MissaoSugerida[]), erro: error };
}

/** Todas as missões decididas, ordenadas pela data da decisão, para o histórico e a taxa. */
export async function listarDecididas(classIds: number[]): Promise<{ missoes: MissaoSugerida[]; erro: ErroDoBanco | null }> {
  if (classIds.length === 0) return { missoes: [], erro: null };
  const desde = new Date(Date.now() - JANELA_DE_APROVACAO_DIAS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("missoes" as never)
    .select(COLUNAS_DA_MISSAO)
    .in("classe_id", classIds)
    .eq("origem", "ia")
    .in("aprovacao", ["aprovada", "recusada"])
    .gte("atualizado_em", desde)
    .order("atualizado_em", { ascending: false });
  return { missoes: error ? [] : ((data ?? []) as unknown as MissaoSugerida[]), erro: error };
}

/** Decisões registradas no histórico append-only das sugestões de IA. */
export async function listarHistorico(classIds: number[]): Promise<{ itens: HistoricoDeMissaoIa[]; erro: ErroDoBanco | null }> {
  if (classIds.length === 0) return { itens: [], erro: null };
  const { data, error } = await supabase
    .from("missoes_ia_log" as never)
    .select("id, missao_id, classe_id, evento, motivo, created_at")
    .in("classe_id", classIds)
    .in("evento", ["aprovada", "recusada"])
    .order("created_at", { ascending: false });
  if (error) return { itens: [], erro: error };

  const linhas = (data ?? []) as unknown as Omit<HistoricoDeMissaoIa, "missao">[];
  const missaoIds = [...new Set(linhas.map((l) => l.missao_id).filter((id): id is number => id !== null))];
  const { data: missoes, error: erroMissoes } = missaoIds.length
    ? await supabase.from("missoes" as never).select(COLUNAS_DA_MISSAO).in("id", missaoIds)
    : { data: [], error: null };
  if (erroMissoes) return { itens: [], erro: erroMissoes };
  const porId = new Map(((missoes ?? []) as unknown as MissaoSugerida[]).map((m) => [m.id, m]));
  return { itens: linhas.map((l) => ({ ...l, missao: l.missao_id === null ? null : (porId.get(l.missao_id) ?? null) })), erro: null };
}

/** Aprovar e recusar são UPDATE direto: não dependem da API estar acordada. */
export const decidirSugestao = decidirMissao;

export async function contarPendentesDeMissao(): Promise<number> {
  const { count, error } = await supabase
    .from("missoes" as never)
    .select("id", { count: "exact", head: true })
    .eq("origem", "ia")
    .eq("aprovacao", "pendente");
  return error ? 0 : (count ?? 0);
}

export async function listarTopicosDaTurma(classeId: number): Promise<{ id: number; nome: string }[]> {
  const { data, error } = await supabase.from("topicos").select("id, nome").eq("classe_id", classeId).order("ordem").order("id");
  return error ? [] : ((data ?? []) as { id: number; nome: string }[]);
}
