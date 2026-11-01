import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { percentualDaMissao, type MissaoNoRastreador } from "@/services/missoes/rastreadorDeMissoes";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { shadowStyle } from "@/utils/webShadow";

import { comGuia, prazoApertado, segmentosDosFeitos, type VarianteDoRastreador } from "./variantesDoRastreador";

const IS_WEB = Platform.OS === "web";
const SOMBRA = { offset: { width: 0, height: 6 }, opacity: 0.35, radius: 12 };
// Fixa como as outras cores de estado (AAA): o "cumprido" não deriva do accent do perfil.
const SUCESSO = "#4ADE80";

/** Lado do ícone: o mesmo do lançador do mentor, que fica na mesma linha. */
export const LADO_DO_ICONE = 58;
const T = LADO_DO_ICONE;
const C = T / 2;

export type PropsDoBotao = {
  variante: VarianteDoRastreador;
  guia: string;
  atual: MissaoNoRastreador | null;
  abertas: readonly MissaoNoRastreador[];
  encerradas: readonly MissaoNoRastreador[];
  palette: ProfileShellPalette;
  posicao: ViewStyle;
  onPress: () => void;
};

/**
 * O ícone de missões, fechado. Sem texto: o que a missão pede, o prazo e o "Ir" estão na folha
 * que ele abre. Aqui só o que se lê de relance — quantas estão em aberto (selo) e quanto da
 * missão da vez já foi feito (o contorno) —, com moldura, emblema e progresso do perfil.
 */
