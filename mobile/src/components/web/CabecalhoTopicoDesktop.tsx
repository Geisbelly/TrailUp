import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { PaginaDoTopico } from "@/utils/paginasDoTopico";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

const SUCESSO = "#62db9b";

export type PontoDoTopico = Pick<PaginaDoTopico, "estado" | "liberada" | "inicioDoBloco">;

/**
 * Cabeçalho do Tópico na web em tela larga (#346, protótipo v4 04-topico): voltar,
 * a região do mapa sobre "N. título", e à direita um ponto por página (cada questão e
 * cada bloco de conteúdo) com "x de y". O ponto leva à página só quando ela está
 * liberada (`paginasDoTopico`). `acoes` recebe o cronômetro e o guia, que no celular
 * ficam no cabeçalho de navegação.
 */
export function CabecalhoTopicoDesktop({
  palette,
  regiao,
  numero,
  titulo,
  paginas,
  atual,
  onIr,
  aviso,
  acoes,
  onVoltar,
}: {
  palette: ProfileShellPalette;
  /** País do tema do mapa; sem tema, nada. */
  regiao?: string | null;
  numero?: number | null;
  titulo: string;
  paginas: PontoDoTopico[];
  /** Posição da página aberta (1 a N); 0 na visão geral do módulo. */
  atual: number;
  /** Abre a página (0 a N-1). Só é chamado para página liberada. */
  onIr: (posicao: number) => void;
  /** Ex.: "Atualizando conteúdo personalizado...". */
  aviso?: string | null;
  acoes?: React.ReactNode;
  onVoltar: () => void;
}) {
  const total = paginas.length;
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
            accessibilityLabel={atual > 0 ? `Página ${atual} de ${total}` : `${total} páginas`}
            style={s.progresso}
          >
            <View style={s.pontos}>
              {paginas.map((pagina, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={`Ir para a página ${i + 1}`}
                  accessibilityState={{ disabled: !pagina.liberada, selected: pagina.estado === "atual" }}
                  disabled={!pagina.liberada}
                  onPress={() => onIr(i)}
                  hitSlop={{ top: 10, bottom: 10, left: 2, right: 2 }}
                  style={[s.alvoPonto, i > 0 && pagina.inicioDoBloco && s.inicioDoBloco]}
                >
                  <View
                    style={[
                      s.ponto,
                      pagina.estado === "atual" && s.pontoAtual,
                      {
                        backgroundColor:
                          pagina.estado === "feito"
                            ? SUCESSO
                            : pagina.estado === "atual"
                            ? palette.accent
                            : palette.accentMuted,
                        opacity: pagina.liberada ? 1 : 0.45,
                      },
                    ]}
                  />
                </Pressable>
              ))}
            </View>
            <Text style={[s.contador, { color: palette.textMuted }]}>
              {atual > 0 ? `${atual} de ${total}` : `${total} ${total === 1 ? "página" : "páginas"}`}
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
  pontos: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap", maxWidth: 360 },
  alvoPonto: { paddingVertical: 4 },
  inicioDoBloco: { marginLeft: 6 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  pontoAtual: { width: 20 },
  contador: { fontFamily: FontFamily.interMedium, fontSize: 13, fontVariant: ["tabular-nums"] },
});
