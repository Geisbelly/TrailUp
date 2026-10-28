// src/components/trilhas/common/GameHeader.tsx
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { ProfileShellPalette } from "@/utils/profileShellTheme";
import { Design } from "@/styles/design";
import React from "react";
import { Image, ImageSourcePropType, StyleSheet, Text, View } from "react-native";
import tinycolor from "tinycolor2";

type Props = {
  titulo: string;
  subtitulo: string;
  xp?: number;
  meta?: number;
  rightSlot?: React.ReactNode;
  palette?: ProfileShellPalette | null;
  progressTargetRef?: React.RefObject<View | null>;
  /** Emblema do perfil (32px), à esquerda do título. */
  emblema?: ImageSourcePropType;
  /** Texto ao lado do percentual, por exemplo "4 de 8 módulos". Com `contagemAviso`, vira o chip de aviso. */
  contagem?: string;
  contagemAviso?: boolean;
};

export const GameHeader = ({
  titulo,
  subtitulo,
    xp = 0,
    meta = 100,
  rightSlot,
  palette = null,
  progressTargetRef,
  emblema,
  contagem,
  contagemAviso = false,
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
      <View style={s.titleRow}>
        {emblema ? <Image source={emblema} style={s.emblema} resizeMode="contain" accessible={false} /> : null}
        <View style={s.titleBlock}>
          {subtitulo ? (
            <Text
              style={[s.sub, palette ? { color: palette.textSubtle } : null]}
            >
              {subtitulo.toUpperCase()}
            </Text>
          ) : null}
          <Text numberOfLines={1} ellipsizeMode="tail" style={[s.title, palette ? { color: palette.text } : null]}>
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
          {Math.round(progresso * 100)}%{contagem && !contagemAviso ? ` · ${contagem}` : ""}
        </Text>
        {contagem && contagemAviso ? (
          <View style={[s.aviso, palette ? { borderColor: palette.border } : null]}>
            <Text style={[s.avisoTexto, palette ? { color: palette.textMuted } : null]}>{contagem}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 6,
    overflow: "hidden",
    backgroundColor: Color.background,
    borderBottomWidth: 1,
    borderColor: Color.colorDarkslategray,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 56,
  },
  emblema: { width: 32, height: 32 },
  aviso: { marginLeft: 8, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  avisoTexto: { fontSize: 12, fontFamily: FontFamily.interMedium },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  rightSlot: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  xpBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
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
    fontSize: 13,
    fontFamily: FontFamily.interMedium,
  },
  sub: {
    color: Color.colorSlategray,
    letterSpacing: 0,
    fontSize: 11,
    fontFamily: FontFamily.interMedium,
  },
  title: {
    color: Color.colorAliceblue,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: "Georgia, serif",
  },
});
