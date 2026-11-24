// Roteiro e anotações do avaliador: direto no Supabase, sem a API (não há modelo de linguagem no meio,
// regra de fronteira do CLAUDE.md). Quem decide de quem é a linha é o banco: `avaliador_id` e
// `autor_id` têm DEFAULT e o cliente não tem GRANT nessas colunas (migration `20261123_03`).

import { supabase } from "@/integrations/supabase/client";
import { lerAnotacoes, lerMeuRoteiro, type Anotacao, type MeuRoteiro, type PlataformaDaAnotacao } from "./roteiroDaPesquisa";

const COLUNAS = "id, etapa, plataforma, texto, criada_em, atualizada_em";

/** null = não é avaliador, ou a migration ainda não chegou ao banco: o painel não aparece. */
export async function carregarMeuRoteiro(): Promise<MeuRoteiro | null> {
  const { data, error } = await supabase.rpc("pesquisa_meu_roteiro" as never);
  if (error) return null;
  return lerMeuRoteiro(data);
}

export async function carregarAnotacoes(): Promise<Anotacao[]> {
  const { data, error } = await supabase
    .from("pesquisa_anotacao" as never)
    .select(COLUNAS)
    .order("criada_em", { ascending: true });
  if (error) throw error;
  return lerAnotacoes(data);
}

export async function marcarEtapa(etapa: string): Promise<void> {
  const { error } = await supabase.from("pesquisa_roteiro_marca" as never).insert({ etapa } as never);
  // Já marcada (outra aba, o app): é o estado que se queria.
  if (error && error.code !== "23505") throw error;
}

export async function desmarcarEtapa(etapa: string): Promise<void> {
  const { error } = await supabase.from("pesquisa_roteiro_marca" as never).delete().eq("etapa", etapa);
  if (error) throw error;
}

export async function anotar(texto: string, etapa: string | null, plataforma: PlataformaDaAnotacao): Promise<Anotacao> {
  const { data, error } = await supabase
    .from("pesquisa_anotacao" as never)
    .insert({ texto, etapa, plataforma } as never)
    .select(COLUNAS)
    .single();
  if (error) throw error;
  const [anotacao] = lerAnotacoes([data]);
  if (!anotacao) throw new Error("Anotação gravada sem retorno legível.");
  return anotacao;
}

export async function editarAnotacao(id: number, texto: string, etapa: string | null): Promise<Anotacao> {
  const { data, error } = await supabase
    .from("pesquisa_anotacao" as never)
    .update({ texto, etapa } as never)
    .eq("id", id)
    .select(COLUNAS)
    .single();
  if (error) throw error;
  const [anotacao] = lerAnotacoes([data]);
  if (!anotacao) throw new Error("Anotação editada sem retorno legível.");
  return anotacao;
}

export async function apagarAnotacao(id: number): Promise<void> {
  const { error } = await supabase.from("pesquisa_anotacao" as never).delete().eq("id", id);
  if (error) throw error;
}

/** Avisa o painel do roteiro, na mesma aba, que algo mudou fora dele. */
export const EVENTO_DO_ROTEIRO = "trailup:roteiro-mudou";

/**
 * O formulário nativo foi enviado: marca "blocos" no roteiro. É o próprio avaliador agindo na tela
 * da avaliação, não uso observado. Quem não é avaliador (o dono testando) recebe recusa da RLS, e
 * isso não muda nada no envio.
 */
export async function marcarAvaliacaoEnviada(): Promise<void> {
  try {
    await marcarEtapa("blocos");
    window.dispatchEvent(new Event(EVENTO_DO_ROTEIRO));
  } catch {
    // Marca é conveniência: o envio já aconteceu.
  }
}
