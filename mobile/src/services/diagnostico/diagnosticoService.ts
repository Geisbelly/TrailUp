import { supabase } from "@/database/supabase";

import {
  COLUNAS_DIAGNOSTICO,
  type LinhaDoDiagnostico,
  type NivelDoDiagnostico,
  type PedidoDeDiagnostico,
} from "./diagnosticoModel";

/**
 * O app fala direto com o Supabase, como em `notificacoes` e `alteracao_aluno`: pedir, corrigir e dispensar
 * são RPCs do banco, e a API só entra para escrever as perguntas (IA). Ver `diagnosticoModel.ts`.
 */

/** Pede o diagnóstico do tópico. Idempotente: se já existe, devolve o que há, sem outra chamada ao modelo. */
export async function pedirDiagnostico(topicoId: number): Promise<PedidoDeDiagnostico> {
  const { data, error } = await supabase.rpc("diagnostico_pedir", { p_topico_id: topicoId });
  if (error) throw error;
  return (data ?? { status: "sem_ia" }) as PedidoDeDiagnostico;
}

/** A própria linha (a policy só deixa ler a do aluno logado). O gabarito mora em outra tabela, sem acesso. */
export async function lerDiagnostico(id: string): Promise<LinhaDoDiagnostico | null> {
  const { data, error } = await supabase
    .from("diagnostico_topico")
    .select(COLUNAS_DIAGNOSTICO)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as LinhaDoDiagnostico | null;
}

/** O banco corrige e devolve o nível. Uma vez só: o banco recusa uma segunda tentativa. */
export async function responderDiagnostico(
  id: string,
  respostas: (number | null)[]
): Promise<{ nivel: NivelDoDiagnostico; acertos: number; total: number }> {
  const { data, error } = await supabase.rpc("diagnostico_responder", { p_id: id, p_respostas: respostas });
  if (error) throw error;
  return data as { nivel: NivelDoDiagnostico; acertos: number; total: number };
}

/** Pular não custa ponto nem posição. */
export async function dispensarDiagnostico(id: string): Promise<void> {
  const { error } = await supabase.rpc("diagnostico_dispensar", { p_id: id });
  if (error) throw error;
}
