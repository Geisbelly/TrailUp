export type GuildShareKind = "desafio" | "questao";
export type GuildShare = { kind: GuildShareKind; id: number; title: string; activityId?: number; questionType?: string | null; alternatives?: string[] };
export type GuildMessage = {
  id: string;
  guildaId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string | null;
  kind: "text" | GuildShareKind;
  text: string;
  share: GuildShare | null;
  createdAt: string | null;
};

function normalizeShare(kind: unknown, value: unknown): GuildShare | null {
  if (kind !== "desafio" && kind !== "questao" || !value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = Number(row.id);
  const title = String(row.titulo ?? row.title ?? row.enunciado ?? "").trim();
  const alternatives = Array.isArray(row.alternativas) ? row.alternativas.map((item) => String(typeof item === "object" && item ? ((item as Record<string, unknown>).texto ?? (item as Record<string, unknown>).label ?? "") : item)).filter(Boolean) : undefined;
  return Number.isFinite(id) && id > 0 && title ? { kind, id, title, activityId: Number(row.atividade_id) || undefined, questionType: typeof row.tipo === "string" ? row.tipo : null, alternatives } : null;
}

export function normalizeGuildMessages(rows: unknown): GuildMessage[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const kind = row.tipo === "desafio" || row.tipo === "questao" ? row.tipo : "text";
    const share = normalizeShare(kind, row.conteudo);
    return [{
      id: String(row.id), guildaId: String(row.guilda_id), authorId: String(row.autor_id),
      authorName: String(row.autor_nome ?? "Colega"), authorPhotoUrl: typeof row.autor_foto_url === "string" ? row.autor_foto_url : null,
      kind, text: String(row.texto ?? ""), share, createdAt: typeof row.created_at === "string" ? row.created_at : null,
    }];
  });
}
