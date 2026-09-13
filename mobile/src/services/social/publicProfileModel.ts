export type PublicAchievement = {
  id: number;
  nome: string;
  descricao: string | null;
  iconeUrl: string | null;
  categoria: string | null;
  pontosRecompensa: number;
  dataConquista: string | null;
};

export type PublicGuildSummary = {
  id: string;
  nome: string;
  emblema: string;
  membros: number;
} | null;

export type PublicProfile = {
  alunoId: string;
  nome: string;
  apelido: string | null;
  fotoUrl: string | null;
  bannerUrl: string | null;
  perfilAtivo: string | null;
  descricao: string | null;
  perfilDescricao: string | null;
  guilda: PublicGuildSummary;
  conquistas: PublicAchievement[];
  pontosConquistas: number;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function normalizePublicProfile(row: Record<string, unknown> | null | undefined): PublicProfile | null {
  if (!row || !row.aluno_id) return null;
  const guild = row.guilda && typeof row.guilda === "object" ? row.guilda as Record<string, unknown> : null;
  const achievements = Array.isArray(row.conquistas) ? row.conquistas : [];
  return {
    alunoId: String(row.aluno_id),
    nome: text(row.nome) ?? "Colega",
    apelido: text(row.apelido),
    fotoUrl: text(row.foto_url),
    bannerUrl: text(row.banner_url),
    perfilAtivo: text(row.perfil_ativo),
    descricao: text(row.descricao),
    perfilDescricao: text(row.perfil_descricao),
    guilda: guild && guild.id ? { id: String(guild.id), nome: text(guild.nome) ?? "Guilda", emblema: text(guild.emblema) ?? "constellation", membros: Number(guild.membros) || 0 } : null,
    conquistas: achievements.map((item) => {
      const achievement = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { id: Number(achievement.id) || 0, nome: text(achievement.nome) ?? "Conquista", descricao: text(achievement.descricao), iconeUrl: text(achievement.icone_url), categoria: text(achievement.categoria), pontosRecompensa: Number(achievement.pontos_recompensa) || 0, dataConquista: text(achievement.data_conquista) };
    }).filter((item) => item.id > 0),
    pontosConquistas: Number(row.pontos_conquistas) || 0,
  };
}
