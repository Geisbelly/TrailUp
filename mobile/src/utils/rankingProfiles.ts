import { normalizeBrainHexProfile, type BrainHexProfile } from "@/constants/brainHexProfiles";

export type RankingProfileMeta = {
  key: BrainHexProfile | null;
  label: string;
};

export type RankingCurrentStudent = {
  alunoId: string | null | undefined;
  perfilAtivo: string | null | undefined;
};

const PROFILE_LABELS: Record<BrainHexProfile, string> = {
  seeker: "Explorador",
  survivor: "Sobrevivente",
  daredevil: "Aventureiro",
  mastermind: "Estrategista",
  conqueror: "Conquistador",
  socializer: "Socializador",
  achiever: "Realizador",
};

export function buildRankingProfileMap(
  rows: readonly unknown[],
  alunoIds: readonly string[],
  currentStudent?: RankingCurrentStudent,
): Record<string, RankingProfileMeta> {
  const result: Record<string, RankingProfileMeta> = {};
  const allowedAlunoIds = new Set(alunoIds);

  for (const rawRow of rows) {
    if (!rawRow || typeof rawRow !== "object") continue;
    const row = rawRow as Record<string, unknown>;
    const alunoId = String(row.aluno_id ?? "");
    if (!alunoId || !allowedAlunoIds.has(alunoId) || result[alunoId]) continue;

    const profile = normalizeBrainHexProfile(
      typeof row.perfil_ativo === "string"
        ? row.perfil_ativo
        : typeof row.perfil === "object" && row.perfil
        ? String((row.perfil as Record<string, unknown>).nome ?? "")
        : null,
    );
    result[alunoId] = profile
      ? { key: profile, label: PROFILE_LABELS[profile] }
      : { key: null, label: "Perfil não definido" };
  }

  // `social_listar_pessoas` lista os colegas e, por contrato, não devolve o
  // próprio usuário. O ranking, porém, também renderiza a linha dele.
  // Sempre priorize o perfil ativo da sessão para não deixar a linha própria
  // vazia nem reaproveitar o perfil de outro aluno.
  const currentStudentId = String(currentStudent?.alunoId ?? "");
  if (currentStudentId && allowedAlunoIds.has(currentStudentId)) {
    const currentProfile = normalizeBrainHexProfile(currentStudent?.perfilAtivo);
    result[currentStudentId] = currentProfile
      ? { key: currentProfile, label: PROFILE_LABELS[currentProfile] }
      : { key: null, label: "Perfil não definido" };
  }

  for (const alunoId of alunoIds) {
    if (!result[alunoId]) result[alunoId] = { key: null, label: "Perfil não definido" };
  }

  return result;
}
