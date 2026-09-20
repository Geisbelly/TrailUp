export type GuildMember = { alunoId: string; nome: string; fotoUrl: string | null; joinedAt: string | null };
export type GuildInvite = { id: string; guildaId: string; guildaNome: string; convidanteId: string; status: string; createdAt: string | null };
export type GuildSentInvite = { id: string; convidadoId: string; status: string; createdAt: string | null };
export type Guild = {
  id: string; classeId: number; nome: string; descricao: string | null; emblema: string;
  logoUrl: string | null; modoPerfil: "misto" | "perfil"; perfilAlvo: string | null;
  limiteMembros: number; membrosAtivos: number; souMembro: boolean; souCriador: boolean;
  membros: GuildMember[]; convitesRecebidos: GuildInvite[]; convitesEnviados: GuildSentInvite[];
};

/**
 * O limite padrao e 10, nao 4.
 *
 * `guilda_criar` grava `LEAST(guilda_config_turma.tamanho_maximo, 10)` e o CHECK
 * da coluna e `BETWEEN 2 AND 10`; a tela de guildas anuncia "equipes de ate 10
 * pessoas". Um default de 4 aqui so aparece quando a RPC nao mandou a coluna --
 * e nesse caso ele mentia em 6 vagas, escondendo o botao de entrar numa guilda
 * que tinha lugar.
 */
const LIMITE_PADRAO = 10;

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor : null;
}

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
  // `guilda_listar` devolve `convites_enviados` desde que a RPC ganhou logo e
  // modo de perfil, e nada lia: sem isto o criador nao ve quem ja convidou, e
  // `guilda_cancelar_convite` fica sem chamador.
  const sent = Array.isArray(row.convites_enviados) ? row.convites_enviados.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (!item.id || !item.convidado_id) return [];
    return [{ id: String(item.id), convidadoId: String(item.convidado_id), status: String(item.status ?? "pending"), createdAt: typeof item.created_at === "string" ? item.created_at : null }];
  }) : [];
  const modo = row.modo_perfil === "perfil" ? "perfil" : "misto";
  return {
    id: String(row.guilda_id), classeId: Number(row.classe_id), nome: String(row.nome ?? "Guilda"),
    descricao: texto(row.descricao), emblema: String(row.emblema ?? "constellation"),
    logoUrl: texto(row.logo_url), modoPerfil: modo, perfilAlvo: modo === "perfil" ? texto(row.perfil_alvo) : null,
    limiteMembros: Number(row.limite_membros) || LIMITE_PADRAO,
    membrosAtivos: Number(row.membros_ativos) || members.length,
    souMembro: Boolean(row.sou_membro), souCriador: Boolean(row.sou_criador),
    membros: members, convitesRecebidos: invites, convitesEnviados: sent,
  };
}

export function normalizeGuilds(rows: unknown): Guild[] {
  return Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")).map(normalizeGuild) : [];
}

/** Tem lugar? A tela usa isto para decidir entre "Entrar" e "Guilda completa". */
export function temVaga(guild: Guild): boolean {
  return guild.membrosAtivos < guild.limiteMembros;
}
