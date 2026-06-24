import { useTrilha } from "@/context/TrilhaContext";
import { useUsuario } from "@/context/SessaoContext";
import { LockBadge } from "@/components/trilhas/common/LockBadge";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Pattern,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

const isWeb = Platform.OS === "web";

// Nós menores (viável e responsivo)
const HEX_R = isWeb ? 48 : 56;

// Limites de escala (evita gigantismo)
const MAX_SCALE_WEB = 1.02;
const MIN_SCALE_MOBILE = 0.91;
const MAX_SCALE_MOBILE = 1.28;
const MAX_SVG_HEIGHT_PX = 12000;

// padding extra p/ rótulos/glow
const PAD_LR = HEX_R + 84;
const PAD_T = HEX_R + 84;
const PAD_B = HEX_R + 180;

// espaço extra na base do ScrollView
const SAFE_PAD = 90;

// Margem horizontal igual (em % da largura da tela)
const H_PAD_PCT = 0.2; // 20%

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function hexPoints(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(" ");
}

// estrela
function starPath(cx: number, cy: number, rOuter: number, rInner: number, points = 5) {
  const step = Math.PI / points;
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const angle = -Math.PI / 2 + i * step;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    coords.push(`${x} ${y}`);
  }
  return `M ${coords[0]} L ${coords.slice(1).join(" L ")} Z`;
}

