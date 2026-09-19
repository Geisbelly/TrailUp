import { View } from "react-native";
import { ProfileArtwork } from "@/components/ProfileArtwork";
import { journeyObjects, profileEmblems } from "@/constants/designAssets";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";

const symbols = { social: journeyObjects.community, ranking: journeyObjects.trophy, notifications: journeyObjects.bell, achievements: journeyObjects.gold, bag: journeyObjects.bag };
export type JourneySection = keyof typeof symbols;

/** Detailed shared art stays white; the inset emblem follows the active profile. */
export function JourneySymbol({ profile, section, size = 58 }: {
  profile?: string | null;
  section: JourneySection;
  size?: number;
}) {
  const key = normalizeBrainHexProfile(profile);
  const badgeSize = Math.round(size * 0.4);
  return (
    <View pointerEvents="none" accessible={false} style={{ width: size, height: size, flexShrink: 0 }}>
      <ProfileArtwork source={symbols[section]} color="#ffffff" width={size} height={size} />
      {key && section !== "achievements" ? <View style={{ position: "absolute", bottom: 0, right: -3, borderRadius: badgeSize / 2, backgroundColor: "#11131d", borderColor: "#ffffff50", borderWidth: 1, padding: 2 }}>
        <ProfileArtwork source={profileEmblems[key]} profile={profile} width={badgeSize} />
      </View> : null}
    </View>
  );
}
