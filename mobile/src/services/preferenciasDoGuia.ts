import { supabase } from "@/database/supabase";
import { PREFERENCIAS_VAZIAS, type PreferenciasDoGuia } from "@/utils/preferenciasDoGuia";

/**
 * "O que o Guia sabe de você" (`aluno_preferencias_guia`, 20261124_04), direto no Supabase:
 * ler é a policy do próprio aluno, e apagar e ligar ou desligar a coleta são RPCs. Não passa
 * pela API (regra de fronteira do CLAUDE.md): nada aqui tem modelo de linguagem.
 */

/** `null` quando a leitura falhou, para a tela não fingir que não há nada guardado. */
export async function minhasPreferenciasDoGuia(alunoId: string): Promise<PreferenciasDoGuia | null> {
  const { data, error } = await supabase
    .from("aluno_preferencias_guia")
    .select("gostos, resumo, postura, coleta_ligada, atualizado_em")
    .eq("aluno_id", alunoId)
    .maybeSingle();
  if (error) return null;
  return data ? { ...PREFERENCIAS_VAZIAS, ...(data as Partial<PreferenciasDoGuia>) } : PREFERENCIAS_VAZIAS;
}

export async function apagarPreferenciasDoGuia(): Promise<boolean> {
  const { error } = await supabase.rpc("guia_preferencias_apagar");
  return !error;
}

/** Desligar também apaga o que estava guardado (o banco faz as duas coisas). */
export async function definirColetaDoGuia(ligada: boolean): Promise<boolean> {
  const { error } = await supabase.rpc("guia_preferencias_coleta", { p_ligada: ligada });
  return !error;
}
