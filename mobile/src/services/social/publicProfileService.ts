import { supabase } from "@/database/supabase";
import { normalizePublicProfile, type PublicProfile } from "./publicProfileModel";

export async function carregarPerfilPublico(alunoId: string, classeId: number): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc("social_perfil_publico", { p_aluno_id: alunoId, p_classe_id: classeId > 0 ? classeId : null });
  if (error) throw error;
  return normalizePublicProfile(data as Record<string, unknown> | null);
}
