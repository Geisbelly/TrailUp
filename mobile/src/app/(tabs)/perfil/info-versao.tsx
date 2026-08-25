import { HallBackground } from "@/components/HallTheme";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

const pkg = require("../../../../package.json");
const appJson = require("../../../../app.json");

export default function InfoVersaoScreen() {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} pointerEvents="none">
        <HallBackground palette={palette} />
      </View>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: palette.text }]}>Informação de versão</Text>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: palette.text }]}>Versão</Text>
        <Text style={[styles.item, { color: palette.textMuted }]}>{pkg?.version ?? "N/D"}</Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: palette.text }]}>Versão do build</Text>
        <Text style={[styles.item, { color: palette.textMuted }]}>
          {pkg?.buildNumber ?? appJson?.expo?.version ?? "N/D"}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: palette.text }]}>Dependências principais</Text>
        {Object.entries(pkg?.dependencies ?? {}).slice(0, 10).map(([name, ver]) => (
          <Text key={name} style={[styles.item, { color: palette.textMuted }]}>
            {name}: {String(ver)}
          </Text>
        ))}
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
