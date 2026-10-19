import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useId, useMemo, useRef } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, Path, Pattern, RadialGradient, Stop } from "react-native-svg";
import tinycolor from "tinycolor2";

import { HexagonoTopico } from "@/components/web/HexagonoTopico";
import { guardianFaceImages } from "@/constants/profileImages";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";
import { FontFamily } from "@/styles/GlobalStyle";
import { caminhoCelula, layoutMapa, MAPA_TOPO, ondaMar, trechoEstrada } from "@/utils/mapaPaises";
import type { EstadoTopico } from "@/utils/painelTopicoTrilha";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

export type TopicoMapa = {
  id: string;
  /** Nome do país (tema do mapa da turma) ou, sem tema, o título do tópico. */
  nome: string;
  estado: EstadoTopico;
  percentual: number;
  personalizado: boolean;
};

const TAMANHO_HEX = 68;
const LARGURA_NO = 170;

const mistura = (a: string, b: string, pctB: number) => tinycolor.mix(a, b, pctB).toRgbString();

/**
 * Mapa de países da Trilha na web em tela larga (#346, protótipo v4,
 * `03-trilha.html`): o continente recortado em países que dividem fronteira,
 * a estrada entre as capitais, o hexágono e o selo de estado de cada tópico e
 * o "Você parou aqui". Tocar num país seleciona o tópico no painel ao lado.
 */
