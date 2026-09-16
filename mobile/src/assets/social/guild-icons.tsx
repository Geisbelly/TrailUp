import { ProfileArtwork } from "@/components/ProfileArtwork";
import { journeyObjects } from "@/constants/designAssets";

export function GuildIcon({
  color,
  size = 28,
}: {
  color: string;
  size?: number;
}) {
  return (
    <ProfileArtwork
      source={journeyObjects.community}
      color={color}
      width={size}
    />
  );
}

export function AchievementIcon({
  color,
  size = 24,
}: {
  color: string;
  size?: number;
}) {
  return (
    <ProfileArtwork source={journeyObjects.gold} color={color} width={size} />
  );
}
