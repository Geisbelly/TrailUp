import { Color, FontFamily } from "@/styles/GlobalStyle";
import { ProfileArtwork } from "@/components/ProfileArtwork";
import { JourneySymbol, type JourneySection } from "@/components/JourneySymbol";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import {
  type ImageSourcePropType,
  StyleSheet,
  Text,
  useWindowDimensions,
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
  // Tela estreita (menos de 360): símbolo e título menores, nas mesmas proporções.
  // Com 25 px ao lado do símbolo de 58 e das ações, "Notificações" não cabia em
  // 320 px e quebrava no meio da palavra ("Notificaç / es").
  const compacto = useWindowDimensions().width < 360;
  const simbolo = compacto ? 48 : 58;
  return (
    <View style={[styles.root, compacto && styles.rootCompacto, { borderBottomColor: palette.border }]}>
      {section ? (
        <JourneySymbol section={section} size={simbolo} />
      ) : artwork ? <ProfileArtwork
        source={artwork}
        // Artes de seções compartilhadas (Social, notificações e Bag) não
        // devem competir com o tom do perfil; branco mantém contraste.
        color={Color.colorWhite}
        width={simbolo}
        height={Math.round(simbolo * 64 / 58)}
        style={{ width: simbolo, height: Math.round(simbolo * 64 / 58) }}
      /> : null}
      <View style={styles.copy}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: palette.accent }]}>
            {eyebrow}
          </Text>
        ) : null}
        <Text style={[styles.title, compacto && styles.titleCompacto, { color: palette.text }]}>{title}</Text>
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
  rootCompacto: { gap: 10 },
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
  titleCompacto: { fontSize: 22, lineHeight: 27 },
});
