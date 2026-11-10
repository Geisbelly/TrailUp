/**
 * Resposta em expressão (spec B, PR 5): o aluno escreve LaTeX com a ajuda da barra de símbolos, e a
 * prévia ao vivo usa o `TextoRico`. As teclas são só o que a edge `questao-conferir-resposta` lê
 * (ver `editorDeResposta.ts`); `→` e `Química` levam à conferência por espécies.
 */

import React from "react";
import { Text, TextInput, View } from "react-native";

import { TextoRico } from "@/components/textoRico/TextoRico";
import { MONO } from "@/components/textoRico/Formula";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellPalette";
import { TECLAS_DA_EXPRESSAO, previaDaExpressao } from "@/utils/textoRico/editorDeResposta";

import { BarraDeTeclas, useInsercaoNoCursor, type PaletaDoEditor } from "./BarraDeTeclas";

type Props = {
  valor: string;
  onChange: (texto: string) => void;
  variaveis: string[];
  editavel: boolean;
  paleta: PaletaDoEditor & Pick<ProfileShellPalette, "surface">;
};

export function EditorDeExpressao({ valor, onChange, variaveis, editavel, paleta }: Props) {
  const { selection, onSelectionChange, inserir } = useInsercaoNoCursor(valor, onChange);
  const previa = previaDaExpressao(valor);

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: paleta.text, fontFamily: FontFamily.interMedium }}>Sua expressão</Text>
      {variaveis.length ? (
        <Text style={{ color: paleta.textSubtle, fontFamily: FontFamily.interMedium, fontSize: 12 }}>
          Use as variáveis: {variaveis.join(", ")}
        </Text>
      ) : null}
      <BarraDeTeclas
        teclas={TECLAS_DA_EXPRESSAO}
        paleta={paleta}
        desabilitada={!editavel}
        onTecla={(t) => inserir(t.antes, t.depois)}
      />
      <TextInput
        multiline
        value={valor}
        onChangeText={onChange}
        selection={selection}
        onSelectionChange={onSelectionChange}
        editable={editavel}
        placeholder="Ex.: \frac{x^{2}}{2} + 3x"
        placeholderTextColor={paleta.textSubtle}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        importantForAutofill="no"
        textAlignVertical="top"
        accessibilityLabel="Resposta em expressão"
        style={{
          minHeight: 72,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: paleta.background,
          borderWidth: 1,
          borderColor: paleta.border,
          color: paleta.text,
          fontFamily: MONO,
          fontSize: 15,
          lineHeight: 22,
        }}
      />
      {previa ? (
        <View
          style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: paleta.border, backgroundColor: paleta.surface, gap: 4 }}
        >
          <Text style={{ color: paleta.textSubtle, fontFamily: FontFamily.interMedium, fontSize: 12 }}>Prévia</Text>
          <TextoRico texto={previa} formato="rico" estilo={{ color: paleta.text, fontSize: 18 }} paleta={paleta} />
        </View>
      ) : null}
    </View>
  );
}
