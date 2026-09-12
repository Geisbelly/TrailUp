import { supabase } from "@/database/supabase";
import { groupSocialRows, type SocialSnapshot } from "./socialModel";

export async function carregarSocial(): Promise<SocialSnapshot> {
  const { data, error } = await supabase.rpc("social_listar_pessoas");
  if (error) throw error;
  return groupSocialRows((data ?? []) as Record<string, unknown>[]);
}
export async function socialAction(name: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data as Record<string, unknown>;
}
export const enviarConvite = (alvoId: string) => socialAction("social_enviar_convite", { p_destinatario: alvoId });
export const aceitarConvite = (relationshipId: string) => socialAction("social_aceitar_convite", { p_relationship_id: relationshipId });
export const recusarConvite = (relationshipId: string) => socialAction("social_recusar_convite", { p_relationship_id: relationshipId });
export const desfazerAmizade = (relationshipId: string) => socialAction("social_desfazer_amizade", { p_relationship_id: relationshipId });
export const bloquear = (alvoId: string) => socialAction("social_bloquear", { p_alvo: alvoId });
export const desbloquear = (relationshipId: string) => socialAction("social_desbloquear", { p_relationship_id: relationshipId });

