import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { EstadoBlocoTopico } from "@/components/web/CabecalhoTopicoDesktop";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

const SUCESSO = "#62db9b";

/**
 * Linha 2 do cabeçalho do Tópico no celular (mobile-v1): as partes como barra segmentada de
 * largura total + "3 de 5". Cada segmento tem 48px de alvo de toque, mesmo com traço de 4px,
 * e leva à parte tocada.
 */
export function BarraPartesTopico({
  palette,
  blocos,
  atual,
  onIr,
  aviso,
  alvoRef,
  reservaDireita = 0,
}: {
  palette: ProfileShellPalette;
  blocos: EstadoBlocoTopico[];
  /** Posição do bloco aberto (1 a N); 0 na visão geral do módulo. */
  atual: number;
  onIr: (indice: number) => void;
  aviso?: string | null;
  /** Alvo do tour/guia ("progresso do módulo"). */
  alvoRef?: React.RefObject<View | null>;
  /** Espaço à direita para o chip de batalha flutuante (absoluto, top 8 / right 16), que senão cobre o contador. */
  reservaDireita?: number;
}) {
  const total = blocos.length;
  if (total === 0) return null;
  return (
    <View ref={alvoRef} collapsable={false} style={[s.raiz, { backgroundColor: palette.surface, borderBottomColor: palette.border }, reservaDireita > 0 ? { paddingRight: reservaDireita } : null]}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={atual > 0 ? `Parte ${atual} de ${total}` : `${total} partes`}
        style={s.segmentos}
      >
        {blocos.map((estado, i) => (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`Ir para a parte ${i + 1}`}
            accessibilityState={{ selected: estado === "atual" }}
            onPress={() => onIr(i)}
            style={s.alvo}
          >
            <View
              style={[
                s.traco,
                { backgroundColor: estado === "feito" ? SUCESSO : estado === "atual" ? palette.accent : palette.progressTrack },
              ]}
            />
          </Pressable>
        ))}
      </View>
      <Text style={[s.contador, { color: palette.textMuted }]}>
        {atual > 0 ? `${atual} de ${total}` : `${total} ${total === 1 ? "parte" : "partes"}`}
      </Text>
      {aviso ? <Text style={[s.aviso, { color: palette.textSubtle }]}>{aviso}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderBottomWidth: 1 },
  segmentos: { flex: 1, flexDirection: "row", gap: 2 },
  alvo: { flex: 1, height: 48, justifyContent: "center" },
  traco: { height: 4, borderRadius: 2 },
  contador: { fontFamily: FontFamily.interMedium, fontSize: 13, fontVariant: ["tabular-nums"], minWidth: 44, textAlign: "right" },
  aviso: { position: "absolute", right: 12, bottom: 0, fontFamily: FontFamily.interMedium, fontSize: 10 },
});
