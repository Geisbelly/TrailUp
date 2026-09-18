export type GuildMember = { alunoId: string; nome: string; fotoUrl: string | null; joinedAt: string | null };
export type GuildInvite = { id: string; guildaId: string; guildaNome: string; convidanteId: string; status: string; createdAt: string | null };
export type Guild = { id: string; classeId: number; nome: string; descricao: string | null; emblema: string; logoUrl: string | null; modoPerfil: "misto" | "perfil"; perfilAlvo: string | null; limiteMembros: number; membrosAtivos: number; souMembro: boolean; souCriador: boolean; membros: GuildMember[]; convitesRecebidos: GuildInvite[]; convitesEnviados: { id: string; convidadoId: string; status: string }[] };

function normalizeMember(value: unknown): GuildMember | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!row.aluno_id) return null;
  return { alunoId: String(row.aluno_id), nome: String(row.nome ?? "Colega"), fotoUrl: typeof row.foto_url === "string" ? row.foto_url : null, joinedAt: typeof row.joined_at === "string" ? row.joined_at : null };
}

export function normalizeGuild(row: Record<string, unknown>): Guild {
  const members = Array.isArray(row.membros) ? row.membros.map(normalizeMember).filter(Boolean) as GuildMember[] : [];
  const invites = Array.isArray(row.convites_recebidos) ? row.convites_recebidos.map((value) => {
    const item = value as Record<string, unknown>;
    return { id: String(item.id), guildaId: String(item.guilda_id), guildaNome: String(item.guilda_nome ?? row.nome ?? "Guilda"), convidanteId: String(item.convidante_id), status: String(item.status ?? "pending"), createdAt: typeof item.created_at === "string" ? item.created_at : null };
  }) : [];
  const sentInvites = Array.isArray(row.convites_enviados) ? row.convites_enviados.map((value) => { const item = value as Record<string, unknown>; return { id: String(item.id), convidadoId: String(item.convidado_id), status: String(item.status ?? "pending") }; }) : [];
  return { id: String(row.guilda_id), classeId: Number(row.classe_id), nome: String(row.nome ?? "Guilda"), descricao: typeof row.descricao === "string" ? row.descricao : null, emblema: String(row.emblema ?? "constellation"), logoUrl: typeof row.logo_url === "string" ? row.logo_url : null, modoPerfil: row.modo_perfil === "perfil" ? "perfil" : "misto", perfilAlvo: typeof row.perfil_alvo === "string" ? row.perfil_alvo : null, limiteMembros: Number(row.limite_membros) || 4, membrosAtivos: Number(row.membros_ativos) || members.length, souMembro: Boolean(row.sou_membro), souCriador: Boolean(row.sou_criador), membros: members, convitesRecebidos: invites, convitesEnviados: sentInvites };
}

export function normalizeGuilds(rows: unknown): Guild[] {
  return Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")).map(normalizeGuild) : [];
}
