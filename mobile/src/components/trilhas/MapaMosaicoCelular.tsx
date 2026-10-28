import React, { useId, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, G, Path, Pattern, RadialGradient, Stop } from "react-native-svg";
import tinycolor from "tinycolor2";

import { HexagonoTopico } from "@/components/web/HexagonoTopico";
import type { TopicoMapa } from "@/components/web/MapaPaisesDesktop";
import { guardianFaceImages } from "@/constants/profileImages";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";
import { useTrailAutoFocus } from "@/hooks/useTrailAutoFocus";
import { FontFamily } from "@/styles/GlobalStyle";
import { caminhoCelula, layoutMapaCelular, MAPA_TOPO, ondaMar, trechoEstrada } from "@/utils/mapaPaises";
import type { EstadoTopico } from "@/utils/painelTopicoTrilha";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { textShadowStyle } from "@/utils/webShadow";
import { BalaoVoceParouAqui, ChipEstadoTopico, textoDoEstado } from "./MarcadoresTopico";

const IS_WEB = Platform.OS === "web";
const SOMBRA_NOME = { offset: { width: 0, height: 1 }, radius: 8 };
const TAMANHO_HEX = 56;
const LARGURA_NO = 150;

const mistura = (a: string, b: string, pctB: number) => tinycolor.mix(a, b, pctB).toRgbString();

/**
 * Mapa de países da Trilha no celular (mobile-v1, `03-trilha.html`, `mapa()`): o
 * continente é UMA massa de terra recortada em países que dividem fronteira, como
 * um mosaico — não formas soltas. 2 colunas na largura da tela, em serpentina,
 * rolando só na vertical. A geometria é a mesma da web larga (`utils/mapaPaises`);
 * aqui muda só a grade e o tamanho do nó. Tocar num país chama `onSelecionar`
 * (a Trilha decide entre selecionar, abrir ou explicar o bloqueio).
 */
