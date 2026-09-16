// src/components/trilhas/common/GameHeader.tsx
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { ProfileShellPalette } from "@/utils/profileShellTheme";
import { designStar } from "@/constants/designAssets";
import { ProfileArtwork } from "@/components/ProfileArtwork";
import { Design } from "@/styles/design";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import tinycolor from "tinycolor2";

type Props = {
  titulo: string;
  subtitulo: string;
  xp?: number;
  meta?: number;
  rightSlot?: React.ReactNode;
  palette?: ProfileShellPalette | null;
  progressTargetRef?: React.RefObject<View | null>;
};

export const GameHeader = ({
  titulo,
  subtitulo,
    xp = 0,
    meta = 100,
  rightSlot,
  palette = null,
  progressTargetRef,
}: Props) => {
  const divisor = meta > 0 ? meta : 1;
  const progresso = Math.min(1, Math.max(0, xp / divisor));

  return (
    <View
      style={[
        s.root,
        palette
          ? {
              backgroundColor: tinycolor(palette.background).setAlpha(0.88).toRgbString(),
              borderColor: palette.border,
            }
          : null,
      ]}
    >
      <View style={s.brandRow}>
        <ProfileArtwork source={designStar} color={palette?.accent ?? Design.primary} width={22} />
        <Text style={[s.brand, { color: palette?.accent ?? Design.primary }]}>TrailUp</Text>
      </View>
      <View style={s.titleRow}>
        <View style={s.titleBlock}>
          {subtitulo ? (
            <Text
              style={[s.sub, palette ? { color: palette.textSubtle } : null]}
            >
              {subtitulo.toUpperCase()}
            </Text>
          ) : null}
          <Text style={[s.title, palette ? { color: palette.text } : null]}>
            {titulo}
          </Text>
        </View>
        {rightSlot ? <View style={s.rightSlot}>{rightSlot}</View> : null}
      </View>
      <View ref={progressTargetRef} collapsable={false} style={s.xpRow} accessibilityRole="progressbar" accessibilityLabel="Progresso da trilha" accessibilityValue={{ min: 0, max: 100, now: Math.round(progresso * 100) }}>
        <View
          style={[
            s.xpBarTrack,
            palette
              ? {
                  backgroundColor: palette.progressTrack,
                  borderColor: palette.border,
                }
              : null,
          ]}
        >
          <View
            style={[
              s.xpBarFill,
              { width: `${progresso * 100}%` },
              { backgroundColor: palette?.accent ?? Design.primary },
            ]}
          />
        </View>
        <Text style={[s.xpText, palette ? { color: palette.textMuted } : null]}>
          {Math.round(progresso * 100)}%
        </Text>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 12,
    overflow: "hidden",
    backgroundColor: Color.background,
    borderBottomWidth: 1,
    borderColor: Color.colorDarkslategray,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandMark: { width: 22, height: 22 },
  brand: { fontFamily: FontFamily.inikaBold, fontSize: 15, color: Design.gold },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  rightSlot: {
    alignItems: "flex-end",
    justifyContent: "center",
    paddingTop: 6,
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  xpBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: Color.colorAliceblue200,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
  },
  xpBarFill: {
    height: "100%",
    backgroundColor: Color.colorSlategray,
    borderRadius: 1,
  },
  xpText: {
    color: Color.colorAliceblue300,
    fontSize: 14,
    fontFamily: FontFamily.interMedium,
  },
  sub: {
    color: Color.colorSlategray,
    letterSpacing: 0,
    fontSize: 12,
    marginTop: 6,
    fontFamily: FontFamily.interMedium,
  },
  title: {
    color: Color.colorAliceblue,
    fontSize: 22,
    lineHeight: 28,
    marginTop: 2,
    fontFamily: FontFamily.poppinsExtraBold,
  },
});
