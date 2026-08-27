export type BrainHexProfile =
  | "seeker"
  | "survivor"
  | "daredevil"
  | "mastermind"
  | "conqueror"
  | "socializer"
  | "achiever";

const profileAliases: Record<string, BrainHexProfile> = {
  seeker: "seeker",
  explorador: "seeker",
  buscador: "seeker",
  survivor: "survivor",
  sobrevivente: "survivor",
  daredevil: "daredevil",
  aventureiro: "daredevil",
  ousado: "daredevil",
  mastermind: "mastermind",
  estrategista: "mastermind",
  mestre: "mastermind",
  conqueror: "conqueror",
  conquistador: "conqueror",
  socializer: "socializer",
  socialiser: "socializer",
  socializador: "socializer",
  achiever: "achiever",
  realizador: "achiever",
};

export function normalizeBrainHexProfile(
  profileName?: string | null,
): BrainHexProfile | null {
  const normalized = String(profileName ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");

  return profileAliases[normalized] ?? null;
}
