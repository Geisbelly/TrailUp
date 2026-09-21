import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { designStar } from "@/constants/designAssets";
import { Design } from "@/styles/design";
import { FontFamily } from "@/styles/GlobalStyle";
import { ProfileArtwork } from "@/components/ProfileArtwork";

type Props = {
  title: string;
  description?: string;
  /** Cor de destaque do perfil BrainHex ativo (ex.: profilePalette.accent). */
  accentColor?: string;
};

const CardSemDados: React.FC<Props> = React.memo(({ title, description = "", accentColor }) => {
  return (
    <View style={styles.wrapper}>
      <ProfileArtwork source={designStar} color={accentColor ?? Design.primary} width={64} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{description}</Text>
    </View>
  );
});

CardSemDados.displayName = "CardSemDados";

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    minHeight: 260,
    paddingHorizontal: 24,
    gap: 14,
  },
  emptyText: {
    color: Design.muted,
    fontFamily: FontFamily.interMedium,
    lineHeight: 21,
    fontSize: 14,
    textAlign: "center",
  },
  emptyTitle: {
    color: Design.text,
    fontFamily: FontFamily.inikaBold,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
});

export default CardSemDados;
