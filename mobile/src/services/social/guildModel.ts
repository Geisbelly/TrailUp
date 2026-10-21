export type GuildMember = { alunoId: string; nome: string; fotoUrl: string | null; joinedAt: string | null };
export type GuildInvite = { id: string; guildaId: string; guildaNome: string; convidanteId: string; status: string; createdAt: string | null };
export type Guild = { id: string; classeId: number; nome: string; descricao: string | null; emblema: string; logoUrl: string | null; modoPerfil: "misto" | "perfil"; perfilAlvo: string | null; limiteMembros: number; membrosAtivos: number; souMembro: boolean; souCriador: boolean; membros: GuildMember[]; convitesRecebidos: GuildInvite[]; convitesEnviados: GuildSentInvite[] };

/**
 * Convite que EU enviei e que ainda está pendente.
 *
 * `guilda_listar` já devolve este arranjo filtrado por `convidante_id = auth.uid()` **e**
 * `status = 'pending'` (ver `docs/mobile/sql/20260913_06_guildas_configuracao_convites.sql`).
 * É isso que torna seguro oferecer "cancelar" em todo item: `guilda_cancelar_convite` exige
 * exatamente as duas condições, então nenhum botão aqui pode cair em
 * `guilda_convite_nao_encontrado` por ser de outra pessoa.
 *
 * `createdAt` vinha no payload e era descartado. Ele entra porque a ordem da lista precisa ser
 * estável entre dois carregamentos — sem chave de ordenação, convites pendentes "dançam".
 */
export type GuildSentInvite = { id: string; convidadoId: string; status: string; createdAt: string | null };

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
  const sentInvites = Array.isArray(row.convites_enviados) ? row.convites_enviados.map((value) => { const item = value as Record<string, unknown>; return { id: String(item.id), convidadoId: String(item.convidado_id), status: String(item.status ?? "pending"), createdAt: typeof item.created_at === "string" ? item.created_at : null }; }) : [];
  return { id: String(row.guilda_id), classeId: Number(row.classe_id), nome: String(row.nome ?? "Guilda"), descricao: typeof row.descricao === "string" ? row.descricao : null, emblema: String(row.emblema ?? "constellation"), logoUrl: typeof row.logo_url === "string" ? row.logo_url : null, modoPerfil: row.modo_perfil === "perfil" ? "perfil" : "misto", perfilAlvo: typeof row.perfil_alvo === "string" ? row.perfil_alvo : null, limiteMembros: Number(row.limite_membros) || 4, membrosAtivos: Number(row.membros_ativos) || members.length, souMembro: Boolean(row.sou_membro), souCriador: Boolean(row.sou_criador), membros: members, convitesRecebidos: invites, convitesEnviados: sentInvites };
}

export function normalizeGuilds(rows: unknown): Guild[] {
  return Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")).map(normalizeGuild) : [];
}

export type ConvitePendenteNaTela = { id: string; nome: string; enviadoEm: string | null };

/**
 * Os convites pendentes que eu enviei nesta guilda, prontos para a tela.
 *
 * Existia uma lacuna de produto aqui: `convites_enviados` era usado **só** para tirar da lista
 * de candidatos quem já havia sido convidado, então quem convidasse por engano não tinha como
 * desfazer — e nem via o convite, porque a pessoa apenas desaparecia dos candidatos.
 * `guilda_cancelar_convite` existe desde setembro e era a única RPC do domínio com EXECUTE para
 * `authenticated` e **zero** chamadores.
 *
 * O nome sai de `people` (a lista de colegas que a tela já carrega). Quem não estiver lá — colega
 * que saiu da turma, por exemplo — aparece como "Colega", nunca como uuid cru: o aluno não tem o
 * que fazer com um uuid, e esconder a linha seria pior, porque o convite continua pendente e
 * continua bloqueando um lugar na guilda.
 *
 * A ordem é a de envio, mais antigo primeiro, com `id` como desempate para a lista não mudar
 * entre dois carregamentos iguais (mesma razão do desempate em `ordenarMissoes`).
 */
export function convitesPendentesEnviados(
  convites: readonly GuildSentInvite[],
  pessoas: readonly { alunoId: string; nome: string; apelido?: string | null }[],
): ConvitePendenteNaTela[] {
  const porId = new Map(pessoas.map((pessoa) => [pessoa.alunoId, pessoa]));
  return convites
    .filter((convite) => convite.status === "pending")
    .map((convite) => {
      const pessoa = porId.get(convite.convidadoId);
      return {
        id: convite.id,
        nome: (pessoa?.apelido || pessoa?.nome || "").trim() || "Colega",
        enviadoEm: convite.createdAt,
      };
    })
    .sort((a, b) => {
      const ta = a.enviadoEm ? Date.parse(a.enviadoEm) : Number.POSITIVE_INFINITY;
      const tb = b.enviadoEm ? Date.parse(b.enviadoEm) : Number.POSITIVE_INFINITY;
      if (Number.isFinite(ta) || Number.isFinite(tb)) {
        if (ta !== tb) return ta - tb;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}
