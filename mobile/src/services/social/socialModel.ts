export type SocialStatus = "friend" | "incoming" | "outgoing" | "blocked" | "candidate";
export type SocialPerson = { alunoId: string; nome: string; apelido: string | null; fotoUrl: string | null; perfilAtivo: string | null; status: SocialStatus; relationshipId: string | null; guildaId: string | null; guildaNome: string | null; online: boolean };
export type SocialSnapshot = { friends: SocialPerson[]; incoming: SocialPerson[]; outgoing: SocialPerson[]; candidates: SocialPerson[]; blocked: SocialPerson[] };

export function normalizeSocialRow(row: Record<string, unknown>): SocialPerson {
  return { alunoId: String(row.aluno_id), nome: String(row.nome ?? "Colega"), apelido: (row.apelido as string | null) ?? null, fotoUrl: (row.foto_url as string | null) ?? null, perfilAtivo: (row.perfil_ativo as string | null) ?? null, status: String(row.status ?? "candidate") as SocialStatus, relationshipId: (row.relationship_id as string | null) ?? null, guildaId: (row.guilda_id as string | null) ?? null, guildaNome: (row.guilda_nome as string | null) ?? null, online: Boolean(row.online) };
}
export function groupSocialRows(rows: Record<string, unknown>[]): SocialSnapshot {
  const people = rows.map(normalizeSocialRow);
  return {
    friends: people.filter((p) => p.status === "friend"),
    incoming: people.filter((p) => p.status === "incoming"),
    outgoing: people.filter((p) => p.status === "outgoing"),
    candidates: people.filter((p) => p.status === "candidate"),
    blocked: people.filter((p) => p.status === "blocked"),
  };
}
