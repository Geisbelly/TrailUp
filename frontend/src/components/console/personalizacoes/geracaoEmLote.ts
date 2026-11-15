import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import { supabase } from "@/integrations/supabase/client";
import { PERFIS_EM_ORDEM } from "../dashboard/perfilCores";

/**
 * Geração personalizada em lote: a turma inteira, tópicos ou conteúdos escolhidos, × um, vários
 * ou todos os perfis BrainHex.
 *
 * Enfileirar é banco (regra de fronteira do CLAUDE.md): a RPC `personalizacao_gerar_em_lote`
 * (migration 20261115_03) cria o mesmo job que a API criava no "Gerar tudo", deduplica pedido
 * igual e retoma job que parou com falha. O worker da API é quem gera. O progresso também é lido
 * direto de `personalizacao_jobs` (RLS `personalizacao_jobs_professor_sel`): com a API fora do
 * ar, o pedido entra e o painel continua mostrando onde está.
 */

export type TopicoDoLote = { id: number; nome: string | null };
export type ConteudoDoLote = { id: number; topico_id: number; titulo: string | null };

/** O que vai para a RPC. Os dois vazios = a turma inteira. */
export type PedidoDoLote = { topicoIds: number[]; conteudoIds: number[] };

/** Unidade de geração: um conteúdo, ou o tópico sem conteúdo nenhum (a base sai do tópico). */
export type UnidadeDoLote = { topicoId: number; conteudoId: number | null };

export const TODOS_OS_PERFIS: readonly BrainHexProfileKey[] = PERFIS_EM_ORDEM;

/** As unidades de geração da turma inteira, na ordem dos tópicos. */
export function unidadesDaTurma(topicos: TopicoDoLote[], conteudos: ConteudoDoLote[]): UnidadeDoLote[] {
  return topicos.flatMap((t) => {
    const doTopico = conteudos.filter((c) => c.topico_id === t.id);
    return doTopico.length > 0
      ? doTopico.map((c) => ({ topicoId: t.id, conteudoId: c.id }))
      : [{ topicoId: t.id, conteudoId: null }];
  });
}

const chaveDaUnidade = (u: UnidadeDoLote) => `${u.topicoId}:${u.conteudoId ?? "-"}`;

/**
 * Do que o professor marcou na árvore para o pedido.
 *
 * Tópico com tudo marcado vai como tópico: a RPC pega todos os conteúdos dele, e o pedido fica
 * igual ao de "gerar o tópico" (a deduplicação compara o pedido, não os alvos). Conteúdo marcado
 * sem o tópico inteiro vai como conteúdo. Tópico sem conteúdo só pode ir inteiro.
 */
export function pedidoDaSelecao(marcadas: Iterable<UnidadeDoLote>, todas: UnidadeDoLote[]): PedidoDoLote {
  const escolhidas = new Set(Array.from(marcadas, chaveDaUnidade));
  const porTopico = new Map<number, UnidadeDoLote[]>();
  for (const u of todas) porTopico.set(u.topicoId, [...(porTopico.get(u.topicoId) ?? []), u]);

  const topicoIds: number[] = [];
  const conteudoIds: number[] = [];
  for (const [topicoId, unidades] of porTopico) {
    const dele = unidades.filter((u) => escolhidas.has(chaveDaUnidade(u)));
    if (dele.length === 0) continue;
    if (dele.length === unidades.length) topicoIds.push(topicoId);
    else conteudoIds.push(...dele.map((u) => u.conteudoId).filter((id): id is number => id != null));
  }
  return { topicoIds: topicoIds.sort((a, b) => a - b), conteudoIds: conteudoIds.sort((a, b) => a - b) };
}

/** Normaliza para os 7 perfis, na ordem canônica, sem repetida. */
export function perfisNaOrdem(perfis: Iterable<string>): BrainHexProfileKey[] {
  const pedidos = new Set(Array.from(perfis, (p) => (p.trim().toLowerCase() === "socialiser" ? "socializer" : p.trim().toLowerCase())));
  return TODOS_OS_PERFIS.filter((p) => pedidos.has(p));
}

