import { BrainHexProfile, normalizeBrainHexProfile } from "@/constants/profileImages";

type BrainHexPerfilLike = {
  nome?: string | null;
  perfil?: string | null;
  afinidade?: number | null;
};

const COMBAT_PROFILES: BrainHexProfile[] = ["survivor"];
const SECONDARY_SIGNAL_INDEX = 1;
const DEFAULT_SIGNAL_THRESHOLD = 20;

type RankedBrainHexProfile = {
  index: number;
  afinidade: number;
  profile: BrainHexProfile;
};

export function rankBrainHexProfiles(
  perfis?: BrainHexPerfilLike[] | null
): RankedBrainHexProfile[] {
  if (!Array.isArray(perfis) || perfis.length === 0) {
    return [];
  }

  return perfis
    .map((perfil, index) => ({
      index,
      afinidade: Number(perfil?.afinidade ?? 0),
      profile: normalizeBrainHexProfile(perfil?.nome ?? perfil?.perfil),
    }))
    .filter((entry): entry is RankedBrainHexProfile => Boolean(entry.profile))
    .sort((left, right) => {
      if (right.afinidade !== left.afinidade) {
        return right.afinidade - left.afinidade;
      }
      return left.index - right.index;
    });
}

export function resolveDominantBrainHexProfile(
  perfis?: BrainHexPerfilLike[] | null,
  fallback: BrainHexProfile = "seeker"
): BrainHexProfile {
  return rankBrainHexProfiles(perfis)[0]?.profile ?? fallback;
}

export function hasBrainHexProfileSignal(
  perfis: BrainHexPerfilLike[] | null | undefined,
  target: BrainHexProfile,
  threshold = DEFAULT_SIGNAL_THRESHOLD
) {
  const ranked = rankBrainHexProfiles(perfis);
  if (!ranked.length) return false;

  return ranked.some((entry, index) => {
    if (entry.profile !== target) return false;
    const hasMeaningfulAffinity = entry.afinidade > 0;
    return (
      ((index === 0 || index === SECONDARY_SIGNAL_INDEX) && hasMeaningfulAffinity) ||
      entry.afinidade >= threshold
    );
  });
}

export function hasAnyBrainHexProfileSignal(
  perfis: BrainHexPerfilLike[] | null | undefined,
  targets: BrainHexProfile[],
  threshold = DEFAULT_SIGNAL_THRESHOLD
) {
  return targets.some((target) => hasBrainHexProfileSignal(perfis, target, threshold));
}

export function isCombatBrainHexProfile(profile?: BrainHexProfile | null) {
  return profile != null && COMBAT_PROFILES.includes(profile);
}
