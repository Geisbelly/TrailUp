export type GuildMember = { alunoId: string; nome: string; fotoUrl: string | null; joinedAt: string | null };
export type GuildInvite = { id: string; guildaId: string; guildaNome: string; convidanteId: string; status: string; createdAt: string | null };
export type Guild = { id: string; classeId: number; nome: string; descricao: string | null; emblema: string; limiteMembros: number; membrosAtivos: number; souMembro: boolean; souCriador: boolean; membros: GuildMember[]; convitesRecebidos: GuildInvite[] };

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
  return { id: String(row.guilda_id), classeId: Number(row.classe_id), nome: String(row.nome ?? "Guilda"), descricao: typeof row.descricao === "string" ? row.descricao : null, emblema: String(row.emblema ?? "constellation"), limiteMembros: Number(row.limite_membros) || 4, membrosAtivos: Number(row.membros_ativos) || members.length, souMembro: Boolean(row.sou_membro), souCriador: Boolean(row.sou_criador), membros: members, convitesRecebidos: invites };
}

export function normalizeGuilds(rows: unknown): Guild[] {
  return Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")).map(normalizeGuild) : [];
}
