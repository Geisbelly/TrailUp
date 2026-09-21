import { getBrainHexConfig } from "@/constants/profileImages";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";
import { buildProfileShellPaletteFromAccent, resolveSystemVisualTheme, type ProfileShellPalette } from "./profileShellPalette";

export { buildProfileShellPaletteFromAccent, resolveSystemVisualTheme } from "./profileShellPalette";
export type { ProfileShellPalette, SystemVisualTheme } from "./profileShellPalette";

export function getProfileShellPalette(profileName?: string | null): ProfileShellPalette {
  const config = getBrainHexConfig(profileName ?? undefined);
  const theme = resolveSystemVisualTheme(profileName);
  return {
    ...buildProfileShellPaletteFromAccent(config.color, theme),
    profile: normalizeBrainHexProfile(profileName) ?? undefined,
  };
}
