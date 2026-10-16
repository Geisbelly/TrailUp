import { supabase } from "@/integrations/supabase/client";
import { saveActivity } from "../trilha/topicsApi";
import { TIPO_DA_MISSAO, type PayloadDaMissao } from "./missao";

export type Missao = {
  id: number;
  titulo: string;
  objetivo: string;
  topicoId: number;
  topicoNome: string;
  prazo: string | null;
  pontos: number;
  moedas: number;
  entregues: number;
  total: number;
};

type LinhaDeAtividade = {
  id: number;
  titulo: string;
  descricao: string | null;
  data_entrega: string | null;
  pontuacao_maxima: number | string | null;
  metadata?: unknown;
  topico_id: number;
  topicos: { nome: string | null; classe_id: number } | { nome: string | null; classe_id: number }[] | null;
};

type LinhaDeEntrega = { atividade_id: number; aluno_id: string; status: string | null };

/** "concluido" (com ou sem acento, em qualquer caixa) conta como entregue — mesma regra do cálculo de progresso. */
export function foiEntregue(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase().includes("concl");
}

/** Entregas por atividade: um aluno conta uma vez, mesmo que haja mais de uma linha. */
export function contarEntregas(linhas: LinhaDeEntrega[]): Map<number, number> {
  const porAtividade = new Map<number, Set<string>>();
  for (const l of linhas) {
    if (!foiEntregue(l.status)) continue;
    const alunos = porAtividade.get(l.atividade_id) ?? new Set<string>();
    alunos.add(l.aluno_id);
    porAtividade.set(l.atividade_id, alunos);
  }
  return new Map([...porAtividade].map(([id, alunos]) => [id, alunos.size]));
}

/** `atividades.metadata.moedas` (inteiro >= 0). Qualquer outra coisa conta como nenhuma. */
export function moedasDe(metadata: unknown): number {
  const v = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).moedas : undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function mapearMissao(a: LinhaDeAtividade, entregues: number, total: number): Missao {
  const topico = Array.isArray(a.topicos) ? a.topicos[0] : a.topicos;
  return {
    id: a.id,
    titulo: a.titulo,
    objetivo: a.descricao ?? "",
    topicoId: a.topico_id,
    topicoNome: topico?.nome?.trim() || `Tópico ${a.topico_id}`,
    prazo: a.data_entrega,
    pontos: Number(a.pontuacao_maxima ?? 0),
    moedas: moedasDe(a.metadata),
    entregues,
    total,
  };
}

export async function listarMissoes(classeId: number): Promise<Missao[]> {
  const { data, error } = await supabase
    .from("atividades")
    .select("id, titulo, descricao, data_entrega, pontuacao_maxima, metadata, topico_id, topicos!inner(nome, classe_id)")
    .eq("tipo", TIPO_DA_MISSAO)
    .eq("topicos.classe_id", classeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const atividades = (data ?? []) as unknown as LinhaDeAtividade[];
  if (atividades.length === 0) return [];

  const ids = atividades.map((a) => a.id);
  const [entregas, alunos] = await Promise.all([
    supabase.from("atividade_aluno").select("atividade_id, aluno_id, status").in("atividade_id", ids),
    supabase.from("classe_aluno").select("*", { count: "exact", head: true }).eq("classe_id", classeId),
  ]);
  if (entregas.error) throw entregas.error;
  if (alunos.error) throw alunos.error;

  const contagem = contarEntregas((entregas.data ?? []) as unknown as LinhaDeEntrega[]);
  const total = alunos.count ?? 0;
  return atividades.map((a) => mapearMissao(a, contagem.get(a.id) ?? 0, total));
}

export async function salvarMissao(payload: PayloadDaMissao, id?: number): Promise<number> {
  const salvoId = await saveActivity({
    id,
    topico_id: payload.topico_id,
    titulo: payload.titulo,
    descricao: payload.descricao,
    tipo: payload.tipo,
    data_entrega: payload.data_entrega,
    pontuacao_maxima: payload.pontuacao_maxima,
  });
  await gravarMoedas(salvoId, payload.moedas);
  return salvoId;
}

/**
 * Grava `metadata.moedas` sem apagar o resto do JSON (regras de correção, anexos…): lê, mescla e escreve.
 * O banco paga estas moedas só quando o professor aprova a entrega (`avaliar_entrega`).
 */
export async function gravarMoedas(atividadeId: number, moedas: number): Promise<void> {
  const lida = await supabase.from("atividades").select("metadata").eq("id", atividadeId).maybeSingle();
  if (lida.error) throw lida.error;
  const atual = lida.data?.metadata && typeof lida.data.metadata === "object" && !Array.isArray(lida.data.metadata) ? (lida.data.metadata as Record<string, unknown>) : {};
  const { moedas: _antiga, ...resto } = atual;
  const novo = moedas > 0 ? { ...resto, moedas } : resto;
  const { error } = await supabase.from("atividades").update({ metadata: novo as never }).eq("id", atividadeId);
  if (error) throw error;
}

/** Copia a missão (atividade + questões) sem vínculo a conteúdo e sem entregas — função do banco `duplicar_atividade`. */
export async function duplicarMissao(id: number): Promise<number> {
  const { data, error } = await supabase.rpc("duplicar_atividade" as never, { p_atividade_id: id, p_conteudo_id: null } as never);
  if (error) throw error;
  return data as unknown as number;
}

/**
 * Apaga a missão. Os vínculos com conteúdo saem primeiro: a FK `atividade_conteudos` é NO ACTION
 * (as demais da trilha são CASCADE). Se outra tabela impedir (ex.: entregas dos alunos), o erro do
 * banco é propagado para a tela dizer que não foi possível, em vez de fingir que apagou.
 */
export async function excluirMissao(id: number): Promise<void> {
  const vinculos = await supabase.from("atividade_conteudos").delete().eq("atividade_id", id);
  if (vinculos.error) throw vinculos.error;
  const { error } = await supabase.from("atividades").delete().eq("id", id);
  if (error) throw error;
}
