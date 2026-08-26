/**
 * HallTheme — Componentes decorativos do tema "Sala de Honra" medieval/mágico.
 * Fonte única de verdade para HallBackground, OrnamentDivider e Corner.
 * Importar em qualquer tela para aplicar a temática.
 */

import { coresDoDivisor } from "@/components/ornamentDividerColors";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import React from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import tinycolor from "tinycolor2";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export type HallPalette = ReturnType<typeof getProfileShellPalette>;

// ─── Posições fixas das estrelas/partículas de fundo ────────────────────────
export const HALL_STARS = [
  { x: 0.06, y: 0.05, r: 1.4 },
  { x: 0.91, y: 0.04, r: 1.8 },
  { x: 0.18, y: 0.14, r: 1.0 },
  { x: 0.78, y: 0.11, r: 1.2 },
  { x: 0.04, y: 0.28, r: 1.6 },
  { x: 0.96, y: 0.22, r: 1.0 },
  { x: 0.12, y: 0.42, r: 1.1 },
  { x: 0.87, y: 0.38, r: 1.4 },
  { x: 0.05, y: 0.6, r: 1.3 },
  { x: 0.93, y: 0.55, r: 1.6 },
  { x: 0.15, y: 0.72, r: 0.9 },
  { x: 0.83, y: 0.7, r: 1.2 },
  { x: 0.08, y: 0.88, r: 1.5 },
  { x: 0.9, y: 0.84, r: 1.1 },
  { x: 0.5, y: 0.07, r: 1.2 },
  { x: 0.35, y: 0.19, r: 0.8 },
  { x: 0.64, y: 0.24, r: 1.0 },
  { x: 0.45, y: 0.5, r: 0.9 },
  { x: 0.55, y: 0.78, r: 1.3 },
  { x: 0.3, y: 0.9, r: 1.0 },
  { x: 0.7, y: 0.93, r: 0.8 },
  { x: 0.22, y: 0.6, r: 0.7 },
  { x: 0.76, y: 0.62, r: 0.9 },
];

// ─── HallBackground ──────────────────────────────────────────────────────────
/**
 * Fundo decorativo do Salão Medieval.
 * Coloca-se como `StyleSheet.absoluteFill` com `pointerEvents="none"`.
 *
 * @param palette  Paleta de cores do perfil do usuário
 * @param height   Altura do SVG (padrão: altura da tela)
 */
export function HallBackground({
  palette,
  height = SCREEN_H,
}: {
  palette: HallPalette;
  height?: number;
}) {
  const gold = tinycolor(palette.accent).lighten(10).toHexString();
  const starColor = tinycolor(palette.accent).lighten(30).toHexString();

  return (
    <Svg
      width={SCREEN_W}
      height={height}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        {/* Padrão de losangos — textura de piso de salão */}
        <Pattern
          id="hallDiamondFloor"
          x="0"
          y="0"
          width="44"
          height="44"
          patternUnits="userSpaceOnUse"
        >
          <Path
            d="M 22 2 L 42 22 L 22 42 L 2 22 Z"
            fill="none"
            stroke={gold}
            strokeWidth="0.5"
            opacity="0.18"
          />
          <Circle cx="22" cy="22" r="1.4" fill={gold} opacity="0.1" />
        </Pattern>

        {/* Luz do candelabro no topo */}
        <SvgGradient id="hallTopLight" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={palette.accent} stopOpacity="0.18" />
          <Stop offset="35%" stopColor={palette.accent} stopOpacity="0.04" />
          <Stop offset="100%" stopColor={palette.background} stopOpacity="0" />
        </SvgGradient>

        {/* Vinheta lateral — paredes do salão */}
        <RadialGradient id="hallVignette" cx="50%" cy="48%" r="72%">
          <Stop offset="40%" stopColor="#000000" stopOpacity="0" />
          <Stop offset="100%" stopColor="#000000" stopOpacity="0.52" />
        </RadialGradient>

        {/* Brilho central — chão iluminado */}
        <RadialGradient id="hallFloorGlow" cx="50%" cy="60%" r="55%">
          <Stop offset="0%" stopColor={palette.accent} stopOpacity="0.07" />
          <Stop offset="100%" stopColor={palette.accent} stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Textura de piso */}
      <Rect width={SCREEN_W} height={height} fill="url(#hallDiamondFloor)" />

      {/* Luz do candelabro */}
      <Rect width={SCREEN_W} height={height} fill="url(#hallTopLight)" />

      {/* Brilho central */}
      <Rect width={SCREEN_W} height={height} fill="url(#hallFloorGlow)" />

      {/* Estrelas / partículas */}
      {HALL_STARS.map((s, i) => (
        <Circle
          key={i}
          cx={s.x * SCREEN_W}
          cy={s.y * height}
          r={s.r}
          fill={starColor}
          opacity={0.45 + (i % 3) * 0.15}
        />
      ))}

      {/* Colunas decorativas laterais */}
      <Path
        d={`M 14 80 L 14 ${height * 0.82}`}
        stroke={gold}
        strokeWidth="0.7"
        opacity="0.22"
      />
      <Path
        d={`M ${SCREEN_W - 14} 80 L ${SCREEN_W - 14} ${height * 0.82}`}
        stroke={gold}
        strokeWidth="0.7"
        opacity="0.22"
      />
      {/* Capitéis superiores */}
      <Path d="M 6 80 H 22" stroke={gold} strokeWidth="1.2" opacity="0.25" />
      <Path
        d={`M ${SCREEN_W - 22} 80 H ${SCREEN_W - 6}`}
        stroke={gold}
        strokeWidth="1.2"
        opacity="0.25"
      />
      {/* Bases inferiores */}
      <Path
        d={`M 6 ${height * 0.82} H 22`}
        stroke={gold}
        strokeWidth="1.2"
        opacity="0.25"
      />
      <Path
        d={`M ${SCREEN_W - 22} ${height * 0.82} H ${SCREEN_W - 6}`}
        stroke={gold}
        strokeWidth="1.2"
        opacity="0.25"
      />

      {/* Vinheta final */}
      <Rect width={SCREEN_W} height={height} fill="url(#hallVignette)" />
    </Svg>
  );
}

