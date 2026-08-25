import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

type MapNode = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  emblem: string;
  locked: boolean;
  completed: boolean;
  current: boolean;
  sequence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  territoryPath: string;
  plateX: number;
  plateY: number;
  plateWidth: number;
};

const MAX_MAP_DIM_PX = 4096;
const MAX_MAP_AREA_PX = 12_000_000;

function buildCountryPath(
  x: number,
  y: number,
  width: number,
  height: number,
  variant: number,
) {
  const topRise = 16 + (variant % 4) * 5;
  const rightPush = 18 + ((variant + 1) % 4) * 5;
  const bottomDrop = 16 + ((variant + 2) % 4) * 5;
  const leftBend = 20 + ((variant + 3) % 3) * 5;

  return [
    `M ${x + width * 0.14} ${y + topRise}`,
    `C ${x + width * 0.3} ${y - 20}, ${x + width * 0.58} ${y - 16}, ${x + width * 0.84} ${y + topRise * 0.72}`,
    `C ${x + width + rightPush} ${y + height * 0.24}, ${x + width + rightPush} ${y + height * 0.58}, ${x + width * 0.82} ${y + height - 12}`,
    `C ${x + width * 0.68} ${y + height + bottomDrop}, ${x + width * 0.32} ${y + height + bottomDrop}, ${x + leftBend} ${y + height - 4}`,
    `C ${x - leftBend} ${y + height * 0.68}, ${x - leftBend} ${y + height * 0.26}, ${x + width * 0.14} ${y + topRise}`,
    "Z",
  ].join(" ");
}

