import { supabase } from "@/database/supabase";
import { normalizeGuilds, type Guild } from "./guildModel";
import { normalizeGuildMessages, type GuildMessage, type GuildShareKind } from "./guildChatModel";

async function action(name: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function carregarGuildas(classeId: number): Promise<Guild[]> {
  const { data, error } = await supabase.rpc("guilda_listar", { p_classe_id: classeId });
  if (error) throw error;
  return normalizeGuilds(data);
}
export const criarGuilda = (classeId: number, nome: string, descricao?: string, emblema?: string) => action("guilda_criar", { p_classe_id: classeId, p_nome: nome, p_descricao: descricao ?? null, p_emblema: emblema ?? "constellation" });
export const convidarParaGuilda = (guildaId: string, alunoId: string) => action("guilda_convidar", { p_guilda_id: guildaId, p_convidado_id: alunoId });
export const aceitarConviteGuilda = (conviteId: string) => action("guilda_aceitar_convite", { p_convite_id: conviteId });
export const recusarConviteGuilda = (conviteId: string) => action("guilda_recusar_convite", { p_convite_id: conviteId });
export const entrarGuilda = (guildaId: string) => action("guilda_entrar", { p_guilda_id: guildaId });
export const sairGuilda = (guildaId: string) => action("guilda_sair", { p_guilda_id: guildaId });
export const dissolverGuilda = (guildaId: string) => action("guilda_dissolver", { p_guilda_id: guildaId });

export async function carregarMensagensGuilda(guildaId: string, limite = 100): Promise<GuildMessage[]> {
  const { data, error } = await supabase.rpc("guilda_chat_listar", { p_guilda_id: guildaId, p_limite: limite });
  if (error) throw error;
  return normalizeGuildMessages(data);
}

export async function enviarMensagemGuilda(guildaId: string, texto: string) {
  return action("guilda_chat_enviar", { p_guilda_id: guildaId, p_tipo: "text", p_texto: texto.trim(), p_conteudo: {} });
}

export async function compartilharNaGuilda(guildaId: string, tipo: GuildShareKind, id: number, titulo: string) {
  return action("guilda_chat_enviar", { p_guilda_id: guildaId, p_tipo: tipo, p_texto: titulo, p_conteudo: { id, titulo } });
}