export function MapaPaisesDesktop({
  topicos,
  quadro,
  selecionado,
  perfil,
  palette,
  onSelecionar,
}: {
  topicos: TopicoMapa[];
  quadro: { largura: number; altura: number };
  selecionado: string | null;
  perfil: string | null | undefined;
  palette: ProfileShellPalette;
  onSelecionar: (id: string) => void;
}) {
  // Ids de gradiente e padrão únicos por instância: a Trilha pode estar montada
  // duas vezes (uma escondida), e `url(#id)` repetido aponta para a escondida.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const L = useMemo(() => layoutMapa(topicos.length, quadro.largura, quadro.altura), [topicos.length, quadro.largura, quadro.altura]);
  const cores = useMemo(() => {
    const bg = palette.background;
    return {
      bg,
      accentHi: tinycolor(palette.accent).lighten(10).toRgbString(),
      elevHi: tinycolor(palette.surfaceElevated).lighten(5).toRgbString(),
      accentSoft: tinycolor(palette.accent).setAlpha(0.18).toRgbString(),
      bgA55: tinycolor(bg).setAlpha(0.55).toRgbString(),
      semNome: mistura(bg, palette.surface, 80),
      pais: {
        done: { fill: mistura(bg, palette.accentStrong, 62), stroke: palette.accent, sw: 2, dash: undefined },
        current: { fill: mistura(bg, palette.accent, 48), stroke: palette.text, sw: 3, dash: undefined },
        open: { fill: mistura(palette.surface, palette.accent, 16), stroke: palette.borderStrong, sw: 2, dash: undefined },
        locked: { fill: mistura(bg, palette.surface, 92), stroke: palette.border, sw: 2, dash: "6 6" },
      } as Record<EstadoTopico, { fill: string; stroke: string; sw: number; dash?: string }>,
    };
  }, [palette]);

  const atual = topicos.findIndex((t) => t.estado === "current");
  // Até onde a estrada já foi percorrida: até o tópico atual ou, sem ele, até o último concluído.
  const percorrido = atual >= 0 ? atual : topicos.reduce((ult, t, i) => (t.estado === "done" ? i : ult), -1);
  const topicoNa = (c: number, r: number) => {
    const i = L.nos.findIndex((n) => n.c === c && n.r === r);
    return i < 0 ? null : topicos[i];
  };
  const continente = L.celulas.map(({ c, r }) => caminhoCelula(L, c, r)).join(" ");
  const rosto = guardianFaceImages[normalizeBrainHexProfile(perfil) ?? "mastermind"];

  // A roda do mouse rola o mapa na horizontal (ele não rola na vertical quando cabe).
  const rolagem = useRef<ScrollView | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const no = (rolagem.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.();
    if (!no) return;
    const rolar = (evento: WheelEvent) => {
      if (Math.abs(evento.deltaY) <= Math.abs(evento.deltaX) || no.scrollWidth <= no.clientWidth) return;
      no.scrollLeft += evento.deltaY;
      evento.preventDefault();
    };
    no.addEventListener("wheel", rolar, { passive: false });
    return () => no.removeEventListener("wheel", rolar);
  }, []);

  return (
    <ScrollView ref={rolagem} horizontal showsHorizontalScrollIndicator={false} style={s.rolagem}>
      <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={L.altura > quadro.altura + 1}>
        <View style={{ width: L.largura, height: L.altura }}>
          <Svg width={L.largura} height={L.altura} style={StyleSheet.absoluteFill}>
            <Defs>
              <Pattern id={`hachura-${uid}`} width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <Path d="M0 0V10" stroke={palette.border} strokeWidth={2} />
              </Pattern>
            </Defs>
            {/* Mar: paralelos e meridianos, como o globo do app. */}
            {[1, 2, 3, 4, 5, 6, 7].map((i) => {
              const y = (L.altura * i) / 8;
              const w = 6 + i * 2;
              return (
                <Path
                  key={`p${i}`}
                  d={ondaMar(y, w, L.largura)}
                  fill="none"
                  stroke={palette.borderStrong}
                  strokeOpacity={0.14}
                />
              );
            })}
            {[1, 2, 3, 4, 5, 6, 7].map((i) => {
              const x = (L.largura * i) / 8;
              const b = (i < 4 ? 1 : -1) * L.largura * 0.03;
              return (
                <Path
                  key={`m${i}`}
                  d={`M${x} 0 C${x + b} ${L.altura * 0.3},${x + b} ${L.altura * 0.7},${x} ${L.altura}`}
                  fill="none"
                  stroke={palette.borderStrong}
                  strokeOpacity={0.1}
                />
              );
            })}
            {/* Costa: sombra e halo do continente inteiro. */}
            <Path d={continente} fill="rgba(0,0,0,0.4)" transform="translate(0 12)" />
            <Path d={continente} fill="none" stroke={palette.borderStrong} strokeOpacity={0.35} strokeWidth={14} strokeLinejoin="round" />
            {/* Países: território e fronteira na cor do fundo; célula sem tópico vira terra sem nome. */}
            {L.celulas.map(({ c, r }) => {
              const t = topicoNa(c, r);
              const d = caminhoCelula(L, c, r);
              return (
                // O país inteiro responde ao clique, não só o hexágono com o nome:
                // o aluno clica no território e esperava abrir o tópico.
                <G key={`c${c}-${r}`} onPress={t ? () => onSelecionar(t.id) : undefined}>
                  <Path d={d} fill={t ? cores.pais[t.estado].fill : cores.semNome} stroke={cores.bg} strokeWidth={3} strokeLinejoin="round" />
                  {t?.estado === "locked" ? <Path d={d} fill={`url(#hachura-${uid})`} opacity={0.5} /> : null}
                </G>
              );
            })}
            {/* Contorno de estado por dentro da fronteira (não briga com o vizinho). */}
            {L.celulas.map(({ c, r }) => {
              const t = topicoNa(c, r);
              if (!t) return null;
              const estilo = cores.pais[t.estado];
              const sel = selecionado === t.id;
              const cx = (L.x0 + L.cw * (c + 0.5)) * 0.04;
              const cy = (MAPA_TOPO + L.faixa * (r + 0.5)) * 0.04;
              return (
                <Path
                  key={`o${c}-${r}`}
                  d={caminhoCelula(L, c, r)}
                  fill="none"
                  stroke={sel ? palette.text : estilo.stroke}
                  strokeOpacity={sel ? 1 : 0.55}
                  strokeWidth={sel ? 3 : 1.5}
                  strokeDasharray={estilo.dash && !sel ? estilo.dash : undefined}
                  strokeLinejoin="round"
                  transform={`translate(${cx} ${cy}) scale(0.96)`}
                  pointerEvents="none"
                />
              );
            })}
            {/* Estrada entre as capitais: percorrida acesa; adiante tracejada; até bloqueado, pontilhada. */}
            {L.nos.length > 1 ? (
              <Path
                d={L.nos.slice(0, -1).map((n, i) => trechoEstrada(n, L.nos[i + 1])).join(" ")}
                fill="none"
                stroke={cores.bgA55}
                strokeWidth={16}
                strokeLinecap="round"
                pointerEvents="none"
              />
            ) : null}
            {L.nos.slice(0, -1).map((n, i) => {
              const d = trechoEstrada(n, L.nos[i + 1]);
              if (i < percorrido)
                return (
                  <G key={`e${i}`}>
                    <Path d={d} fill="none" stroke={cores.accentSoft} strokeWidth={12} strokeLinecap="round" />
                    <Path d={d} fill="none" stroke={palette.accent} strokeWidth={5} strokeLinecap="round" />
                  </G>
                );
              if (topicos[i + 1]?.estado === "locked")
                return <Path key={`e${i}`} d={d} fill="none" stroke={palette.borderStrong} strokeOpacity={0.7} strokeWidth={3} strokeDasharray="1 10" strokeLinecap="round" />;
              return <Path key={`e${i}`} d={d} fill="none" stroke={palette.accent} strokeWidth={3} strokeDasharray="2 11" strokeLinecap="round" />;
            })}
          </Svg>

          {/* Rosa dos ventos. */}
          <Svg width={96} height={96} viewBox="0 0 100 100" style={[s.bussola, { top: L.altura - 100 }]} pointerEvents="none">
            <Circle cx={50} cy={50} r={30} fill="none" stroke={palette.text} strokeWidth={1.5} />
            <Circle cx={50} cy={50} r={40} fill="none" stroke={palette.text} strokeWidth={0.8} strokeDasharray="2 4" />
            <Path d="M50 6 L56 50 L50 94 L44 50Z M6 50 L50 44 L94 50 L50 56Z" fill={palette.text} fillOpacity={0.45} />
            <Path d="M50 6 L56 50 L44 50Z" fill={palette.text} />
          </Svg>

          {L.nos.map((n, i) => {
            const t = topicos[i];
            return (
              <NoPais
                key={t.id}
                topico={t}
                numero={i + 1}
                x={n.x}
                y={n.y}
                selecionado={selecionado === t.id}
                rosto={rosto}
                uid={uid}
                palette={palette}
                cores={cores}
                onPress={() => onSelecionar(t.id)}
              />
            );
          })}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

const CHIP: Record<EstadoTopico, { icone: keyof typeof MaterialCommunityIcons.glyphMap; texto: (t: TopicoMapa) => string }> = {
  done: { icone: "check", texto: () => "Concluído" },
  current: { icone: "clock-outline", texto: (t) => `${t.percentual}% · ${t.personalizado ? "personalizado" : "em andamento"}` },
  open: { icone: "play", texto: () => "Disponível" },
  locked: { icone: "lock-outline", texto: () => "Bloqueado" },
};

function NoPais({
  topico,
  numero,
  x,
  y,
  selecionado,
  rosto,
  uid,
  palette,
  cores,
  onPress,
}: {
  topico: TopicoMapa;
  numero: number;
  x: number;
  y: number;
  selecionado: boolean;
  rosto: number | { uri?: string } | object;
  uid: string;
  palette: ProfileShellPalette;
  cores: { bg: string; accentHi: string; elevHi: string; accentSoft: string };
  onPress: () => void;
}) {
  const e = topico.estado;
  const chip = CHIP[e];
  const chipAceso = e === "done" || e === "current";
  const idGrad = `hex-${uid}-${topico.id}`;
  const rotulo = `${numero}. ${topico.nome}: ${e === "current" ? `você parou aqui, ${topico.percentual}%` : chip.texto(topico)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ selected: selecionado }}
      onPress={onPress}
      style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
        s.no,
        { left: x - LARGURA_NO / 2, top: y - TAMANHO_HEX / 2 },
        hovered ? s.noHover : null,
      ]}
    >
      <View style={s.hex}>
        {/* Brilho do tópico atual (no protótipo, um halo radial que respira). */}
        {e === "current" ? (
          <Svg width={TAMANHO_HEX * 1.9} height={TAMANHO_HEX * 1.9} style={s.halo} pointerEvents="none">
            <Defs>
              <RadialGradient id={`${idGrad}-halo`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={palette.accent} stopOpacity={0.45} />
                <Stop offset="1" stopColor={palette.accent} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx="50%" cy="50%" r="50%" fill={`url(#${idGrad}-halo)`} />
          </Svg>
        ) : null}
        <HexagonoTopico estado={e} numero={numero} tamanho={TAMANHO_HEX} palette={palette} idBase={idGrad} selecionado={selecionado} />
        {topico.personalizado ? (
          <View style={[s.persoPonto, { backgroundColor: palette.accent, borderColor: cores.bg }]}>
            <MaterialCommunityIcons name="star-four-points" size={12} color={cores.bg} />
          </View>
        ) : null}
      </View>

      <View style={s.rotulo}>
        <Text
          numberOfLines={2}
          style={[s.nome, { color: e === "locked" ? palette.textMuted : palette.text, textShadowColor: cores.bg }]}
        >
          {topico.nome}
        </Text>
        <View
          style={[
            s.chip,
            chipAceso
              ? { backgroundColor: palette.accentMuted, borderColor: cores.accentSoft }
              : { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <MaterialCommunityIcons
            name={topico.personalizado ? "star-four-points" : chip.icone}
            size={11}
            color={chipAceso ? palette.accent : palette.textMuted}
          />
          <Text style={[s.chipTexto, { color: chipAceso ? palette.accent : palette.textMuted }]}>{chip.texto(topico)}</Text>
        </View>
      </View>

      {e === "current" ? (
        <View style={[s.aqui, { backgroundColor: palette.accent }]} pointerEvents="none">
          <Image source={rosto as never} style={[s.aquiRosto, { borderColor: cores.bg }]} />
          <Text style={[s.aquiTexto, { color: cores.bg }]}>Você parou aqui</Text>
          <View style={[s.aquiSeta, { borderTopColor: palette.accent }]} />
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  rolagem: { flex: 1 },
  bussola: { position: "absolute", left: 4, opacity: 0.28 },
  no: { position: "absolute", width: LARGURA_NO, alignItems: "center" },
  noHover: { transform: [{ translateY: -3 }] },
  hex: { width: TAMANHO_HEX, height: TAMANHO_HEX },
  halo: { position: "absolute", left: -TAMANHO_HEX * 0.45, top: -TAMANHO_HEX * 0.45 },
  persoPonto: { position: "absolute", right: 0, bottom: 2, width: 24, height: 24, borderRadius: 12, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  rotulo: { marginTop: 10, alignItems: "center", gap: 6, maxWidth: LARGURA_NO },
  nome: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13.5,
    fontWeight: "600",
    lineHeight: 17.5,
    textAlign: "center",
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 1 },
  },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  chipTexto: { fontFamily: FontFamily.interMedium, fontSize: 10.5, fontWeight: "600" },
  aqui: {
    position: "absolute",
    top: -42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  aquiRosto: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  aquiTexto: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: "700" },
  aquiSeta: {
    position: "absolute",
    bottom: -7,
    left: "50%",
    marginLeft: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