// ─── OrnamentDivider ─────────────────────────────────────────────────────────
/**
 * Divisor ornamental com fleur-de-lis e losangos flanqueados por linhas douradas.
 */
export function OrnamentDivider({
  color,
  opacidade,
}: {
  color: string;
  /**
   * Atenuacao do divisor. Use ISTO em vez de envolver o componente num
   * `<View style={{ opacity }}>`: no Android a opacidade promove a View a uma
   * camada de render propria, e os glifos da fonte de icone saem recortados ate
   * um repaint. Ver ornamentDividerColors.ts.
   */
  opacidade?: number;
}) {
  const { dim, bright } = coresDoDivisor(color, opacidade);

  // Desenhado em SVG, nao com glifos da fonte de icone.
  //
  // Com MaterialCommunityIcons o divisor de rodape do ranking aparecia
  // "quebrado" -- so as pontas dos losangos, sem as linhas --, e as duas
  // tentativas de explicar isso pela camada de opacidade e pelo contraste nao
  // resolveram. Glifo depende de carregamento de fonte e de metrica de texto,
  // que resolvem DEPOIS do primeiro layout; geometria nao depende de nada disso.
  // Como bonus, sai um arquivo de fonte do caminho critico deste ornamento.
  return (
    <View style={ornStyles.row}>
      <View style={[ornStyles.line, { backgroundColor: dim }]} />
      <Svg width={78} height={20} viewBox="0 0 78 20">
        {/* losangos pequenos das pontas */}
        <Path d="M4 10 L7 7 L10 10 L7 13 Z" fill={dim} />
        <Path d="M68 10 L71 7 L74 10 L71 13 Z" fill={dim} />
        {/* losangos grandes */}
        <Path d="M15 10 L20 5 L25 10 L20 15 Z" fill={bright} />
        <Path d="M53 10 L58 5 L63 10 L58 15 Z" fill={bright} />
        {/* flor-de-lis simplificada: petala central + duas laterais e a haste.
            Em 20px de altura o desenho detalhado vira borrao, entao a silhueta
            reconhecivel vale mais que a fidelidade. */}
        <Path
          d="M39 2 C41.6 5 41.6 8 39 10.6 C36.4 8 36.4 5 39 2 Z"
          fill={bright}
        />
        <Path
          d="M39 11 C35.4 8.6 31.8 9.4 31 12.4 C33.2 14.6 37 14.2 39 11 Z"
          fill={bright}
        />
        <Path
          d="M39 11 C42.6 8.6 46.2 9.4 47 12.4 C44.8 14.6 41 14.2 39 11 Z"
          fill={bright}
        />
        <Rect x={38.2} y={10} width={1.6} height={7} rx={0.8} fill={bright} />
        <Rect x={34.6} y={15.4} width={8.8} height={1.6} rx={0.8} fill={bright} />
      </Svg>
      <View style={[ornStyles.line, { backgroundColor: dim }]} />
    </View>
  );
}

const ornStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginVertical: 6,
    // Altura explicita continua valendo: o SVG tem altura propria (20), mas a
    // linha de 1px sozinha nao sustentaria a fileira se o SVG falhasse.
    minHeight: 22,
  },
  line: { flex: 1, height: 1 },
});

// ─── Corner ──────────────────────────────────────────────────────────────────
/**
 * Canto ornamental em forma de L (14×14 px, borda dourada).
 * Usar 4 instâncias nas posições TL, TR, BL, BR de um card.
 */
export function Corner({
  pos,
  color,
}: {
  pos: "TL" | "TR" | "BL" | "BR";
  color: string;
}) {
  const size = 14;
  const offset = 6;
  const base: any = { position: "absolute", width: size, height: size };
  if (pos === "TL") {
    base.top = offset;
    base.left = offset;
    base.borderTopWidth = 1.5;
    base.borderLeftWidth = 1.5;
  }
  if (pos === "TR") {
    base.top = offset;
    base.right = offset;
    base.borderTopWidth = 1.5;
    base.borderRightWidth = 1.5;
  }
  if (pos === "BL") {
    base.bottom = offset;
    base.left = offset;
    base.borderBottomWidth = 1.5;
    base.borderLeftWidth = 1.5;
  }
  if (pos === "BR") {
    base.bottom = offset;
    base.right = offset;
    base.borderBottomWidth = 1.5;
    base.borderRightWidth = 1.5;
  }
  return <View style={[base, { borderColor: color, opacity: 0.7 }]} />;
}
