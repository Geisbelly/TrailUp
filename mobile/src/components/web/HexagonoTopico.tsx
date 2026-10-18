import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import tinycolor from "tinycolor2";

import { caminhoHexagono } from "@/utils/mapaPaises";
import type { EstadoTopico } from "@/utils/painelTopicoTrilha";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { FONTE_TITULO_TRILHA } from "@/components/web/fonteCinzel";

const HEX_FORA = caminhoHexagono(50, 50, 46, 9);
const HEX_DENTRO = caminhoHexagono(50, 50, 37, 7);
const HEX_SELECAO = caminhoHexagono(50, 50, 53, 11);

/**
 * Hexágono de um tópico da Trilha na web em tela larga (#346, protótipo v4,
 * `hexSVG`): degradê e borda por estado, com ✓, cadeado ou o número.
 * `idBase` precisa ser único na página (vira id de gradiente).
 */
export function HexagonoTopico({
  estado,
  numero,
  tamanho,
  palette,
  idBase,
  selecionado = false,
}: {
  estado: EstadoTopico;
  numero: number;
  tamanho: number;
  palette: ProfileShellPalette;
  idBase: string;
  selecionado?: boolean;
}) {
  const bg = palette.background;
  const accentHi = tinycolor(palette.accent).lighten(10).toRgbString();
  const elevHi = tinycolor(palette.surfaceElevated).lighten(5).toRgbString();
  const accentSoft = tinycolor(palette.accent).setAlpha(0.18).toRgbString();
  const hex = {
    done: { de: palette.accent, ate: palette.accentStrong, stroke: accentHi, sw: 2, dentro: "rgba(255,255,255,0.28)", glifo: bg, brilho: true, dash: undefined },
    current: { de: accentHi, ate: palette.accent, stroke: palette.text, sw: 3, dentro: "rgba(255,255,255,0.45)", glifo: bg, brilho: true, dash: undefined },
    open: { de: elevHi, ate: palette.surface, stroke: palette.accent, sw: 2, dentro: accentSoft, glifo: palette.text, brilho: false, dash: undefined },
    locked: { de: palette.surface, ate: bg, stroke: palette.border, sw: 2, dentro: "rgba(255,255,255,0.05)", glifo: palette.inactive, brilho: false, dash: "5 5" },
  }[estado];
  const glifo = Math.round(tamanho * 0.34);

  return (
    <View style={{ width: tamanho, height: tamanho }}>
      <Svg width={tamanho} height={tamanho} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={idBase} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={hex.de} />
            <Stop offset="1" stopColor={hex.ate} />
          </LinearGradient>
          <LinearGradient id={`${idBase}-brilho`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.35} />
            <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {selecionado ? <Path d={HEX_SELECAO} fill="none" stroke={palette.text} strokeWidth={2} strokeDasharray="3 5" /> : null}
        <Path d={HEX_FORA} fill={`url(#${idBase})`} stroke={hex.stroke} strokeWidth={hex.sw} strokeDasharray={hex.dash} />
        <Path d={HEX_DENTRO} fill="none" stroke={hex.dentro} strokeWidth={1.5} />
        {hex.brilho ? <Path d={HEX_DENTRO} fill={`url(#${idBase}-brilho)`} opacity={0.55} /> : null}
      </Svg>
      <View style={s.glifo} pointerEvents="none">
        {estado === "done" ? (
          <MaterialCommunityIcons name="check-bold" size={glifo} color={hex.glifo} />
        ) : estado === "locked" ? (
          <MaterialCommunityIcons name="lock-outline" size={glifo} color={hex.glifo} />
        ) : (
          <Text style={[s.numero, { color: hex.glifo, fontSize: Math.round(tamanho * 0.36), lineHeight: Math.round(tamanho * 0.4) }]}>{numero}</Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  glifo: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  numero: { fontFamily: FONTE_TITULO_TRILHA },
});
