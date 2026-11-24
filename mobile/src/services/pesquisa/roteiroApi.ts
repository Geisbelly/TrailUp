/**
 * Roteiro e anotações do avaliador, direto no Supabase (sem API: não há modelo de linguagem no
 * meio). `avaliador_id` e `autor_id` vêm do banco; o app só manda etapa, plataforma e texto.
 */

import { supabase } from "@/database/supabase";
import { lerAnotacoes, lerMeuRoteiro, type Anotacao, type MeuRoteiro } from "./roteiro";

const COLUNAS = "id, etapa, plataforma, texto, criada_em";

/** null para quem não é avaliador, e também se a migration ainda não chegou ao banco. */
export async function carregarMeuRoteiro(): Promise<MeuRoteiro | null> {
  const { data, error } = await supabase.rpc("pesquisa_meu_roteiro");
  if (error) return null;
  return lerMeuRoteiro(data);
}

export async function carregarAnotacoes(): Promise<Anotacao[]> {
  const { data, error } = await supabase
    .from("pesquisa_anotacao")
    .select(COLUNAS)
    .order("criada_em", { ascending: true });
  if (error) throw error;
  return lerAnotacoes(data);
}

export async function marcarEtapa(etapa: string): Promise<void> {
  const { error } = await supabase.from("pesquisa_roteiro_marca").insert({ etapa });
  // Já marcada no console ou noutro aparelho: é o estado que se queria.
  if (error && error.code !== "23505") throw error;
}

export async function desmarcarEtapa(etapa: string): Promise<void> {
  const { error } = await supabase.from("pesquisa_roteiro_marca").delete().eq("etapa", etapa);
  if (error) throw error;
}

export async function anotar(texto: string, etapa: string | null): Promise<Anotacao> {
  const { data, error } = await supabase
    .from("pesquisa_anotacao")
    .insert({ texto, etapa, plataforma: "app" })
    .select(COLUNAS)
    .single();
  if (error) throw error;
  const [anotacao] = lerAnotacoes([data]);
  if (!anotacao) throw new Error("Anotação gravada sem retorno legível.");
  return anotacao;
}

export async function editarAnotacao(id: number, texto: string): Promise<Anotacao> {
  const { data, error } = await supabase
    .from("pesquisa_anotacao")
    .update({ texto })
    .eq("id", id)
    .select(COLUNAS)
    .single();
  if (error) throw error;
  const [anotacao] = lerAnotacoes([data]);
  if (!anotacao) throw new Error("Anotação editada sem retorno legível.");
  return anotacao;
}

export async function apagarAnotacao(id: number): Promise<void> {
  const { error } = await supabase.from("pesquisa_anotacao").delete().eq("id", id);
  if (error) throw error;
}