export function BotaoDoRastreador({ variante, guia, atual, abertas, encerradas, palette, posicao, onPress }: PropsDoBotao) {
  const feitas = encerradas.filter((m) => m.status === "concluida").length;
  const tudoFeito = !atual && feitas > 0;
  const pct = atual ? percentualDaMissao(atual) : tudoFeito ? 100 : 0;
  const pulsar = variante.pulsaNoPrazo && !!atual && prazoApertado(atual.prazo);
  const titulo = comGuia(variante.tituloDaFolha, guia);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={
        atual
          ? `${titulo}: ${abertas.length} ${abertas.length === 1 ? "missão" : "missões"} em aberto. Próxima: ${atual.titulo}, ${pct}% feito. Abrir.`
          : `${titulo}: nenhuma missão em aberto. Abrir.`
      }
      style={({ pressed }) => [
        s.raiz,
        posicao,
        variante.moldura === "circulo" && { borderRadius: C, ...shadowStyle({ ...SOMBRA, color: palette.background }, IS_WEB) },
        { transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}
    >
      <Moldura variante={variante} palette={palette} pct={pct} feitas={feitas} total={feitas + abertas.length} cumprido={tudoFeito} />
      <Emblema variante={variante} palette={palette} pulsar={pulsar} />
      {abertas.length > 0 ? (
        <View style={[s.selo, { backgroundColor: palette.accent, borderColor: palette.background }]}>
          <Text style={[s.seloTexto, { color: palette.background }]}>{abertas.length > 9 ? "9+" : abertas.length}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/* ---------- moldura e progresso ---------- */

/** Hexágono de ponta para cima, inscrito no quadrado. */
function hexagono(r: number) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`;
  });
  return { d: `M${pts.join(" L")} Z`, perimetro: 6 * r };
}

/** Placa de cantos chanfrados (octógono), começando no meio do lado de cima. */
function placa(m: number, chanfro: number) {
  const a = m;
  const b = T - m;
  const d = [
    `M${C},${a}`,
    `L${b - chanfro},${a}`,
    `L${b},${a + chanfro}`,
    `L${b},${b - chanfro}`,
    `L${b - chanfro},${b}`,
    `L${a + chanfro},${b}`,
    `L${a},${b - chanfro}`,
    `L${a},${a + chanfro}`,
    `L${a + chanfro},${a}`,
    "Z",
  ].join(" ");
  const reto = T - 2 * m - 2 * chanfro;
  return { d, perimetro: 4 * reto + 4 * chanfro * Math.SQRT2 };
}

function Moldura({
  variante,
  palette,
  pct,
  feitas,
  total,
  cumprido,
}: {
  variante: VarianteDoRastreador;
  palette: ProfileShellPalette;
  pct: number;
  feitas: number;
  total: number;
  cumprido: boolean;
}) {
  const corDoFeito = cumprido ? SUCESSO : palette.accent;
  const trilho = palette.progressTrack;
  const fundo = palette.surfaceElevated;

  if (variante.moldura === "hexagono" || variante.moldura === "placa") {
    const traco = 3;
    const forma = variante.moldura === "hexagono" ? hexagono(C - traco / 2 - 0.5) : placa(traco / 2 + 0.5, 12);
    return (
      <Svg width={T} height={T} style={StyleSheet.absoluteFill}>
        <Path d={forma.d} fill={fundo} stroke={trilho} strokeWidth={traco} strokeLinejoin="round" />
        {pct > 0 ? (
          <Path
            d={forma.d}
            fill="none"
            stroke={corDoFeito}
            strokeWidth={traco}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={`${(forma.perimetro * pct) / 100} ${forma.perimetro}`}
          />
        ) : null}
        {variante.moldura === "placa"
          ? [
              [11, 11],
              [T - 11, 11],
              [11, T - 11],
              [T - 11, T - 11],
            ].map(([x, y]) => <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.6} fill={palette.textMuted} />)
          : null}
      </Svg>
    );
  }

  const traco = variante.progresso === "grosso" ? 6 : variante.progresso === "fino" ? 2.5 : 4;
  const r = C - traco / 2 - 0.5;
  const volta = 2 * Math.PI * r;
  const girar = `rotate(-90 ${C} ${C})`;

  if (variante.progresso === "pontilhado") {
    // Pegadas: 12 pontos em volta, acesos na proporção do progresso.
    const n = 12;
    const acesos = Math.round((pct / 100) * n);
    return (
      <Svg width={T} height={T} style={StyleSheet.absoluteFill}>
        <Circle cx={C} cy={C} r={C - 1} fill={fundo} />
        {Array.from({ length: n }, (_, i) => {
          const a = (2 * Math.PI * i) / n - Math.PI / 2;
          return (
            <Circle
              key={i}
              cx={C + (C - 4.5) * Math.cos(a)}
              cy={C + (C - 4.5) * Math.sin(a)}
              r={i < acesos ? 2.6 : 1.8}
              fill={i < acesos ? corDoFeito : trilho}
            />
          );
        })}
      </Svg>
    );
  }

  if (variante.progresso === "segmentos") {
    const seg = segmentosDosFeitos(feitas, total);
    const vao = seg.total > 1 ? 4 : 0;
    const passo = seg.total ? volta / seg.total : volta;
    return (
      <Svg width={T} height={T} style={StyleSheet.absoluteFill}>
        <Circle cx={C} cy={C} r={C - 0.5} fill={fundo} />
        {seg.total === 0 ? (
          <Circle cx={C} cy={C} r={r} stroke={trilho} strokeWidth={traco} fill="none" />
        ) : (
          Array.from({ length: seg.total }, (_, i) => (
            <Circle
              key={i}
              cx={C}
              cy={C}
              r={r}
              stroke={i < seg.acesos ? SUCESSO : trilho}
              strokeWidth={traco}
              fill="none"
              strokeDasharray={`${passo - vao} ${volta}`}
              strokeDashoffset={-i * passo}
              transform={girar}
            />
          ))
        )}
      </Svg>
    );
  }

  return (
    <Svg width={T} height={T} style={StyleSheet.absoluteFill}>
      <Circle cx={C} cy={C} r={C - 0.5} fill={fundo} />
      <Circle cx={C} cy={C} r={r} stroke={trilho} strokeWidth={traco} fill="none" />
      {pct > 0 ? (
        <Circle
          cx={C}
          cy={C}
          r={r}
          stroke={corDoFeito}
          strokeWidth={traco}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(volta * pct) / 100} ${volta}`}
          transform={girar}
        />
      ) : null}
    </Svg>
  );
}

/* ---------- emblema ---------- */

function Emblema({ variante, palette, pulsar }: { variante: VarianteDoRastreador; palette: ProfileShellPalette; pulsar: boolean }) {
  const escala = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!pulsar) {
      escala.setValue(1);
      return;
    }
    const laco = Animated.loop(
      Animated.sequence([
        Animated.timing(escala, { toValue: 1.14, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: !IS_WEB }),
        Animated.timing(escala, { toValue: 1, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: !IS_WEB }),
        Animated.delay(700),
      ]),
    );
    laco.start();
    return () => laco.stop();
  }, [escala, pulsar]);

  return (
    <Animated.View style={[s.emblema, { transform: [{ scale: escala }], pointerEvents: "none" }]}>
      <MaterialCommunityIcons name={variante.emblema as never} size={26} color={palette.accent} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  raiz: {
    position: "absolute",
    zIndex: 30,
    elevation: 12,
    width: T,
    height: T,
    alignItems: "center",
    justifyContent: "center",
  },
  emblema: { alignItems: "center", justifyContent: "center" },
  selo: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  seloTexto: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700" },
});
