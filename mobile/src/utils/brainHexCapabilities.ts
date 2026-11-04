import {
  BrainHexProfile,
  normalizeBrainHexProfile,
} from "@/constants/brainHexProfiles";

export type BrainHexProfileCapabilities = {
  hasTimer: boolean;
  hasBattle: boolean;
  hasChat: boolean;
};

const TIMER_PROFILES = new Set<BrainHexProfile>([
  "survivor",
  "mastermind",
  "achiever",
  "conqueror",
  "daredevil",
]);
const BATTLE_PROFILES = new Set<BrainHexProfile>([
  "survivor",
  "daredevil",
  "conqueror",
]);
export function getBrainHexProfileCapabilities(
  profileName?: string | null,
): BrainHexProfileCapabilities {
  const profile = normalizeBrainHexProfile(profileName) ?? "seeker";

  return {
    hasTimer: TIMER_PROFILES.has(profile),
    hasBattle: BATTLE_PROFILES.has(profile),
    // Todo perfil conversa com o seu Guardião. Quem barra a IA é a idade (`mentorLiberado`).
    hasChat: true,
  };
}
