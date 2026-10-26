import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, Platform } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import { imprimirHtmlNaWeb } from "@/utils/imprimirHtmlWeb";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { shadowStyle } from "@/utils/webShadow";

const IS_WEB = Platform.OS === "web";

const ENTRA = [
  "Eventos de estudo e pontuação registrados durante suas sessões",
  "Suas posições em rankings da turma",
  "Conquistas desbloqueadas e seu progresso",
];
const PERIGO = { fundo: "rgba(224,87,76,0.12)", borda: "rgba(224,87,76,0.55)", texto: "#f0847c" };

/**
 * Relatório dos dados na web em tela larga (#346, protótipo v4,
 * 10-relatorio-dados.html): o que entra no relatório, o botão que gera o PDF
 * (pela impressão do navegador, com "Salvar como PDF") com um erro visível e
 * "Tentar novamente", e uma prévia do PDF ao lado. O HTML é o mesmo do app.
 */
export function RelatorioDesktop({
  html,
  nome,
  totalEventos,
  melhorPosicao,
  palette,
  resumoRef,
  botaoRef,
}: {
  html: string;
  nome: string;
  totalEventos: number;
  melhorPosicao: number | null;
  palette: ProfileShellPalette;
  resumoRef?: React.RefObject<View | null>;
  botaoRef?: React.RefObject<View | null>;
}) {
  const [estado, setEstado] = useState<"pronto" | "gerando" | "erro">("pronto");

  const gerar = async () => {
    setEstado("gerando");
    try {
      await imprimirHtmlNaWeb(html, `Relatório TrailUp — ${nome}`);
      setEstado("pronto");
    } catch (erro) {
      console.warn("[Relatorio] Falha ao gerar o PDF:", erro);
      setEstado("erro");
    }
  };

  return (
    <ScrollView style={{ backgroundColor: palette.background }} contentContainerStyle={s.fora}>
      <View style={s.pagina}>
        <View style={s.principal}>
          <Text style={[s.eyebrow, { color: palette.accent }]}>PERFIL</Text>
          <Text accessibilityRole="header" style={[s.titulo, { color: palette.text }]}>Relatório dos seus dados</Text>

          <View ref={resumoRef} collapsable={false} style={[s.cartao, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[s.cartaoTitulo, { color: palette.text }]}>O que entra no relatório</Text>
            {ENTRA.map((linha) => (
              <View key={linha} style={s.item}>
                <MaterialCommunityIcons name="check" size={16} color={palette.accent} />
                <Text style={[s.itemTexto, { color: palette.textMuted }]}>{linha}</Text>
              </View>
            ))}
          </View>

          <View ref={botaoRef} collapsable={false} style={[s.cartao, s.cartaoAcao, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[s.acaoTexto, { color: palette.textMuted }]}>Gere um PDF com tudo isso pra guardar ou compartilhar quando quiser.</Text>
            <Pressable
              accessibilityRole="button"
              disabled={estado === "gerando"}
              onPress={() => void gerar()}
              style={[s.botao, { backgroundColor: palette.accent, opacity: estado === "gerando" ? 0.7 : 1 }]}
            >
              {estado === "gerando" ? (
                <ActivityIndicator color={palette.background} />
              ) : (
                <MaterialCommunityIcons name="file-pdf-box" size={18} color={palette.background} />
              )}
              <Text style={[s.botaoTexto, { color: palette.background }]}>Gerar o PDF</Text>
            </Pressable>
            <Text style={[s.nota, { color: palette.textSubtle }]}>
              Abre a impressão do navegador: escolha &quot;Salvar como PDF&quot; para guardar o arquivo.
            </Text>

            {estado === "erro" ? (
              <View accessibilityRole="alert" style={[s.erro, { backgroundColor: PERIGO.fundo, borderColor: PERIGO.borda }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={PERIGO.texto} />
                <View style={s.erroTextos}>
                  <Text style={[s.erroTitulo, { color: palette.text }]}>Não foi possível gerar o relatório agora</Text>
                  <Text style={[s.erroCorpo, { color: palette.textMuted }]}>
                    Isso pode acontecer por instabilidade momentânea. Tente novamente — se persistir, procure seu professor ou a coordenação.
                  </Text>
                  <Pressable accessibilityRole="button" onPress={() => void gerar()} style={s.tentar}>
                    <MaterialCommunityIcons name="refresh" size={15} color={PERIGO.texto} />
                    <Text style={[s.tentarTexto, { color: PERIGO.texto }]}>Tentar novamente</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <View style={s.lado}>
          <Text style={[s.eyebrow, { color: palette.textMuted }]}>PRÉVIA DO PDF</Text>
          {/* Miniatura da primeira página: o título real e dois números do relatório. */}
          <View accessibilityLabel={`Prévia do PDF: relatório de ${nome}`} style={s.folha}>
            <Text style={s.folhaTitulo} numberOfLines={1}>Relatório TrailUp — {nome}</Text>
            <View style={s.folhaRegua} />
            {[100, 86, 92, 60].map((w, i) => (
              <View key={`a${i}`} style={[s.folhaLinha, { width: `${w}%` }]} />
            ))}
            <View style={s.folhaEspaco} />
            {[94, 70, 82].map((w, i) => (
              <View key={`b${i}`} style={[s.folhaLinha, { width: `${w}%` }]} />
            ))}
            <View style={s.folhaChips}>
              <Text style={s.folhaChip}>{totalEventos} eventos</Text>
              {melhorPosicao ? <Text style={s.folhaChip}>{melhorPosicao}º no rank</Text> : null}
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  fora: { alignItems: "center" },
  pagina: { width: "100%", maxWidth: 1080, flexDirection: "row", gap: 28, paddingHorizontal: 32, paddingTop: 28, paddingBottom: 60 },
  principal: { flex: 1, minWidth: 0, maxWidth: 620 },
  lado: { width: 300, paddingTop: 2, gap: 12 },
  eyebrow: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, marginBottom: 4 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 28, marginBottom: 18 },
  cartao: { borderRadius: 14, borderWidth: 1, padding: 20, gap: 10, marginBottom: 18 },
  cartaoTitulo: { fontFamily: FontFamily.inikaBold, fontSize: 16, marginBottom: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 10 },
  itemTexto: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  cartaoAcao: { alignItems: "stretch", gap: 14 },
  acaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, textAlign: "center" },
  botao: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, paddingVertical: 13 },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700" },
  nota: { fontFamily: FontFamily.interMedium, fontSize: 11.5, textAlign: "center", marginTop: -6 },
  erro: { flexDirection: "row", gap: 10, borderRadius: 10, borderWidth: 1, padding: 14 },
  erroTextos: { flex: 1, gap: 4 },
  erroTitulo: { fontFamily: FontFamily.interMedium, fontSize: 13.5, fontWeight: "700" },
  erroCorpo: { fontFamily: FontFamily.interMedium, fontSize: 12.5, lineHeight: 18 },
  tentar: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  tentarTexto: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700" },
  folha: { backgroundColor: "#f6f6f2", borderRadius: 8, padding: 18, gap: 7, transform: [{ rotate: "2deg" }], ...shadowStyle({ color: "#000", offset: { width: 0, height: 10 }, opacity: 0.4, radius: 18 }, IS_WEB) },
  folhaTitulo: { fontFamily: FontFamily.inikaBold, fontSize: 13, color: "#1c2238" },
  folhaRegua: { height: 2, backgroundColor: "#1c2238", marginBottom: 4 },
  folhaLinha: { height: 5, borderRadius: 3, backgroundColor: "#dcdde3" },
  folhaEspaco: { height: 8 },
  folhaChips: { flexDirection: "row", gap: 6, marginTop: 8 },
  folhaChip: { fontFamily: FontFamily.interMedium, fontSize: 9.5, color: "#3b4a8c", backgroundColor: "#e3e8fb", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
});