// Aresta reta
const straight = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} L ${x2} ${y2}`;

// recorta a aresta para começar/terminar na borda do hex
function clipToRadius(x1: number, y1: number, x2: number, y2: number, r: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  return {
    sx: x1 + ux * r,
    sy: y1 + uy * r,
    ex: x2 - ux * r,
    ey: y2 - uy * r,
  };
}

// interseção entre dois segmentos AB e CD
function intersectSegments(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): { x: number; y: number; t: number } | null {
  const rpx = bx - ax,
    rpy = by - ay;
  const spx = dx - cx,
    spy = dy - cy;
  const denom = rpx * spy - rpy * spx;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((cx - ax) * spy - (cy - ay) * spx) / denom;
  const u = ((cx - ax) * rpy - (cy - ay) * rpx) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { x: ax + t * rpx, y: ay + t * rpy, t };
  return null;
}

// vértices do hex
function hexVertices(cx: number, cy: number, r: number) {
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    verts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return verts;
}

// recorta na interseção com o perímetro exato do hex
function clipToHex(cx: number, cy: number, r: number, tx: number, ty: number) {
  const verts = hexVertices(cx, cy, r);
  let best: { x: number; y: number; t: number } | null = null;
  for (let i = 0; i < 6; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % 6];
    const inter = intersectSegments(cx, cy, tx, ty, a.x, a.y, b.x, b.y);
    if (inter && inter.t > 0) {
      if (!best || inter.t < best.t) best = inter;
    }
  }
  if (!best) {
    const p = clipToRadius(cx, cy, tx, ty, r);
    return { x: p.sx, y: p.sy };
  }
  return { x: best.x, y: best.y };
}

export const TrilhaArvoreSimple: React.FC = () => {
  const { grafo } = useTrilha();
  const { usuario } = useUsuario();
  const router = useRouter();
  const { width: winW, height: winH } = useWindowDimensions();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );

  // ===== Nó foco (primeiro jogável) =====
  const currentId = useMemo<string | null>(() => {
    const nodes = grafo?.nodes ?? [];
    if (!nodes.length) return null;
    const playable = nodes.find((n) => !n.locked && !n.completed)?.id;
    if (playable) return String(playable);
    const unlocked = nodes.find((n) => !n.locked)?.id;
    if (unlocked) return String(unlocked);
    return String(nodes[0]?.id ?? "");
  }, [grafo.nodes]);

  // ===== Bounds reais do grafo =====
  const bounds = useMemo(() => {
    const pts = Array.from(grafo.positions.values());
    if (!pts.length) return { minX: 0, minY: 0, maxX: winW, maxY: winH };
    const xs = pts.map((p) => p.x),
      ys = pts.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }, [grafo.positions, winW, winH]);

  // ===== viewBox base (fallback para cálculos iniciais) =====
  const vbBase = useMemo(() => {
    const w = Math.max(1, bounds.maxX - bounds.minX + PAD_LR * 2);
    const h = Math.max(1, bounds.maxY - bounds.minY + PAD_T + PAD_B);
    const x = bounds.minX - PAD_LR;
    const y = bounds.minY - PAD_T;
    return { x, y, w, h };
  }, [bounds]);

  // Escala provisória p/ anti-overlap
  const layoutBaseScale = winW / vbBase.w;
  const layoutScale = isWeb
    ? clamp(layoutBaseScale, 0, MAX_SCALE_WEB)
    : Math.max(layoutBaseScale, MIN_SCALE_MOBILE);

  // ===== animações =====
  const pulse = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: false }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.9] });

  // Evita um loop de rerender por frame na árvore.
  const floatOffset = 0;
  const AnimatedPolygon: any = Animated.createAnimatedComponent(Polygon as any);

  // ===== Anti-overlap + alinhamento por níveis + CENTRALIZAÇÃO POR NÍVEL + GAP VERTICAL UNIFORME =====
const adjustedPositions = useMemo(() => {
  const map = new Map(grafo.positions);
  const nodes = grafo.nodes.slice();
  if (nodes.length < 2) return map;

  // --- 0) parâmetros de espaçamento ---
  const minGapX = (HEX_R * 2.6) / layoutScale; // evita nós muito colados na horizontal
  const minLevelGapY = (HEX_R * 4.2) / layoutScale; // evita sobreposição entre nós/labels em níveis distintos

  // --- 1) anti-overlap leve (como já estava) ---
  const widthFactor = clamp(winW / 390, 0.9, 1.6);
  const minDistScreen = (isWeb ? HEX_R * 1.8 : HEX_R * 2.2) * widthFactor;
  const minDistWorld  = minDistScreen / layoutScale;
  const yBumpWorld    = (HEX_R * (0.6 + 0.25 * widthFactor)) / layoutScale;

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const pa = map.get(a.id);
    if (!pa) continue;
    for (let j = 0; j < i; j++) {
      const b = nodes[j];
      const pb = map.get(b.id);
      if (!pb) continue;
      const dx = pa.x - pb.x, dy = pa.y - pb.y;
      const dist = Math.hypot(dx, dy);
      if (dist < minDistWorld) {
        const dirX = dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx);
        const xBumpWorld = (HEX_R * 0.5 * widthFactor) / layoutScale;
        map.set(a.id, { x: pa.x + dirX * xBumpWorld, y: pa.y + yBumpWorld });
      }
    }
  }

  // --- 2) centro global X após anti-overlap ---
  const ptsForCenter = Array.from(map.values());
  const xsCenter = ptsForCenter.map(p => p.x);
  const minXCenter = Math.min(...xsCenter), maxXCenter = Math.max(...xsCenter);
  const centerX = (minXCenter + maxXCenter) / 2 || 0;

  // --- 3) agrupar por banda (nível) ---
  const bandSize = (HEX_R * 2.8) / layoutScale; // usado só para detectar níveis
  const bands = new Map<number, { id: string; x: number; y: number }[]>();
  for (const n of nodes) {
    const p = map.get(n.id);
    if (!p) continue;
    const band = Math.round(p.y / bandSize);
    const arr = bands.get(band) ?? [];
    arr.push({ id: n.id, x: p.x, y: p.y });
    bands.set(band, arr);
  }

  // --- 4) calcular Y alvo UNIFORME por nível ---
  const entries = Array.from(bands.entries()).sort((a, b) => a[0] - b[0]);
  const levelCenters = entries.map(([, arr]) => arr.reduce((s, v) => s + v.y, 0) / arr.length);
  const baseY = levelCenters.length ? Math.min(...levelCenters) : 0;

  // Se quiser, pode estimar um gap a partir dos níveis reais:
  // const diffs = levelCenters.slice(1).map((y,i)=>Math.max(1, y - levelCenters[i]));
  // const median = diffs.sort((a,b)=>a-b)[Math.floor(diffs.length/2)] || minLevelGapY;
  // const levelGapY = Math.max(minLevelGapY, median);
  const maxNodesPerLevel = Math.max(1, ...entries.map(([, arr]) => arr.length));
  const levelDensityFactor = maxNodesPerLevel >= 4 ? 1.15 : 1;
  const levelGapY = minLevelGapY * levelDensityFactor;

  // --- 5) para cada nível: alinhar Y e centralizar no mesmo centerX ---
  entries.forEach(([_, arr], idx) => {
    const targetY = baseY + idx * levelGapY;

    // manter ordem relativa por X
    arr.sort((a, b) => a.x - b.x);

    const totalWidth = (arr.length - 1) * minGapX;
    const startX = centerX - totalWidth / 2;

    arr.forEach((it, i) => {
      const targetX = startX + i * minGapX;
      map.set(it.id, { x: targetX, y: targetY });
    });
  });

  return map;
}, [grafo.positions, grafo.nodes, layoutScale, winW]);


  // ===== Centralização com margens iguais em PX e largura de viewBox travada =====
  const vb = useMemo(() => {
    const pts = Array.from(adjustedPositions.values());
    if (!pts.length) {
      const w = Math.max(1, bounds.maxX - bounds.minX + PAD_LR * 2);
      const h = Math.max(1, bounds.maxY - bounds.minY + PAD_T + PAD_B);
      const cx = (bounds.minX + bounds.maxX) / 2;
      const x = cx - w / 2;
      const y = bounds.minY - PAD_T;
      return { x, y, w, h, scaleClamped: undefined as number | undefined };
    }

    const xs = pts.map((p) => p.x),
      ys = pts.map((p) => p.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);

    const minTreeWidth = (HEX_R * 3.2) / Math.max(layoutScale, 0.01);
    const treeW = Math.max(1, maxX - minX, minTreeWidth);
    const centerX = (minX + maxX) / 2;

    // margem lateral em PX
    const padPx = Math.max(24, Math.round(winW * H_PAD_PCT));

    // escala para ocupar (winW - 2*padPx) px
    let scaleCandidate = (winW - 2 * padPx) / treeW;
    const scaleClamped = isWeb
      ? clamp(scaleCandidate, 0.8, MAX_SCALE_WEB)
      : clamp(scaleCandidate, MIN_SCALE_MOBILE, MAX_SCALE_MOBILE);

    // largura do viewBox em unidades de mundo
    const wWorld = winW / scaleClamped;

    // padding vertical em PX -> world
    const topWorld = PAD_T / scaleClamped;
    const bottomWorld = PAD_B / scaleClamped;

    const hWorld = Math.max(1, maxY - minY + topWorld + bottomWorld);

    // centraliza o centro do grafo no meio do viewBox
    const x = centerX - wWorld / 2;
    const y = minY - topWorld;

    return { x, y, w: wWorld, h: hWorld, scaleClamped };
  }, [adjustedPositions, bounds, layoutScale, winW]);

  // Escala final
  const candidateScale =
    (vb as any).scaleClamped ??
    (() => {
      const baseScale = winW / vb.w;
      return isWeb
        ? clamp(baseScale, 0.9, MAX_SCALE_WEB)
        : clamp(baseScale, MIN_SCALE_MOBILE, MAX_SCALE_MOBILE);
    })();
  const maxScaleByHeight = MAX_SVG_HEIGHT_PX / Math.max(vb.h, 1);
  const scale = Math.max(0.1, Math.min(candidateScale, maxScaleByHeight));

  // Medidas do SVG
  const svgW = winW;
  const svgH = vb.h * scale;

  // Altura mínima do conteúdo do ScrollView
  const contentH = Math.max(svgH + SAFE_PAD, winH * 0.92);

  // ===== navegação =====
  const [flashId, setFlashId] = useState<string | null>(null);
  const go = (id: string, locked: boolean) => {
    if (locked) return;
    setFlashId(id);
    flashAnim.stopAnimation();
    flashAnim.setValue(0);
    pressScale.stopAnimation();
    pressScale.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 90, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 180, useNativeDriver: false }),
      ]),
      Animated.sequence([
        Animated.timing(pressScale, { toValue: 1, duration: 140, useNativeDriver: false }),
        Animated.timing(pressScale, { toValue: 0, duration: 160, useNativeDriver: false }),
      ]),
    ]).start(() => {
      setFlashId(null);
      router.push({ pathname: "/(tabs)/trilha/[id]", params: { id } });
    });
  };

  // viewBox seguro (use fallback se necessário)
  const vbSafe =
    Number.isFinite((vb as any)?.x) &&
    Number.isFinite((vb as any)?.y) &&
    Number.isFinite((vb as any)?.w) &&
    Number.isFinite((vb as any)?.h)
      ? vb
      : vbBase;
  const vbSafeY = Number((vbSafe as any).y ?? 0);

  const currentNodePosition = useMemo(() => {
    if (!currentId) return null;
    return adjustedPositions.get(currentId) ?? null;
  }, [adjustedPositions, currentId]);

  // ===== recentraliza no nó atual (somente vertical) =====
  const vScrollRef = useRef<ScrollView>(null);
  const lastScrollTargetRef = useRef<number | null>(null);
  useEffect(() => {
    if (!currentNodePosition) return;

    const cy = (currentNodePosition.y - vbSafeY) * scale;
    const targetY = Math.max(0, cy - winH * 0.4);

    if (
      lastScrollTargetRef.current != null &&
      Math.abs(lastScrollTargetRef.current - targetY) < 2
    ) {
      return;
    }

    lastScrollTargetRef.current = targetY;
    vScrollRef.current?.scrollTo({ y: targetY, animated: true });
  }, [currentNodePosition, scale, vbSafeY, winH]);

  return (
    <View style={[styles.root, { width: winW, height: winH, backgroundColor: palette.background }]}>
      {/* Camada de textura principal */}
      <Image
        source={require("@/assets/ImagensReferencia/arte_filter.png")}
        style={styles.textureLayer}
        resizeMode="cover"
        pointerEvents="none"
      />
      {/* Segunda camada espelhada para dar profundidade */}
      <Image
        source={require("@/assets/ImagensReferencia/arte_filter.png")}
        style={[
          styles.textureLayer,
          { opacity: 0.07, transform: [{ rotate: "180deg" }] },
        ]}
        resizeMode="cover"
        pointerEvents="none"
      />
      {/* ── Bússola ── */}
      <View style={styles.compassTexture} pointerEvents="none">
        <MaterialCommunityIcons
          name="compass-rose"
          size={200}
          color={palette.text}
        />
      </View>
      <ScrollView
        ref={vScrollRef}
        contentContainerStyle={[
          styles.container,
          {
            width: winW,
            minHeight: contentH,
            paddingBottom: SAFE_PAD,
            backgroundColor: palette.background,
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces
        horizontal={false}
      >
        <View style={{flex: 1, position: "relative", width: winW, height: contentH }}>
          <Svg
            width={svgW}
            height={svgH}
            viewBox={`${(vbSafe as any).x} ${(vbSafe as any).y} ${(vbSafe as any).w} ${(vbSafe as any).h}`}
            preserveAspectRatio="xMidYMin meet"
            style={styles.svg}
          >
            <Defs>
              {/* ── Nós ── */}
              <RadialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%"   stopColor={palette.accent} stopOpacity="0.62" />
                <Stop offset="100%" stopColor={palette.accent} stopOpacity="0" />
              </RadialGradient>
              <LinearGradient id="edgeOn" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%"   stopColor={palette.text}   stopOpacity="0.9" />
                <Stop offset="100%" stopColor={palette.accent} stopOpacity="0.95" />
              </LinearGradient>
              <LinearGradient id="nodeStroke" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%"   stopColor={palette.text} />
                <Stop offset="100%" stopColor={palette.accent} />
              </LinearGradient>
              <LinearGradient id="nodeFillActive" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor={palette.accent} />
                <Stop offset="100%" stopColor={palette.accentStrong} />
              </LinearGradient>
              <RadialGradient id="starGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%"   stopColor={palette.text} stopOpacity="0.45" />
                <Stop offset="100%" stopColor={palette.text} stopOpacity="0" />
              </RadialGradient>
              {/* ── Fundo: gradiente vertical (topo mais rico) ── */}
              <LinearGradient id="treeBg" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%"   stopColor={palette.surfaceElevated} stopOpacity="0.55" />
                <Stop offset="40%"  stopColor={palette.surface}         stopOpacity="0.22" />
                <Stop offset="100%" stopColor={palette.background}      stopOpacity="0" />
              </LinearGradient>
              {/* ── Fundo: brilho central ── */}
              <RadialGradient id="treeCenterGlow" cx="50%" cy="40%" r="55%">
                <Stop offset="0%"   stopColor={palette.accentMuted} stopOpacity="0.18" />
                <Stop offset="100%" stopColor={palette.background}  stopOpacity="0" />
              </RadialGradient>
              {/* ── Padrão de hexágonos no fundo (menor que os nós) ── */}
              <Pattern
                id="hexGrid"
                x="0"
                y="0"
                width={HEX_R * 1.73}
                height={HEX_R * 1.5}
                patternUnits="userSpaceOnUse"
              >
                {/* hex menor: raio = HEX_R * 0.42 para ficar como grade de fundo */}
                <Polygon
                  points={hexPoints(HEX_R * 0.865, HEX_R * 0.5, HEX_R * 0.42)}
                  fill="none"
                  stroke={palette.borderStrong}
                  strokeWidth={0.55}
                  opacity={0.32}
                />
                <Polygon
                  points={hexPoints(0, HEX_R * 1.0, HEX_R * 0.42)}
                  fill="none"
                  stroke={palette.borderStrong}
                  strokeWidth={0.55}
                  opacity={0.32}
                />
                <Polygon
                  points={hexPoints(HEX_R * 1.73, HEX_R * 1.0, HEX_R * 0.42)}
                  fill="none"
                  stroke={palette.borderStrong}
                  strokeWidth={0.55}
                  opacity={0.32}
                />
              </Pattern>
            </Defs>

            {/* ── Fundo texturizado ── */}
            <Rect
              x={(vbSafe as any).x}
              y={(vbSafe as any).y}
              width={(vbSafe as any).w}
              height={(vbSafe as any).h}
              fill="url(#hexGrid)"
            />
            <Rect
              x={(vbSafe as any).x}
              y={(vbSafe as any).y}
              width={(vbSafe as any).w}
              height={(vbSafe as any).h}
              fill="url(#treeBg)"
            />
            <Rect
              x={(vbSafe as any).x}
              y={(vbSafe as any).y}
              width={(vbSafe as any).w}
              height={(vbSafe as any).h}
              fill="url(#treeCenterGlow)"
            />

            {adjustedPositions.size === 0 && (
              <SvgText
                x={(vbSafe as any).x + (vbSafe as any).w / 2}
                y={(vbSafe as any).y + 40}
                textAnchor="middle"
                fontSize={14}
                fontFamily={FontFamily.inikaBold}
                fill={palette.text}
              >
                Carregando trilha...
              </SvgText>
            )}

            {/* ── Glow das arestas ativas (halo largo atrás da linha) ── */}
            {grafo.edges.map((e, idx) => {
              const p1 = adjustedPositions.get(e.from);
              const p2 = adjustedPositions.get(e.to);
              if (!p1 || !p2) return null;
              const fromNode = grafo.nodes.find((n) => n.id === e.from);
              if (!fromNode || fromNode.locked) return null;
              const s = clipToHex(p1.x, p1.y, HEX_R, p2.x, p2.y);
              const e2 = clipToHex(p2.x, p2.y, HEX_R, p1.x, p1.y);
              return (
                <Path
                  key={`edge-glow-${idx}`}
                  d={straight(s.x, s.y, e2.x, e2.y)}
                  stroke={palette.accent}
                  strokeWidth={10}
                  fill="none"
                  opacity={0.13}
                />
              );
            })}

            {/* ── Arestas (retas com estilo) ── */}
            {grafo.edges.map((e, idx) => {
              const p1 = adjustedPositions.get(e.from);
              const p2 = adjustedPositions.get(e.to);
              if (!p1 || !p2) return null;
              const fromNode = grafo.nodes.find((n) => n.id === e.from);
              const active = fromNode ? !fromNode.locked : false;

              const s = clipToHex(p1.x, p1.y, HEX_R, p2.x, p2.y);
              const e2 = clipToHex(p2.x, p2.y, HEX_R, p1.x, p1.y);
              return (
                <Path
                  key={`edge-${idx}`}
                  d={straight(s.x, s.y, e2.x, e2.y)}
                  stroke={active ? "url(#edgeOn)" : palette.border}
                  strokeWidth={active ? 3 : 1.5}
                  strokeDasharray={active ? undefined : "6 5"}
                  fill="none"
                  opacity={active ? 1 : 0.55}
                />
              );
            })}

            {/* Pontos de junção (decor) */}
            {grafo.edges.map((e, idx) => {
              const p1 = adjustedPositions.get(e.from);
              const p2 = adjustedPositions.get(e.to);
              if (!p1 || !p2) return null;
              const midx = (p1.x + p2.x) / 2;
              const midy = (p1.y + p2.y) / 2;
              return (
                <G key={`edge-joint-${idx}`}>
                  <Circle cx={p1.x} cy={p1.y} r={3.2} fill={palette.textMuted} opacity={0.8} />
                  <Circle cx={p2.x} cy={p2.y} r={3.2} fill={palette.textMuted} opacity={0.8} />
                  <Circle cx={midx} cy={midy} r={2.6} fill={palette.text} opacity={0.9} />
                </G>
              );
            })}

            {/* Nós */}
            {grafo.nodes.map((n) => {
              const pos = adjustedPositions.get(n.id);
              if (!pos) return null;

              const locked = !!(n as any).locked;
              const completed = !!(n as any).completed;
              const fill = completed
                ? palette.accent
                : locked
                ? palette.surface
                : "url(#nodeFillActive)";
              const stroke = locked ? palette.border : "url(#nodeStroke)";
              const text = locked ? palette.textSubtle : palette.text;
              const cx = pos.x;
              const cyBase = pos.y;
              const isCurrent = currentId === n.id;
              const isInProgress = !completed && !locked;
              const shouldFloat = isCurrent || isInProgress;
              const cy = shouldFloat ? cyBase + floatOffset : cyBase;

              const onPress = () => go(n.id, locked);

              return (
                <G key={n.id} onPress={onPress}>
                  {!locked && (
                    <AnimatedPolygon
                      points={hexPoints(cx, cy, HEX_R + 20)}
                      fill="url(#nodeGlow)"
                      opacity={(isCurrent ? 1 : (glowOpacity as unknown as number))}
                    />
                  )}
                  <Polygon
                    points={hexPoints(cx, cy, HEX_R)}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={3}
                    opacity={locked ? 0.65 : 1}
                    onPress={onPress}
                  />
                  {flashId === n.id && (
                    <AnimatedPolygon
                      points={hexPoints(cx, cy, HEX_R + 6)}
                      fill="none"
                      stroke="url(#edgeOn)"
                      strokeWidth={4}
                      opacity={flashAnim as unknown as number}
                    />
                  )}
                  <Polygon
                    points={hexPoints(cx, cy, HEX_R - 6)}
                    fill={locked ? palette.surfaceElevated : palette.accentStrong}
                    opacity={locked ? 0.35 : 0.5}
                  />

                  {completed ? (
                    <Path
                      d={`M ${cx - 10} ${cy + 2} l 6 6 l 12 -14`}
                      stroke={text}
                      strokeWidth={4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  ) : null}

                  {shouldFloat && (
                    <>
                      <Circle cx={cx} cy={cy + 3} r={14} fill="url(#starGlow)" />
                      <Path d={starPath(cx, cy + 3, 11, 5.5)} fill={palette.text} stroke="url(#nodeStroke)" strokeWidth={1.2} />
                    </>
                  )}

                  {(() => {
                    const rawTitle = String((n as any).titulo || "").trim();
                    const maxRectW = 140 / scale;
                    const pad = 18 / scale;
                    const approxCharW = 7 / scale;
                    const maxCharsPerLine = Math.max(7, Math.floor((maxRectW - pad) / approxCharW));
                    const words = rawTitle.split(/\s+/);
                    let line1 = "",
                      line2 = "";
                    for (const w of words) {
                      if ((line1 + " " + w).trim().length <= maxCharsPerLine) line1 = (line1 + " " + w).trim();
                      else if ((line2 + " " + w).trim().length <= maxCharsPerLine) line2 = (line2 + " " + w).trim();
                      else break;
                    }
                    if (!line1) line1 = rawTitle.slice(0, maxCharsPerLine);
                    const longest = (line2.length > line1.length ? line2 : line1) || line1;
                    const rectW = Math.max(44 / scale, Math.min(maxRectW, pad + longest.length * approxCharW));
                    const rectH = (line2 ? 36 : 20) / scale;
                    const labelOffset = -5 / scale;
                    const rectX = cx - rectW / 2;
                    const rectY = cy + HEX_R + labelOffset;
                    const rectFill = completed
                      ? palette.accent
                      : locked
                      ? palette.surface
                      : palette.accentStrong;
                    const textFill = locked ? palette.textSubtle : palette.text;
                    const fontSize = 12 / scale;
                    const y1 = rectY + (line2 ? 10 / scale : 13 / scale);
                    const y2 = rectY + 26 / scale;
                    return (
                      <>
                        <Rect x={rectX} y={rectY} width={rectW} height={rectH} rx={9 / scale} fill={rectFill} />
                        
                        {line2 ? (
                          <SvgText
                            x={cx}
                            y={y1 + 4}
                            fontSize={fontSize}
                            fontFamily={FontFamily.inikaBold}
                            textAnchor="middle"
                            fill={textFill}
                          >
                          {line1}
                        </SvgText>
                        ) : <SvgText
                          x={cx}
                          y={y1}
                          fontSize={fontSize}
                          fontFamily={FontFamily.inikaBold}
                          textAnchor="middle"
                          fill={textFill}
                        >
                          {line1}
                        </SvgText>}

                        {line2 ? (
                          <SvgText
                            x={cx}
                            y={y2 + 3}
                            fontSize={fontSize}
                            fontFamily={FontFamily.inikaBold}
                            textAnchor="middle"
                            fill={textFill}
                          >
                            {line2}
                          </SvgText>
                        ) : null}
                      </>
                    );
                  })()}
                </G>
              );
            })}
          </Svg>

          {/* Badges/ícones mapeados sobre o SVG */}
          {grafo.nodes.map((n) => {
            const pos = adjustedPositions.get(n.id);
            if (!pos) return null;
            const isCurrent = currentId === n.id;
            const cx = (pos.x - (vbSafe as any).x) * scale;
            const cy = (pos.y - (vbSafe as any).y) * scale + (isCurrent ? floatOffset * scale : 0);
            const heroIcon = (n as any).icon as string | null | undefined;
            const badgeLabel = (n as any).badgeLabel as string | null | undefined;

            const left = cx - 18;
            const top = cy - 18;

            return (
              <View
                key={`badge-${n.id}`}
                style={{
                  position: "absolute",
                  left: left - 8,
                  top: top - 18,
                  width: 52,
                  height: 70,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
                pointerEvents="none"
              >
                {badgeLabel ? (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: palette.accentMuted,
                      borderWidth: 1,
                      borderColor: palette.borderStrong,
                    }}
                  >
                    <Animated.Text
                      style={{
                        color: palette.text,
                        fontSize: 10,
                        fontFamily: FontFamily.inikaBold,
                      }}
                    >
                      {badgeLabel}
                    </Animated.Text>
                  </View>
                ) : (
                  <View />
                )}
                {n.locked ? (
                  <LockBadge size={28} color={palette.text} />
                ) : (
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: palette.accentMuted,
                      borderWidth: 1,
                      borderColor: palette.borderStrong,
                    }}
                  >
                    <MaterialCommunityIcons
                      name="star-four-points"
                      size={14}
                      color={palette.accent}
                    />
                  </View>
                )}
                {!n.locked && heroIcon ? (
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: palette.surfaceElevated,
                      borderWidth: 1,
                      borderColor: palette.border,
                    }}
                  >
                    <MaterialCommunityIcons
                      name={heroIcon as any}
                      size={12}
                      color={palette.text}
                    />
                  </View>
                ) : (
                  <View />
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { backgroundColor: Color.background },
  container: { backgroundColor: Color.background, alignItems: "center" },
  svg: { alignSelf: "center" },
  textureLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.14,
  },
  compassTexture: {
    position: "absolute",
    right: 4,
    top: 64,
    opacity: 0.15,
  },
});

export default TrilhaArvoreSimple;
