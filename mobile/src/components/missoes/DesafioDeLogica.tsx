import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { DesafioLogicaPublico } from "@/services/missoes/desafio.core";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

type Props = {
  desafio: DesafioLogicaPublico;
  /** Na múltipla, o texto da alternativa escolhida (é o que vai à RPC); na curta, o digitado. */
  resposta: string;
  onMudar: (resposta: string) => void;
  /** Resolvido: mostra o enunciado e as alternativas, sem deixar mudar. */
  somenteLeitura: boolean;
  palette: ProfileShellPalette;
};

/**
 * O desafio de lógica: o enunciado e, conforme o formato, as alternativas (um grupo de rádio) ou o
 * campo curto. Quem confere é o banco: aqui não há resposta nenhuma para comparar.
 */
export function DesafioDeLogica({ desafio, resposta, onMudar, somenteLeitura, palette }: Props) {
  return (
    <View style={s.raiz}>
      <Text style={[s.enunciado, { color: palette.text }]}>{desafio.enunciado}</Text>

      {desafio.formato === "multipla" ? (
        <View accessibilityRole="radiogroup" accessibilityLabel="Alternativas" style={s.alternativas}>
          {desafio.alternativas.map((alternativa, i) => {
            const marcada = resposta === alternativa;
            return (
              <Pressable
                key={`${i}:${alternativa}`}
                onPress={() => onMudar(alternativa)}
                disabled={somenteLeitura}
                accessibilityRole="radio"
                accessibilityState={{ checked: marcada, disabled: somenteLeitura }}
                accessibilityLabel={alternativa}
                style={({ pressed }) => [
                  s.alternativa,
                  {
                    borderColor: marcada ? palette.accent : palette.border,
                    backgroundColor: marcada ? palette.accentMuted : palette.surfaceElevated,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View style={[s.radio, { borderColor: marcada ? palette.accent : palette.textMuted }]}>
                  {marcada ? <View style={[s.radioMiolo, { backgroundColor: palette.accent }]} /> : null}
                </View>
                <Text style={[s.alternativaTexto, { color: palette.text }]}>{alternativa}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <TextInput
          value={resposta}
          onChangeText={onMudar}
          editable={!somenteLeitura}
          accessibilityLabel="Sua resposta"
          placeholder="Sua resposta"
          placeholderTextColor={palette.textMuted}
          autoCorrect={false}
          autoComplete="off"
          maxLength={1000}
          style={[s.campo, { color: palette.text, borderColor: palette.borderStrong, backgroundColor: palette.surfaceElevated }]}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { gap: 14 },
  enunciado: { fontFamily: FontFamily.interMedium, fontSize: 16, lineHeight: 24 },
  alternativas: { gap: 10 },
  alternativa: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioMiolo: { width: 10, height: 10, borderRadius: 5 },
  alternativaTexto: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 15, lineHeight: 21 },
  campo: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontFamily: FontFamily.interMedium, fontSize: 16 },
});
