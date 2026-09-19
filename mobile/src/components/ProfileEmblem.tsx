import { StyleSheet, View } from "react-native";
import { ProfileArtwork } from "@/components/ProfileArtwork";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { profileEmblems } from "@/constants/designAssets";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";

/** The shape identifies the person; the active journey controls its tone. */
export function ProfileEmblem({ profile, toneProfile = profile, size = 52 }: { profile?: string | null; toneProfile?: string | null; size?: number }) {
  const key = normalizeBrainHexProfile(profile);
  return (
    <View style={[styles.root, { width: size, height: size }]} pointerEvents="none" accessible={false}>
      {key ? <ProfileArtwork source={profileEmblems[key]} profile={toneProfile} width={size - 6} />
        : <MaterialCommunityIcons name="account-outline" size={size * 0.55} color="#ffffff" />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexShrink: 0, borderRadius: 12, backgroundColor: "#11131d", borderColor: "#ffffff40", borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