export function MapaMosaicoCelular({
  topicos,
  selecionado,
  perfil,
  palette,
  onSelecionar,
  tourTargetRef,
}: {
  topicos: TopicoMapa[];
  selecionado: string | null;
  perfil: string | null | undefined;
  palette: ProfileShellPalette;
  onSelecionar: (id: string) => void;
  tourTargetRef?: React.RefObject<View | null>;
}) {
  // Ids de gradiente e padrão únicos por instância (`url(#id)` repetido aponta para outra cópia).
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const janela = useWindowDimensions();
  const [largura, setLargura] = useState(janela.width);
  const L = useMemo(() => layoutMapaCelular(topicos.length, largura), [topicos.length, largura]);
  const cores = useMemo(() => {
    const bg = palette.background;
    return {
      bg,
      accentSoft: tinycolor(palette.accent).setAlpha(0.18).toRgbString(),
      bgA55: tinycolor(bg).setAlpha(0.55).toRgbString(),
      semNome: mistura(bg, palette.surface, 80),
      pais: {
        done: { fill: mistura(bg, palette.accentStrong, 62), stroke: palette.accent, dash: undefined },
        current: { fill: mistura(bg, palette.accent, 48), stroke: palette.text, dash: undefined },
        open: { fill: mistura(palette.surface, palette.accent, 16), stroke: palette.borderStrong, dash: undefined },
        locked: { fill: mistura(bg, palette.surface, 92), stroke: palette.border, dash: "6 6" },
      } as Record<EstadoTopico, { fill: string; stroke: string; dash?: string }>,
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
  // Abre centrado no tópico atual (no protótipo, `scrollTop` até `.no.atual`).
  const foco = useTrailAutoFocus(atual >= 0 ? topicos[atual].id : null, atual >= 0 ? L.nos[atual].y : null);

  return (
    <ScrollView
      {...foco}
      showsVerticalScrollIndicator={false}
      style={s.rolagem}
      onLayout={(e) => {
        foco.onLayout(e);
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== largura) setLargura(w);
      }}
    >
      <View style={{ width: L.largura, height: L.altura }}>
        <Svg width={L.largura} height={L.altura} style={StyleSheet.absoluteFill}>
          <Defs>
            <Pattern id={`hachura-${uid}`} width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <Path d="M0 0V10" stroke={palette.border} strokeWidth={2} />
            </Pattern>
          </Defs>
          {/* Mar: as ondas atravessando o mapa. */}
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <Path
              key={`p${i}`}
              d={ondaMar((L.altura * i) / 10, 5 + i, L.largura)}
              fill="none"
              stroke={palette.borderStrong}
              strokeOpacity={0.12}
            />
          ))}
          {/* Costa: sombra e halo do continente inteiro. */}
          <Path d={continente} fill="rgba(0,0,0,0.4)" transform="translate(0 10)" />
          <Path d={continente} fill="none" stroke={palette.borderStrong} strokeOpacity={0.35} strokeWidth={12} strokeLinejoin="round" />
          {/* Países: território e fronteira na cor do fundo; célula sem tópico vira terra sem nome. */}
          {L.celulas.map(({ c, r }) => {
            const t = topicoNa(c, r);
            const d = caminhoCelula(L, c, r);
            return (
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
              strokeWidth={14}
              strokeLinecap="round"
              pointerEvents="none"
            />
          ) : null}
          {L.nos.slice(0, -1).map((n, i) => {
            const d = trechoEstrada(n, L.nos[i + 1]);
            if (i < percorrido)
              return (
                <G key={`e${i}`} pointerEvents="none">
                  <Path d={d} fill="none" stroke={cores.accentSoft} strokeWidth={10} strokeLinecap="round" />
                  <Path d={d} fill="none" stroke={palette.accent} strokeWidth={4} strokeLinecap="round" />
                </G>
              );
            if (topicos[i + 1]?.estado === "locked")
              return <Path key={`e${i}`} d={d} fill="none" stroke={palette.borderStrong} strokeOpacity={0.7} strokeWidth={3} strokeDasharray="1 9" strokeLinecap="round" pointerEvents="none" />;
            return <Path key={`e${i}`} d={d} fill="none" stroke={palette.accent} strokeWidth={3} strokeDasharray="2 10" strokeLinecap="round" pointerEvents="none" />;
          })}
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
              fundo={cores.bg}
              alvoTourRef={i === 0 ? tourTargetRef : undefined}
              onPress={() => onSelecionar(t.id)}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

function NoPais({
  topico,
  numero,
  x,
  y,
  selecionado,
  rosto,
  uid,
  palette,
  fundo,
  alvoTourRef,
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
  fundo: string;
  alvoTourRef?: React.RefObject<View | null>;
  onPress: () => void;
}) {
  const e = topico.estado;
  const idGrad = `hexcel-${uid}-${topico.id}`;
  const rotulo = `${numero}. ${topico.nome}: ${e === "current" ? `você parou aqui, ${topico.percentual}%` : textoDoEstado(topico)}`;

  return (
    <Pressable
      ref={alvoTourRef}
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ selected: selecionado }}
      accessibilityHint={e === "locked" ? "Toque para saber como desbloquear" : undefined}
      onPress={onPress}
      style={[s.no, { left: x - LARGURA_NO / 2, top: y - TAMANHO_HEX / 2 }]}
    >
      <View style={s.hex}>
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
      </View>

      <View style={s.rotulo}>
        <Text
          numberOfLines={2}
          style={[s.nome, { color: e === "locked" ? palette.textMuted : palette.text, ...textShadowStyle({ ...SOMBRA_NOME, color: fundo }, IS_WEB) }]}
        >
          {topico.nome}
        </Text>
        <ChipEstadoTopico topico={topico} palette={palette} />
      </View>

      {e === "current" ? <BalaoVoceParouAqui rosto={rosto} palette={palette} style={s.aqui} /> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  rolagem: { flex: 1 },
  no: { position: "absolute", width: LARGURA_NO, alignItems: "center" },
  hex: { width: TAMANHO_HEX, height: TAMANHO_HEX },
  halo: { position: "absolute", left: -TAMANHO_HEX * 0.45, top: -TAMANHO_HEX * 0.45 },
  rotulo: { marginTop: 8, alignItems: "center", gap: 5, maxWidth: LARGURA_NO },
  nome: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 16,
    textAlign: "center",
    ...textShadowStyle(SOMBRA_NOME, IS_WEB),
  },
  aqui: { top: -38 },
});
