import { supabase } from "@/integrations/supabase/client";
import type { LinhaPersonalizacaoAluno } from "./statusPorAluno";

// Leitura direta do Supabase (RLS do professor) — ver nota em statusPorAluno.ts.
export async function fetchRegistrosPorAluno(classeId: number, conteudoId: number): Promise<LinhaPersonalizacaoAluno[]> {
  const { data, error } = await supabase
    .from("conteudo_personalizado" as never)
    .select("aluno_id, status, gerado_em, updated_at")
    .eq("classe_id", classeId)
    .eq("conteudo_id", conteudoId)
    .not("aluno_id", "is", null)
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as unknown as LinhaPersonalizacaoAluno[];
}
