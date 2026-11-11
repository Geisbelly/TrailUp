// A diversidade de perfis da turma: Supabase direto, sem a API.
//
// É leitura pura, sem modelo de linguagem no meio (regra de fronteira do CLAUDE.md). A função
// `classe_diversidade_perfis` é SECURITY INVOKER: roda com a RLS do professor e devolve NULL para
// turma que não é dele.

import { supabase } from "@/integrations/supabase/client";
import { mapearDiversidade, type DiversidadeDaTurma } from "./diversidade";

export async function lerDiversidadeDaTurma(classeId: number): Promise<DiversidadeDaTurma | null> {
  const { data, error } = await supabase.rpc("classe_diversidade_perfis" as never, { p_classe: classeId } as never);
  if (error) throw error;
  return mapearDiversidade(data);
}
