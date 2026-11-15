import { supabase } from "@/integrations/supabase/client";
import { MAX_CHARS_DA_ORIENTACAO } from "../../../../supabase/functions/generate-content-ai/orientacao.ts";

/**
 * Orientação do professor para a IA, por turma (`classe_orientacao_ia`,
 * migration `20261115_01`): o que pedir e o que evitar.
 *
 * O console lê e grava direto no Supabase (RLS: só o dono da turma) e manda a
 * orientação no corpo de todo pedido à `generate-content-ai`: gerar a trilha,
 * gerar o que falta, "Pedir ajuste" de um tópico, a descrição do tópico e as
 * sugestões de cards e atividades de um conteúdo.
 */

export type OrientacaoDaIa = { pedir: string; evitar: string };

export const ORIENTACAO_VAZIA: OrientacaoDaIa = { pedir: "", evitar: "" };
export const MAX_CHARS_ORIENTACAO = MAX_CHARS_DA_ORIENTACAO;

export const temOrientacao = (o: OrientacaoDaIa) => Boolean(o.pedir.trim() || o.evitar.trim());

export const mesmaOrientacao = (a: OrientacaoDaIa, b: OrientacaoDaIa) =>
  a.pedir.trim() === b.pedir.trim() && a.evitar.trim() === b.evitar.trim();

/** O que vai no corpo do pedido: nada quando o professor não escreveu. */
export const orientacaoParaOPedido = (o: OrientacaoDaIa): { orientacao?: OrientacaoDaIa } =>
  temOrientacao(o) ? { orientacao: { pedir: o.pedir.trim(), evitar: o.evitar.trim() } } : {};

export async function lerOrientacao(classeId: number): Promise<OrientacaoDaIa> {
  const { data, error } = await supabase
    .from("classe_orientacao_ia" as never)
    .select("pedir, evitar" as never)
    .eq("classe_id" as never, classeId as never)
    .maybeSingle();
  if (error) throw error;
  const linha = data as unknown as { pedir?: string | null; evitar?: string | null } | null;
  return { pedir: linha?.pedir ?? "", evitar: linha?.evitar ?? "" };
}

export async function salvarOrientacao(classeId: number, o: OrientacaoDaIa): Promise<void> {
  const linha = {
    classe_id: classeId,
    pedir: o.pedir.trim().slice(0, MAX_CHARS_ORIENTACAO),
    evitar: o.evitar.trim().slice(0, MAX_CHARS_ORIENTACAO),
  };
  const { error } = await supabase
    .from("classe_orientacao_ia" as never)
    .upsert(linha as never, { onConflict: "classe_id" });
  if (error) throw error;
}
