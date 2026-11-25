import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PontoDoTopico } from "@/components/web/CabecalhoTopicoDesktop";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

const SUCESSO = "#62db9b";

/**
 * Linha 2 do cabeçalho do Tópico no celular (mobile-v1): as partes como barra segmentada de
 * largura total + "3 de 5". Um segmento por página (cada questão e cada bloco de conteúdo), com
 * 48px de alvo de toque mesmo com traço de 4px. Só a página liberada abre (`paginasDoTopico`).
 */
export function BarraPartesTopico({
  palette,
  paginas,
  atual,
  onIr,
  aviso,
  alvoRef,
}: {
  palette: ProfileShellPalette;
  paginas: PontoDoTopico[];
  /** Posição da página aberta (1 a N); 0 na visão geral do módulo. */
  atual: number;
  onIr: (indice: number) => void;
  aviso?: string | null;
  /** Alvo do tour/guia ("progresso do módulo"). */
  alvoRef?: React.RefObject<View | null>;
}) {
  const total = paginas.length;
  if (total === 0) return null;
  return (
    <View ref={alvoRef} collapsable={false} style={[s.raiz, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={atual > 0 ? `Parte ${atual} de ${total}` : `${total} partes`}
        style={s.segmentos}
      >
        {paginas.map((pagina, i) => (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`Ir para a parte ${i + 1}`}
            accessibilityState={{ selected: pagina.estado === "atual", disabled: !pagina.liberada }}
            disabled={!pagina.liberada}
            onPress={() => onIr(i)}
            style={[s.alvo, i > 0 && pagina.inicioDoBloco && s.inicioDoBloco]}
          >
            <View
              style={[
                s.traco,
                {
                  backgroundColor:
                    pagina.estado === "feito"
                      ? SUCESSO
                      : pagina.estado === "atual"
                      ? palette.accent
                      : palette.progressTrack,
                  opacity: pagina.liberada ? 1 : 0.45,
                },
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
  inicioDoBloco: { marginLeft: 4 },
  traco: { height: 4, borderRadius: 2 },
  contador: { fontFamily: FontFamily.interMedium, fontSize: 13, fontVariant: ["tabular-nums"], minWidth: 44, textAlign: "right" },
  aviso: { position: "absolute", right: 12, bottom: 0, fontFamily: FontFamily.interMedium, fontSize: 10 },
});
