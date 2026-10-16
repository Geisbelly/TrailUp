import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

const SUCESSO = "#62db9b";

export type EstadoBlocoTopico = "feito" | "atual" | "pendente";

/**
 * Cabeçalho do Tópico na web em tela larga (#346, protótipo v4 04-topico): voltar,
 * a região do mapa sobre "N. título", e à direita um ponto por bloco com
 * "x de y". `acoes` recebe o cronômetro e o guia, que no celular ficam no
 * cabeçalho de navegação.
 */
export function CabecalhoTopicoDesktop({
  palette,
  regiao,
  numero,
  titulo,
  blocos,
  atual,
  aviso,
  acoes,
  onVoltar,
}: {
  palette: ProfileShellPalette;
  /** País do tema do mapa; sem tema, nada. */
  regiao?: string | null;
  numero?: number | null;
  titulo: string;
  blocos: EstadoBlocoTopico[];
  /** Posição do bloco aberto (1 a N); 0 na visão geral do módulo. */
  atual: number;
  /** Ex.: "Atualizando conteúdo personalizado...". */
  aviso?: string | null;
  acoes?: React.ReactNode;
  onVoltar: () => void;
}) {
  const total = blocos.length;
  return (
    <View style={[s.barra, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar para a trilha"
        onPress={onVoltar}
        style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
          s.voltar,
          { backgroundColor: hovered ? palette.accentMuted : palette.surfaceElevated },
        ]}
      >
        <MaterialCommunityIcons name="arrow-left" size={18} color={palette.text} />
      </Pressable>

      <View style={s.textos}>
        {regiao ? (
          <Text numberOfLines={1} style={[s.regiao, { color: palette.accent }]}>
            {regiao.toUpperCase()}
          </Text>
        ) : null}
        <Text accessibilityRole="header" numberOfLines={1} style={[s.titulo, { color: palette.text }]}>
          {numero ? `${numero}. ` : ""}
          {titulo}
        </Text>
      </View>

      <View style={s.direita}>
        {aviso ? <Text style={[s.aviso, { color: palette.textSubtle }]}>{aviso}</Text> : null}
        {total > 0 ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={atual > 0 ? `Bloco ${atual} de ${total}` : `${total} blocos`}
            style={s.progresso}
          >
            <View style={s.pontos}>
              {blocos.map((estado, i) => (
                <View
                  key={i}
                  style={[
                    s.ponto,
                    estado === "atual" && s.pontoAtual,
                    {
                      backgroundColor:
                        estado === "feito" ? SUCESSO : estado === "atual" ? palette.accent : palette.accentMuted,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={[s.contador, { color: palette.textMuted }]}>
              {atual > 0 ? `${atual} de ${total}` : `${total} ${total === 1 ? "bloco" : "blocos"}`}
            </Text>
          </View>
        ) : null}
        {acoes}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  barra: {
    height: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  voltar: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  regiao: { fontFamily: FontFamily.interMedium, fontSize: 11.5, letterSpacing: 1.2 },
  titulo: { fontFamily: FontFamily.interMedium, fontSize: 17, fontWeight: "700" },
  direita: { flexDirection: "row", alignItems: "center", gap: 16 },
  aviso: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  progresso: { flexDirection: "row", alignItems: "center", gap: 10 },
  pontos: { flexDirection: "row", alignItems: "center", gap: 6 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  pontoAtual: { width: 20 },
  contador: { fontFamily: FontFamily.interMedium, fontSize: 13, fontVariant: ["tabular-nums"] },
});
