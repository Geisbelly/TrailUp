import { supabase } from "@/database/supabase";
import { groupSocialRows, type SocialSnapshot } from "./socialModel";

export async function carregarSocial(classeId?: number): Promise<SocialSnapshot> {
  const peopleRequest = classeId ? supabase.rpc("social_listar_pessoas", { p_classe_id: classeId }) : supabase.rpc("social_listar_pessoas");
  const [peopleResult, presenceResult] = await Promise.all([peopleRequest, classeId ? supabase.rpc("social_presenca_turma", { p_classe_id: classeId }) : Promise.resolve({ data: [], error: null })]);
  if (peopleResult.error) throw peopleResult.error;
  if (presenceResult.error) throw presenceResult.error;
  const presence = new Map((Array.isArray(presenceResult.data) ? presenceResult.data : []).map((item) => [String((item as Record<string, unknown>).aluno_id), Boolean((item as Record<string, unknown>).online)]));
  return groupSocialRows(((peopleResult.data ?? []) as Record<string, unknown>[]).map((row) => ({ ...row, online: presence.get(String(row.aluno_id)) ?? false })));
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
export async function socialChatListar(alunoId: string) { const { data, error } = await supabase.rpc("social_chat_listar", { p_destinatario_id: alunoId }); if (error) throw error; return Array.isArray(data) ? data : []; }
export async function socialChatEnviar(alunoId: string, texto: string) { return socialAction("social_chat_enviar", { p_destinatario_id: alunoId, p_texto: texto.trim() }); }
export async function socialChatPresenca(alunoId: string) { const { data, error } = await supabase.rpc("social_presenca_aluno", { p_aluno_id: alunoId }); if (error) throw error; return Boolean((data as { online?: unknown } | null)?.online); }
