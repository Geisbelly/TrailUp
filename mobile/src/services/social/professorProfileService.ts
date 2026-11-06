import { supabase } from "@/database/supabase";
import { normalizeProfessorProfile, type ProfessorProfile } from "./professorProfileModel";

/** A RLS de `professor` barra o aluno: a leitura é por esta função, que escolhe as colunas e confere a matrícula. */
export async function carregarPerfilDoProfessor(classeId: number): Promise<ProfessorProfile | null> {
  const { data, error } = await supabase.rpc("aluno_ver_professor_da_turma", { p_classe_id: classeId });
  if (error) throw error;
  return normalizeProfessorProfile(data as Record<string, unknown> | null);
}
