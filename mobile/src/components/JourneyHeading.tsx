import { Color, FontFamily } from "@/styles/GlobalStyle";
import { ProfileArtwork } from "@/components/ProfileArtwork";
import { JourneySymbol, type JourneySection } from "@/components/JourneySymbol";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import {
  type ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ReactNode } from "react";

type Props = {
  title: string;
  eyebrow?: string;
  artwork?: ImageSourcePropType;
  section?: JourneySection;
  palette: ProfileShellPalette;
  right?: ReactNode;
};

export function JourneyHeading({
  title,
  eyebrow,
  artwork,
  section,
  palette,
  right,
}: Props) {
  return (
    <View style={[styles.root, { borderBottomColor: palette.border }]}>
      {section ? (
        <JourneySymbol section={section} size={58} />
      ) : artwork ? <ProfileArtwork
        source={artwork}
        // Artes de seções compartilhadas (Social, notificações e Bag) não
        // devem competir com o tom do perfil; branco mantém contraste.
        color={Color.colorWhite}
        width={58}
        height={64}
        style={styles.art}
      /> : null}
      <View style={styles.copy}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: palette.accent }]}>
            {eyebrow}
          </Text>
        ) : null}
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  art: { width: 58, height: 64 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: {
    fontFamily: FontFamily.interMedium,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0,
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: 0,
  },
});
