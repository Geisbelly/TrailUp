import type { ImageSourcePropType } from "react-native";
import { journeyObjects } from "./designAssets";
import { achievementArtKey } from "@/utils/achievementArtwork";

export function getAchievementArtwork(
  achievement?: { tipo?: string | null; icone_url?: string | null } | null,
): ImageSourcePropType {
  return achievement?.icone_url
    ? { uri: achievement.icone_url }
    : journeyObjects[achievementArtKey(achievement?.tipo)];
}