function buildRoutePath(from: MapNode, to: MapNode) {
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX   = to.x   + to.width  / 2;
  const endY   = to.y   + to.height / 2;
  const controlX = (startX + endX) / 2;
  return `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
}

function buildLatitudeLine(width: number, y: number, wave: number) {
  return `M 0 ${y} C ${width * 0.2} ${y + wave}, ${width * 0.4} ${y - wave}, ${width * 0.6} ${y + wave}
    C ${width * 0.76} ${y + wave * 0.5}, ${width * 0.88} ${y - wave}, ${width} ${y}`;
}

function buildContinentBackdrop(
  width: number,
  height: number,
  variant: number,
) {
  if (variant === 0) {
    return `M ${width * 0.04} ${height * 0.24}
      C ${width * 0.16} ${height * 0.06}, ${width * 0.3} ${height * 0.04}, ${width * 0.38} ${height * 0.24}
      C ${width * 0.44} ${height * 0.4}, ${width * 0.32} ${height * 0.56}, ${width * 0.16} ${height * 0.54}
      C ${width * 0.06} ${height * 0.5}, ${width * 0.01} ${height * 0.36}, ${width * 0.04} ${height * 0.24} Z`;
  }

  return `M ${width * 0.58} ${height * 0.14}
    C ${width * 0.76} ${height * 0.02}, ${width * 0.94} ${height * 0.14}, ${width * 0.92} ${height * 0.34}
    C ${width * 0.9} ${height * 0.56}, ${width * 0.72} ${height * 0.64}, ${width * 0.56} ${height * 0.5}
    C ${width * 0.46} ${height * 0.4}, ${width * 0.46} ${height * 0.22}, ${width * 0.58} ${height * 0.14} Z`;
}

export function TrilhaMapaHeroStable() {
  const { grafo, mapTheme } = useTrilha();
  const { usuario } = useUsuario();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const shellPalette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis],
  );

  const nodes = useMemo<MapNode[]>(() => {
    const territoryWidth = 216;
    const territoryHeight = 154;
    const plateWidth = 150;
    const paddingX = 48;
    const paddingY = 100;
    const cellH = 200;

    const allNodes = grafo.levels.flatMap((level) => level);
    const currentId =
      allNodes.find((node) => !node.locked && !node.completed)?.id ??
      allNodes.find((node) => !node.locked)?.id ??
      null;

    // Sort nodes globally by sequence for left-to-right, top-to-bottom grid
    const sortedNodes = [...allNodes].sort(
      (a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0),
    );

    const availWidth = Math.max(screenWidth, 360) - paddingX * 2;
    const gridCols = Math.max(2, Math.floor(availWidth / 270));
    const cellW = Math.max(270, availWidth / gridCols);

    return sortedNodes.map((node, flatIndex) => {
      const col = flatIndex % gridCols;
      const row = Math.floor(flatIndex / gridCols);
      const country = mapTheme?.countries[node.id];
      const driftX = Math.sin((flatIndex + 1) * 0.82 + col * 0.4) * 22;
      const driftY = Math.cos((col + 1) * 0.72 + row * 0.4) * 18;
      const x = paddingX + col * cellW + driftX;
      const y = paddingY + row * cellH + driftY;

      // Find which column/level this node belongs to for variant
      const levelIndex = grafo.levels.findIndex((level) =>
        level.some((n) => n.id === node.id),
      );
      const rowIndex = grafo.levels[levelIndex]?.findIndex(
        (n) => n.id === node.id,
      ) ?? 0;

      return {
        id: String(node.id),
        title: country?.countryName ?? node.titulo,
        subtitle: country?.capitalName ?? node.titulo,
        badge: node.completed
          ? "Concluído"
          : node.locked
            ? "Bloqueado"
            : String(node.badgeLabel ?? "Disponível"),
        emblem: country?.emblem ?? "map-marker-radius",
        locked: Boolean(node.locked),
        completed: Boolean(node.completed),
        current: String(currentId) === String(node.id) && !node.locked,
        sequence: Number(node.sequence ?? flatIndex + 1),
        x,
        y,
        width: territoryWidth,
        height: territoryHeight,
        territoryPath: buildCountryPath(
          x,
          y,
          territoryWidth,
          territoryHeight,
          levelIndex + rowIndex,
        ),
        plateX: x + (territoryWidth - plateWidth) / 2,
        plateY: y + 40,
        plateWidth,
      };
    });
  }, [grafo.levels, mapTheme, screenWidth]);

  const worldWidth = useMemo(() => {
    if (!nodes.length) return screenWidth;
    return Math.max(screenWidth, ...nodes.map((node) => node.x + node.width + 48));
  }, [nodes, screenWidth]);

  const worldHeight = useMemo(() => {
    if (!nodes.length) return screenHeight;
    return Math.max(screenHeight - 24, ...nodes.map((node) => node.y + node.height + 120));
  }, [nodes, screenHeight]);

  const mapScale = useMemo(() => {
    const byDim = Math.min(
      1,
      MAX_MAP_DIM_PX / Math.max(worldWidth, 1),
      MAX_MAP_DIM_PX / Math.max(worldHeight, 1),
    );
    const byArea = Math.min(
      1,
      Math.sqrt(MAX_MAP_AREA_PX / Math.max(worldWidth * worldHeight, 1)),
    );
    return Math.min(byDim, byArea);
  }, [worldHeight, worldWidth]);

  const canvasWidth = Math.max(1, Math.round(worldWidth * mapScale));
  const canvasHeight = Math.max(1, Math.round(worldHeight * mapScale));

  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node] as const)),
    [nodes],
  );

  const palette = {
    backgroundTop: shellPalette.background,
    backgroundBottom: shellPalette.surfaceElevated,
    sea: shellPalette.surface,
    seaDeep: shellPalette.background,
    route: shellPalette.accent,
    routeGlow: shellPalette.accentSoft,
    countryLocked: shellPalette.surface,
    countryOpen: shellPalette.accentMuted,
    countryDone: shellPalette.accentStrong,
    countryCurrent: shellPalette.accent,
    borderLocked: shellPalette.border,
    borderOpen: shellPalette.borderStrong,
    borderDone: shellPalette.accent,
    borderCurrent: shellPalette.text,
    marker: shellPalette.surfaceElevated,
    markerText: shellPalette.background,
    textPrimary: shellPalette.text,
    textSecondary: shellPalette.textMuted,
    panelBg: shellPalette.surfaceElevated,
    panelBorder: shellPalette.borderStrong,
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.seaDeep }]}>
      <View
        style={[
          styles.headerCard,
          {
            backgroundColor: palette.panelBg,
            borderColor: palette.panelBorder,
          },
        ]}
      >
        <Text style={[styles.headerEyebrow, { color: palette.textSecondary }]}>
          Mapa da jornada
        </Text>

        <Text style={[styles.headerBody, { color: palette.textSecondary }]}>
          {mapTheme?.worldSubtitle ??
            "Cada módulo aparece como um país navegável. Siga as rotas para explorar a trilha como um mapa-múndi acadêmico."}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={{ width: canvasWidth, height: canvasHeight }}>
            <Svg
              width={canvasWidth}
              height={canvasHeight}
              viewBox={`0 0 ${worldWidth} ${worldHeight}`}
              style={StyleSheet.absoluteFill}
            >
              <Defs>
                {/* ── Fundo oceano ── */}
                <LinearGradient id="oceanBackground" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%"   stopColor={palette.backgroundTop} />
                  <Stop offset="52%"  stopColor={palette.sea} />
                  <Stop offset="100%" stopColor={palette.backgroundBottom} />
                </LinearGradient>
                {/* ── Rotas ── */}
                <LinearGradient id="routeActive" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%"   stopColor={palette.routeGlow} />
                  <Stop offset="100%" stopColor={palette.route} />
                </LinearGradient>
                {/* ── Brilho do globo: ponto de luz no canto superior-esquerdo ── */}
                <RadialGradient id="globeSheen" cx="30%" cy="22%" r="70%">
                  <Stop offset="0%"   stopColor="#ffffff" stopOpacity="0.22" />
                  <Stop offset="45%"  stopColor="#ffffff" stopOpacity="0.05" />
                  <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </RadialGradient>
                {/* ── Vinheta nas bordas (profundidade de globo) ── */}
                <RadialGradient id="globeVignette" cx="50%" cy="50%" r="72%">
                  <Stop offset="38%"  stopColor="#000000" stopOpacity="0" />
                  <Stop offset="100%" stopColor="#000000" stopOpacity="0.42" />
                </RadialGradient>
              </Defs>

              {/* Oceano base */}
              <Path
                d={`M 0 0 H ${worldWidth} V ${worldHeight} H 0 Z`}
                fill="url(#oceanBackground)"
              />

              {/* Brilho globo (luz incidente) */}
              <Path
                d={`M 0 0 H ${worldWidth} V ${worldHeight} H 0 Z`}
                fill="url(#globeSheen)"
              />

              {/* ── Linhas de latitude (10 paralelas) ── */}
              {[0.07, 0.16, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.84, 0.93].map((line, index) => (
                <Path
                  key={`lat-${line}`}
                  d={buildLatitudeLine(worldWidth, worldHeight * line, 7 + index * 2.5)}
                  stroke={palette.routeGlow}
                  strokeOpacity={index === 4 || index === 5 ? 0.22 : 0.13}
                  strokeWidth={index === 4 || index === 5 ? 1.5 : 1}
                  fill="none"
                />
              ))}

              {/* ── Linhas de longitude (8 meridianos) ── */}
              {[0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92].map((line, idx) => {
                const bulge = idx < 4 ? 0.05 : -0.05;
                return (
                  <Path
                    key={`long-${line}`}
                    d={`M ${worldWidth * line} 12 C ${worldWidth * (line + bulge)} ${worldHeight * 0.28}, ${worldWidth * (line + bulge)} ${worldHeight * 0.72}, ${worldWidth * line} ${worldHeight - 12}`}
                    stroke={palette.routeGlow}
                    strokeOpacity={0.11}
                    strokeWidth={1}
                    fill="none"
                  />
                );
              })}

              <Path
                d={buildContinentBackdrop(worldWidth, worldHeight, 0)}
                fill={palette.countryLocked}
                opacity={0.28}
              />
              <Path
                d={buildContinentBackdrop(worldWidth, worldHeight, 1)}
                fill={palette.countryOpen}
                opacity={0.18}
              />

              {grafo.edges.map((edge, index) => {
                const from = nodeById.get(String(edge.from));
                const to = nodeById.get(String(edge.to));
                if (!from || !to) return null;
                const active = !from.locked;

                return (
                  <Path
                    key={`${edge.from}:${edge.to}:${index}`}
                    d={buildRoutePath(from, to)}
                    stroke={active ? "url(#routeActive)" : palette.borderLocked}
                    strokeWidth={active ? 4 : 2}
                    fill="none"
                    opacity={active ? 0.88 : 0.34}
                    strokeDasharray={active ? "0" : "8 10"}
                  />
                );
              })}

              {nodes.map((node) => (
                <Path
                  key={`shadow:${node.id}`}
                  d={buildCountryPath(
                    node.x + 14,
                    node.y + 14,
                    node.width,
                    node.height,
                    node.sequence + 1,
                  )}
                  fill="#0000002c"
                />
              ))}

              {nodes.map((node) => {
                const fill = node.completed
                  ? palette.countryDone
                  : node.current
                    ? palette.countryCurrent
                    : node.locked
                      ? palette.countryLocked
                      : palette.countryOpen;
                const stroke = node.completed
                  ? palette.borderDone
                  : node.current
                    ? palette.borderCurrent
                    : node.locked
                      ? palette.borderLocked
                      : palette.borderOpen;

                return (
                  <Path
                    key={`country:${node.id}`}
                    d={node.territoryPath}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={node.current ? 3 : 2}
                    opacity={node.locked ? 0.7 : 1}
                  />
                );
              })}

              {nodes.map((node) => {
                const markerX = node.x + node.width * 0.52;
                const markerY = node.y + node.height * 0.36;
                return (
                  <Circle
                    key={`marker:${node.id}`}
                    cx={markerX}
                    cy={markerY}
                    r={node.current ? 9 : 7}
                    fill={palette.marker}
                    stroke={palette.markerText}
                    strokeWidth={node.current ? 2 : 1.5}
                  />
                );
              })}

              {/* ── Vinheta de globo (últimas camadas para ficar sobre tudo) ── */}
              <Path
                d={`M 0 0 H ${worldWidth} V ${worldHeight} H 0 Z`}
                fill="url(#globeVignette)"
                pointerEvents="none"
              />
            </Svg>

            {/* ── Rosa dos ventos (sobreposta ao SVG) ── */}
            {/* ── Bússola ── */}
            <View
              style={{
                position: "absolute",
                right: 14,
                bottom: 22,
                opacity: 0.18,
              }}
              pointerEvents="none"
            >
              <MaterialCommunityIcons
                name="compass-rose"
                size={120}
                color={palette.textPrimary}
              />
            </View>

            {nodes.map((node) => {
              const borderColor = node.completed
                ? palette.borderDone
                : node.current
                  ? palette.borderCurrent
                  : node.locked
                    ? palette.borderLocked
                    : palette.borderOpen;
              const badgeColor = node.completed
                ? palette.borderDone
                : node.current
                  ? palette.borderCurrent
                  : node.locked
                    ? palette.textSecondary
                    : palette.route;

              return (
                <Pressable
                  key={node.id}
                  onPress={() => {
                    if (node.locked) return;
                    router.push(
                      `/(tabs)/trilha/${encodeURIComponent(node.id)}`,
                    );
                  }}
                  style={[
                    styles.nodePlate,
                    {
                      left: node.plateX * mapScale,
                      top: node.plateY * mapScale,
                      width: node.plateWidth * mapScale,
                      backgroundColor: `${palette.panelBg}`.replace(
                        "0.84",
                        "0.92",
                      ),
                      borderColor,
                      opacity: node.locked ? 0.72 : 1,
                    },
                  ]}
                >
                  <View style={styles.nodeHeader}>
                    <View
                      style={[
                        styles.sequenceBadge,
                        {
                          backgroundColor: `${badgeColor}22`,
                          borderColor: badgeColor,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.sequenceText, { color: badgeColor }]}
                      >
                        {node.sequence}
                      </Text>
                    </View>
                    <View style={styles.nodeEmblem}>
                      <MaterialCommunityIcons
                        name={node.emblem as never}
                        size={16}
                        color={badgeColor}
                      />
                    </View>
                  </View>

                  <Text
                    style={[styles.nodeTitle, { color: palette.textPrimary }]}
                    numberOfLines={2}
                  >
                    {node.title}
                  </Text>
                  <Text
                    style={[
                      styles.nodeSubtitle,
                      { color: palette.textSecondary },
                    ]}
                    numberOfLines={2}
                  >
                    Capital: {node.subtitle}
                  </Text>

                  <View style={styles.nodeFooter}>
                    <Text style={[styles.stateChipText, { color: badgeColor }]}>
                      {node.badge}
                    </Text>
                    <MaterialCommunityIcons
                      name={
                        node.completed
                          ? "check-circle"
                          : node.locked
                            ? "lock"
                            : "map-marker-path"
                      }
                      size={16}
                      color={badgeColor}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: "109%",
  },
  headerCard: {
    position: "absolute",
    top: 4,
    left: 10,
    right: 10,
    zIndex: 10,
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 6,
  },
  headerEyebrow: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 20,
  },
  headerBody: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  scrollContent: {
    paddingVertical: 40,
    paddingBottom: 0,
  },
  nodePlate: {
    position: "absolute",
    minHeight: 94,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  nodeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  nodeEmblem: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sequenceBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sequenceText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 14,
  },
  nodeTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
    lineHeight: 20,
  },
  nodeSubtitle: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  nodeFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  stateChipText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 11,
  },
});

export default TrilhaMapaHeroStable;
