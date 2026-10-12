import React, { useState } from "react";
import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from "react-native";
import tinycolor from "tinycolor2";

import { FontFamily } from "@/styles/GlobalStyle";
import { posicaoBalaoTour, type Retangulo } from "@/utils/posicaoBalaoTour";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

const LARGURA = 380;
const LARGURA_APRESENTACAO = 760;

/**
 * Balão do tutorial inicial na web em tela larga (#346, protótipo v4,
 * `assets/tour.js`). Na apresentação, um cartão de 760 px no centro com a arte
 * do guia à esquerda; nos demais passos, um cartão de 380 px colado ao alvo
 * (`posicaoBalaoTour`), com o rosto do guia, a área, o título e o contador.
 */
export function BalaoTourDesktop({
  apresentacao,
  pagina,
  titulo,
  descricao,
  indice,
  total,
  alvo,
  tela,
  cor,
  palette,
  rosto,
  arte,
  nomeGuia,
  onPular,
  onVoltar,
  onProximo,
}: {
  apresentacao: boolean;
  pagina: string;
  titulo: string;
  descricao: string;
  indice: number;
  total: number;
  alvo: Retangulo | null;
  tela: { width: number; height: number };
  cor: string;
  palette: ProfileShellPalette;
  rosto: ImageSourcePropType;
  arte: ImageSourcePropType;
  nomeGuia: string;
  onPular: () => void;
  onVoltar: () => void;
  onProximo: () => void;
}) {
  // Altura medida do cartão: a posição depende dela (acima/abaixo e o limite da tela).
  const [altura, setAltura] = useState(220);
  const ultimo = indice >= total - 1;
  const borda = tinycolor(cor).lighten(6).setAlpha(0.85).toRgbString();

  const progresso = (
    <View style={s.progresso}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[s.traco, { backgroundColor: i <= indice ? cor : "rgba(255,255,255,0.14)" }]} />
      ))}
    </View>
  );
  const botoes = (
    <View style={s.acoes}>
      <Pressable accessibilityRole="button" accessibilityLabel="Pular tutorial inicial" onPress={onPular} style={s.link}>
        <Text style={[s.linkTexto, { color: palette.textMuted }]}>Pular</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={indice === 0}
        accessibilityState={{ disabled: indice === 0 }}
        onPress={onVoltar}
        style={[s.botao, { borderColor: borda, opacity: indice === 0 ? 0.4 : 1 }]}
      >
        <Text style={[s.botaoTexto, { color: palette.text }]}>Voltar</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onProximo} style={[s.botao, s.primario, { backgroundColor: cor, borderColor: cor }]}>
        <Text style={[s.botaoTexto, { color: "#0b1328" }]}>{ultimo ? "Começar" : "Próximo"}</Text>
      </Pressable>
    </View>
  );

  if (apresentacao) {
    return (
      <View style={s.centro} pointerEvents="box-none">
        <View
          accessibilityRole="none"
          accessibilityLabel="Tutorial inicial"
          style={[s.cartao, s.cartaoApresentacao, { backgroundColor: palette.surfaceElevated, borderColor: borda }]}
        >
          <View style={[s.arte, { backgroundColor: palette.background }]}>
            <View style={[s.aura, { backgroundColor: tinycolor(cor).setAlpha(0.28).toRgbString() }]} />
            <Image source={arte} resizeMode="contain" accessibilityLabel={`${nomeGuia}, guia do perfil`} style={s.arteImagem} />
          </View>
          <View style={s.corpo}>
            <View style={s.linhaTopo}>
              <Text style={[s.pagina, { color: cor }]}>{pagina.toUpperCase()}</Text>
              <Text style={[s.contador, { color: palette.textSubtle }]}>
                {indice + 1}/{total}
              </Text>
            </View>
            <Text style={[s.titulo, s.tituloApresentacao, { color: palette.text }]}>{titulo}</Text>
            <Text style={[s.descricao, s.descricaoApresentacao, { color: palette.textMuted }]}>{descricao}</Text>
            <View style={s.empurra} />
            {progresso}
            {botoes}
          </View>
        </View>
      </View>
    );
  }

  const { top, left } = posicaoBalaoTour(alvo, { width: LARGURA, height: altura }, tela);
  return (
    <View
      accessibilityLabel="Tutorial inicial"
      onLayout={(e) => {
        const h = Math.ceil(e.nativeEvent.layout.height);
        if (h !== altura) setAltura(h);
      }}
      style={[s.cartao, { top, left, width: LARGURA, backgroundColor: palette.surfaceElevated, borderColor: borda }]}
    >
      <View style={s.cabeca}>
        <Image source={rosto} resizeMode="cover" accessible={false} style={[s.rosto, { borderColor: cor }]} />
        <View style={s.cabecaTexto}>
          <Text style={[s.pagina, { color: cor }]}>{pagina.toUpperCase()}</Text>
          <Text style={[s.titulo, { color: palette.text }]}>{titulo}</Text>
        </View>
        <Text style={[s.contador, { color: palette.textSubtle }]}>
          {indice + 1}/{total}
        </Text>
      </View>
      <Text style={[s.descricao, { color: palette.textMuted }]}>{descricao}</Text>
      {progresso}
      {botoes}
    </View>
  );
}

const s = StyleSheet.create({
  centro: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 24 },
  cartao: {
    position: "absolute",
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 18 },
  },
  cartaoApresentacao: {
    position: "relative",
    width: LARGURA_APRESENTACAO,
    maxWidth: "100%",
    flexDirection: "row",
    gap: 24,
    padding: 0,
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
    overflow: "hidden",
  },
  arte: { width: 280, minHeight: 380, alignItems: "center", justifyContent: "flex-end" },
  aura: { position: "absolute", width: 260, height: 260, borderRadius: 130, bottom: 40 },
  arteImagem: { width: "100%", height: 380 },
  corpo: { flex: 1, paddingTop: 28, paddingRight: 28, paddingBottom: 22 },
  linhaTopo: { flexDirection: "row", alignItems: "flex-start" },
  empurra: { flex: 1, minHeight: 18 },
  cabeca: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  cabecaTexto: { flex: 1, minWidth: 0 },
  rosto: { width: 56, height: 56, borderRadius: 28, borderWidth: 2 },
  pagina: { fontFamily: FontFamily.interMedium, fontSize: 10.5, fontWeight: "800", letterSpacing: 1.05, flex: 1 },
  contador: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: "700", alignSelf: "flex-start" },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 18, lineHeight: 23, marginTop: 2 },
  tituloApresentacao: { fontSize: 24, lineHeight: 30, marginTop: 6, marginBottom: 12 },
  descricao: { fontFamily: FontFamily.interMedium, fontSize: 13.5, lineHeight: 21 },
  descricaoApresentacao: { fontSize: 14.5, lineHeight: 22 },
  progresso: { flexDirection: "row", gap: 4, marginTop: 14, marginBottom: 12 },
  traco: { flex: 1, height: 3, borderRadius: 2 },
  acoes: { flexDirection: "row", alignItems: "center", gap: 8 },
  link: { paddingVertical: 9, paddingHorizontal: 6 },
  linkTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  botao: { borderRadius: 999, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 16 },
  primario: { marginLeft: "auto" },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
});