/**
 * Os perfis que vão no pedido. Quando são exatamente os da turma, vai a lista vazia: o job fica
 * igual ao de "perfis da turma" e o worker continua filtrando pela turma na hora de gerar (um
 * aluno que sair antes leva junto a base que só ele usaria).
 */
export function perfisDoPedido(escolhidos: Iterable<string>, daTurma: Iterable<string>): BrainHexProfileKey[] {
  const e = perfisNaOrdem(escolhidos);
  const t = perfisNaOrdem(daTurma);
  return t.length > 0 && e.length === t.length && e.every((p, i) => p === t[i]) ? [] : e;
}

/** Quantos materiais base o pedido gera: cada unidade × cada perfil. */
export function totalDeMateriais(unidades: number, perfis: number): number {
  return Math.max(0, unidades) * Math.max(0, perfis);
}

// O client tipado cobre 25 das 84 tabelas e nenhuma destas RPCs (ver listPersonalizacaoJobs).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cliente = supabase as any;

export async function lerPerfisDaTurma(classeId: number): Promise<BrainHexProfileKey[]> {
  const { data, error } = await cliente.rpc("personalizacao_perfis_da_turma", { p_classe_id: classeId });
  if (error) throw new Error(error.message || "Não foi possível ler os perfis da turma.");
  return perfisNaOrdem((data ?? []) as string[]);
}

export async function lerConteudosDosTopicos(topicoIds: number[]): Promise<ConteudoDoLote[]> {
  if (topicoIds.length === 0) return [];
  const { data, error } = await cliente
    .from("conteudos")
    .select("id, topico_id, titulo, ordem")
    .in("topico_id", topicoIds)
    .order("ordem", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message || "Não foi possível ler os conteúdos.");
  return ((data ?? []) as Array<ConteudoDoLote & { ordem: number | null }>).map(({ id, topico_id, titulo }) => ({
    id,
    topico_id,
    titulo,
  }));
}

export type RespostaDoLote = {
  job_id: string;
  kind: string;
  status: string;
  total_targets: number;
  /** Já havia um job igual aberto: é ele que segue. */
  existente: boolean;
  /** Era um job igual que tinha parado com falha: voltou para a fila só com o que faltava. */
  retomado: boolean;
  alvos_reabertos?: number;
};

export async function enfileirarLote(classeId: number, pedido: PedidoDoLote, perfis: string[]): Promise<RespostaDoLote> {
  const { data, error } = await cliente.rpc("personalizacao_gerar_em_lote", {
    p_classe_id: classeId,
    p_topico_ids: pedido.topicoIds,
    p_conteudo_ids: pedido.conteudoIds,
    p_perfis: perfis,
  });
  // As mensagens da RPC já são para o professor (22023: nada a gerar, sem perfil).
  if (error) throw new Error(error.message || "Não foi possível enfileirar a geração.");
  return data as RespostaDoLote;
}

export type JobDoLote = {
  id: string;
  kind: string;
  status: string;
  total_targets: number;
  processed_targets: number;
  error_count: number;
};

export async function lerJobDoLote(jobId: string): Promise<JobDoLote | null> {
  const { data, error } = await cliente
    .from("personalizacao_jobs")
    .select("id, kind, status, total_targets, processed_targets, error_count")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Não foi possível ler o andamento.");
  return (data ?? null) as JobDoLote | null;
}

/** Frase do resultado do pedido, para o aviso. */
export function avisoDoLote(r: RespostaDoLote): string {
  if (r.retomado) {
    const n = r.alvos_reabertos ?? 0;
    return `Esse pedido tinha parado com falha. Voltou para a fila só o que faltava (${n} ${n === 1 ? "material" : "materiais"}).`;
  }
  if (r.existente) return "Esse mesmo pedido já está na fila. O andamento dele aparece aqui.";
  return `${r.total_targets} ${r.total_targets === 1 ? "material entrou" : "materiais entraram"} na fila de geração.`;
}
