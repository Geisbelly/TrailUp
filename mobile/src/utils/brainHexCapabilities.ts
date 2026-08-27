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
const CHAT_PROFILES = new Set<BrainHexProfile>(["socializer", "seeker"]);

export function getBrainHexProfileCapabilities(
  profileName?: string | null,
): BrainHexProfileCapabilities {
  const profile = normalizeBrainHexProfile(profileName) ?? "seeker";

  return {
    hasTimer: TIMER_PROFILES.has(profile),
    hasBattle: BATTLE_PROFILES.has(profile),
    hasChat: CHAT_PROFILES.has(profile),
  };
}
