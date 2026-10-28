import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

export type AtalhoPerfil = {
  chave: string;
  rotulo: string;
  icone: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  onPress: () => void;
  /** Sair é a única ação destrutiva da lista: sem seta e na cor de erro. */
  destrutivo?: boolean;
  /** Texto curto à direita, antes da seta (08-perfil-hub.html, `.atalho small`: "38 moedas", "14"). */
  detalhe?: string | null;
};

/**
 * Atalhos do Perfil no celular (mobile-v1): o que na web larga mora na barra lateral e nos
 * botões do banner (Loja, Biblioteca, Relatório, Configurações, Sair), em linhas de 56px.
 */
export function AtalhosPerfil({ atalhos, palette }: { atalhos: AtalhoPerfil[]; palette: ProfileShellPalette }) {
  return (
    <View
      accessibilityLabel="Atalhos"
      style={[s.lista, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      {atalhos.map((a, i) => (
        <Pressable
          key={a.chave}
          accessibilityRole="button"
          accessibilityLabel={a.rotulo}
          onPress={a.onPress}
          style={[s.linha, i > 0 && { borderTopWidth: 1, borderTopColor: palette.border }]}
        >
          {/* Ícone numa pílula de 36 (08-perfil-hub.html, `.atalho .ic`). */}
          <View style={[s.icone, { backgroundColor: a.destrutivo ? "rgba(248,113,113,0.14)" : palette.accentMuted }]}>
            <MaterialCommunityIcons name={a.icone} size={18} color={a.destrutivo ? "#f87171" : palette.accent} />
          </View>
          <Text style={[s.rotulo, { color: a.destrutivo ? "#f87171" : palette.text }]}>{a.rotulo}</Text>
          {a.detalhe ? <Text style={[s.detalhe, { color: palette.textSubtle }]}>{a.detalhe}</Text> : null}
          {a.destrutivo ? null : <MaterialCommunityIcons name="chevron-right" size={16} color={palette.textSubtle} />}
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  lista: { marginHorizontal: 14, marginTop: 20, borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  linha: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 },
  icone: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  detalhe: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "600" },
  rotulo: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "600" },
});
