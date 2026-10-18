import { HallBackground } from "@/components/HallTheme";
import { Feather } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { useEmbutidoConfiguracoes } from "@/context/EmbutidoConfiguracoesContext";
import { ApoioConfig, CartaoConfig, DuasColunasConfig, TextoApoio } from "@/components/web/SecaoConfigDesktop";
import { getBrainHexConfig } from "@/constants/profileImages";

const ITEMS = [
  { label: "Perfil", value: "Automático" },
  { label: "Animações", value: "Ativadas" },
  { label: "Tamanho da fonte", value: "Padrão" },
];

export default function Aparen() {
  const embutido = useEmbutidoConfiguracoes();
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfilAtivo, usuario?.perfis]
  );

  // Embutida nas Configurações da web em tela larga (#346, protótipo v4): as opções num cartão, o perfil automático ao lado.
  if (embutido) {
    return (
      <DuasColunasConfig
        apoio={
          <ApoioConfig titulo="Perfil automático" palette={palette}>
            <TextoApoio palette={palette}>
              As cores, as artes e o guia seguem o seu perfil BrainHex ativo ({getBrainHexConfig(palette.profile).label}). A
              troca de perfil fica no seu Perfil.
            </TextoApoio>
          </ApoioConfig>
        }
      >
        <CartaoConfig palette={palette} style={styles.cartaoLista}>
          {ITEMS.map((item, index) => (
            <View
              key={item.label}
              style={[styles.linhaLarga, index > 0 && { borderTopWidth: 1, borderTopColor: palette.border }]}
            >
              <Text style={[styles.rotuloLargo, { color: palette.textMuted }]}>{item.label.toUpperCase()}</Text>
              <Text style={[styles.value, { color: palette.text }]}>{item.value}</Text>
            </View>
          ))}
        </CartaoConfig>
        <Text style={[styles.infoText, { color: palette.textSubtle }]}>Mais opções de aparência estarão disponíveis em breve.</Text>
      </DuasColunasConfig>
    );
  }

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35, pointerEvents: "none" }]}>
        <HallBackground palette={palette} />
      </View>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {embutido ? null : <Text style={[styles.title, { color: palette.text }]}>Aparência</Text>}
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>
          Personalize a aparência do aplicativo.
        </Text>
        {ITEMS.map((item, index) => (
          <View
            key={index}
            style={[styles.card, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}
          >
            <Text style={[styles.label, { color: palette.textMuted }]}>{item.label}</Text>
            <Text style={[styles.value, { color: palette.text }]}>{item.value}</Text>
          </View>
        ))}
        <View style={[styles.infoBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Feather name="info" size={16} color={palette.accent} />
          <Text style={[styles.infoText, { color: palette.textMuted }]}>
            Mais opções de aparência estarão disponíveis em breve.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  cartaoLista: { gap: 0, paddingVertical: 6 },
  linhaLarga: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  rotuloLargo: { fontFamily: FontFamily.interMedium, fontSize: 11.5, letterSpacing: 1 },
  outer: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 20, gap: 12 },
  title: { fontFamily: FontFamily.inikaBold, fontSize: 22 },
  subtitle: { fontFamily: FontFamily.interMedium, fontSize: 14 },
  card: { borderRadius: 12, padding: 14, borderWidth: 1, gap: 4 },
  label: { fontFamily: FontFamily.interMedium, fontSize: 12, textTransform: "uppercase" },
  value: { fontFamily: FontFamily.inikaBold, fontSize: 15 },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  infoText: { fontFamily: FontFamily.interMedium, fontSize: 13, flex: 1 },
});
