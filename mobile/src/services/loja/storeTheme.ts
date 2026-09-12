import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";

const PROFILE_ACCENTS: Record<string, string> = {
  seeker: "#36c5f0", survivor: "#7d9b50", daredevil: "#e14d2a",
  mastermind: "#4c40f6", conqueror: "#1e4fd6", socializer: "rgb(244, 98, 58)",
  achiever: "rgb(201, 162, 39)",
};

export function resolveStoreAccent(profileName?: string | null, configured?: string | null) {
  if (configured) return configured;
  const normalized = normalizeBrainHexProfile(profileName);
  return normalized ? PROFILE_ACCENTS[normalized] ?? "#c9a227" : "#c9a227";
}
export function resolveStoreIcon(profileName?: string | null, configured?: string | null) {
  return configured || (normalizeBrainHexProfile(profileName) ? "storefront" : "storefront-outline");
}
export function resolveStoreChest(configured?: string | null) { return configured || "treasure-chest"; }
