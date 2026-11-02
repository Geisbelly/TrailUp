/**
 * Faixa de XP do aluno na turma (#143), direto do Supabase pela RPC
 * `aluno_faixa_xp` (`20261102_10`). A conta é do banco; o app só mostra.
 *
 * Sem a RPC no banco (local sem a migration) ou sem faixa configurada, devolve
 * `null` e o cartão não aparece.
 */

import { supabase } from "@/database/supabase";

import { lerFaixaXp, rpcIndisponivel, type FaixaXp } from "./faixaXp.core";

export { formatarXp, progressoDaFaixa, textosDaFaixa } from "./faixaXp.core";
export type { FaixaXp } from "./faixaXp.core";

export async function carregarFaixaXp(classeId: number): Promise<FaixaXp | null> {
  const { data, error } = await supabase.rpc("aluno_faixa_xp", { p_classe_id: classeId });
  if (error) {
    if (rpcIndisponivel(error)) return null;
    throw error;
  }
  const linha = Array.isArray(data) ? data[0] : data;
  return lerFaixaXp(linha);
}
