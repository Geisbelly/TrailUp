import { HallBackground } from "@/components/HallTheme";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { app } from "@/constants/definicoes";
import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { useEmbutidoConfiguracoes } from "@/context/EmbutidoConfiguracoesContext";
import { ApoioConfig, CartaoConfig, DuasColunasConfig, TextoApoio } from "@/components/web/SecaoConfigDesktop";

const pkg = require("../../../../package.json");
const appJson = require("../../../../app.json");

export default function InfoAppScreen() {
  const embutido = useEmbutidoConfiguracoes();
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfilAtivo, usuario?.perfis]
  );

  // Embutida nas Configurações da web em tela larga (#346, protótipo v4): os dados do app num cartão, a versão ao lado.
  if (embutido) {
    const linhas: [string, string][] = [
      ["Nome", app?.name ?? "TrailUp"],
      ["Descrição", app?.descricao ?? "Plataforma mobile para gerenciar trilhas, módulos, conteúdos e gamificação (ranking, eventos e conquistas)."],
      ["Autor / Organização", app?.author ?? "TrailUp"],
    ];
    return (
      <DuasColunasConfig
        apoio={
          <ApoioConfig titulo="Informação de versão" palette={palette}>
            {[["Versão", String(pkg?.version ?? "N/D")], ["Versão do build", String(pkg?.buildNumber ?? appJson?.expo?.version ?? "N/D")]].map(([k, v]) => (
              <View key={k} style={styles.versaoLinha}>
                <TextoApoio palette={palette}>{k}</TextoApoio>
                <Text style={[styles.versaoValor, { color: palette.text }]}>{v}</Text>
              </View>
            ))}
          </ApoioConfig>
        }
      >
        <CartaoConfig palette={palette}>
          {linhas.map(([k, v], i) => (
            <View key={k} style={[styles.infoLinha, i > 0 && { borderTopWidth: 1, borderTopColor: palette.border }]}>
              <Text style={[styles.infoRotulo, { color: palette.textMuted }]}>{k.toUpperCase()}</Text>
              <Text style={[styles.infoValor, { color: palette.text }]}>{v}</Text>
            </View>
          ))}
        </CartaoConfig>
      </DuasColunasConfig>
    );
  }

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35, pointerEvents: "none" }]}>
        <HallBackground palette={palette} />
      </View>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {embutido ? null : <Text style={[styles.title, { color: palette.text }]}>Informações do app</Text>}
      <Text style={[styles.paragraph, { color: palette.textMuted }]}>
        {app.informs ??
          "TrailUp ajuda você a acompanhar sua trilha de aprendizado, módulos, atividades e conquistas em um só lugar. Aqui estão alguns detalhes técnicos e de produto."}
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: palette.text }]}>Nome</Text>
        <Text style={[styles.item, { color: palette.textMuted }]}>{app?.name ?? "TrailUp"}</Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: palette.text }]}>Descrição</Text>
        <Text style={[styles.item, { color: palette.textMuted }]}>
          {app?.descricao ??
            "Plataforma mobile para gerenciar trilhas, módulos, conteúdos e gamificação (ranking, eventos e conquistas)."}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: palette.text }]}>Autor / Organização</Text>
        <Text style={[styles.item, { color: palette.textMuted }]}>
          {app?.author ?? "TrailUp"}
        </Text>
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  infoLinha: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 24, paddingVertical: 12 },
  infoRotulo: { fontFamily: FontFamily.interMedium, fontSize: 11.5, letterSpacing: 1 },
  infoValor: { flex: 1, textAlign: "right", fontFamily: FontFamily.inikaBold, fontSize: 14 },
  versaoLinha: { flexDirection: "row", justifyContent: "space-between" },
  versaoValor: { fontFamily: FontFamily.inikaBold, fontSize: 13 },
  outer: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  content: {
    paddingVertical: 20,
    gap: 12,
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 20,
  },
  paragraph: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 6,
  },
  cardTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 16,
  },
  item: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
});
