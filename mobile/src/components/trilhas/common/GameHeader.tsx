// src/components/trilhas/common/GameHeader.tsx
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { ProfileShellPalette } from "@/utils/profileShellTheme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  titulo: string;
  subtitulo: string;
  xp?: number;
  meta?: number;
  rightSlot?: React.ReactNode;
  palette?: ProfileShellPalette | null;
};

export const GameHeader = ({
  titulo,
  subtitulo,
  xp = 120,
  meta = 200,
  rightSlot,
  palette = null,
}: Props) => {
  const divisor = meta > 0 ? meta : 1;
  const progresso = Math.min(1, Math.max(0, xp / divisor));

  return (
    <View
      style={[
        s.root,
        palette
          ? {
              backgroundColor: palette.background,
              borderColor: palette.border,
            }
          : null,
      ]}
    >
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
      <View style={s.xpRow}>
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
              palette ? { backgroundColor: palette.accent } : null,
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
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: Color.background,
    borderBottomWidth: 1,
    borderColor: Color.colorDarkslategray,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  titleBlock: {
    flex: 1,
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
    height: 12,
    borderRadius: 12,
    backgroundColor: Color.colorAliceblue200,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
  },
  xpBarFill: {
    height: "100%",
    backgroundColor: Color.colorSlategray,
    borderRadius: 12,
  },
  xpText: {
    color: Color.colorAliceblue300,
    fontSize: 14,
    fontFamily: FontFamily.interMedium,
  },
  sub: {
    color: Color.colorSlategray,
    letterSpacing: 2,
    fontSize: 12,
    marginTop: 6,
    fontFamily: FontFamily.interMedium,
  },
  title: {
    color: Color.colorAliceblue,
    fontSize: 24,
    marginTop: 2,
    fontFamily: FontFamily.poppinsExtraBold,
  },
});
