import { ProfileArtwork } from "@/components/ProfileArtwork";
import { journeyObjects } from "@/constants/designAssets";

export function GuildIcon({
  size = 28,
}: {
  color: string;
  size?: number;
}) {
  return (
    <ProfileArtwork source={journeyObjects.community} color="#ffffff" width={size} />
  );
}

export function AchievementIcon({
  size = 24,
}: {
  color: string;
  size?: number;
}) {
  return (
    <ProfileArtwork source={journeyObjects.gold} color="#ffffff" width={size} />
  );
}
