import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

export const TITULO_COMECE_POR_AQUI = "Comece por aqui";

/** Texto lido pelo leitor de tela: o título e, se houver, o motivo para o aluno. */
export function rotuloComecePorAqui(motivo: string | null | undefined) {
  const texto = String(motivo ?? "").trim();
  return texto ? `${TITULO_COMECE_POR_AQUI}. ${texto}` : `${TITULO_COMECE_POR_AQUI}.`;
}

/**
 * "Comece por aqui": este é o formato que a sugestão de material aconselha abrir
 * primeiro neste conteúdo. `motivo` é a frase curta escrita para o aluno
 * (`ordem[].motivo_aluno`); sem ela, só o destaque — as notas internas do motor
 * (`motivos[]`) nunca aparecem aqui.
 *
 * Ícone `sign-direction` (placa de caminho): não tem outro dono no app. Não usar
 * os que já significam outra coisa (estrela = personalizado, bandeira, alvo,
 * bússola = mapa, raio, `update` = alteração do professor, rosto do guia).
 */
export function SeloComecePorAqui({
  motivo,
  palette,
}: {
  motivo: string | null;
  palette: ProfileShellPalette;
}) {
  const texto = String(motivo ?? "").trim();
  return (
    <View
      style={[styles.selo, { borderColor: palette.accent, backgroundColor: palette.accent + "1A" }]}
      accessibilityRole="text"
      accessibilityLabel={rotuloComecePorAqui(texto)}
    >
      <MaterialCommunityIcons name="sign-direction" size={16} color={palette.accent} />
      <View style={styles.textos}>
        <Text style={[styles.titulo, { color: palette.accent }]}>{TITULO_COMECE_POR_AQUI}</Text>
        {texto ? <Text style={[styles.motivo, { color: palette.text }]}>{texto}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  selo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  textos: { flex: 1, gap: 2 },
  titulo: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  motivo: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 18 },
});
