import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import { profileUtilityIcons } from "@/constants/profileUtilityIcons";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";
import { useUsuario } from "@/context/SessaoContext";
import { resolveActiveBrainHexProfile } from "@/utils/brainHex";

export type UtilityIconKind = keyof typeof profileUtilityIcons;

type Props = {
  kind: UtilityIconKind;
  size?: number;
  height?: number;
  profile?: string | null;
  style?: StyleProp<ViewStyle>;
};

/** Original artwork follows the active guide, preserving its colors and transparency. */
export function UtilityIcon({ kind, size = 34, height = size, profile: profileOverride, style }: Props) {
  const { usuario } = useUsuario();
  const profile = normalizeBrainHexProfile(profileOverride) ??
    resolveActiveBrainHexProfile(usuario?.perfis, usuario?.perfilAtivo);
  return (
    <View pointerEvents="none" style={[{ width: size, height, flexShrink: 0 }, style]}>
      <Image source={profileUtilityIcons[kind][profile]} resizeMode="contain" accessible={false} style={{ width: "100%", height: "100%" }} />
    </View>
  );
}
