/**
 * Resposta em código (spec B, PR 5): campo multilinha monoespaçado, sem autocorreção, sem
 * maiúscula automática e sem sugestão, com a barra de tab e pares de símbolo, e a prévia com o
 * mesmo `BlocoDeCodigo` que desenha o código do enunciado.
 */

import React, { useMemo } from "react";
import { Text, TextInput, View } from "react-native";

import { BlocoDeCodigo } from "@/components/textoRico/BlocoDeCodigo";
import { MONO } from "@/components/textoRico/Formula";
import { FontFamily } from "@/styles/GlobalStyle";
import { TECLAS_DE_CODIGO, recuoDaLinguagem } from "@/utils/textoRico/editorDeResposta";
import { nomeDaLinguagem } from "@/utils/textoRico/tokensDoCodigo";

import { BarraDeTeclas, useInsercaoNoCursor, type PaletaDoEditor } from "./BarraDeTeclas";

type Props = {
  valor: string;
  onChange: (texto: string) => void;
  linguagem: string | null;
  editavel: boolean;
  paleta: PaletaDoEditor;
};

export function EditorDeCodigo({ valor, onChange, linguagem, editavel, paleta }: Props) {
  const { selection, onSelectionChange, inserir } = useInsercaoNoCursor(valor, onChange);
  const recuo = recuoDaLinguagem(linguagem);
  const teclas = useMemo(
    () => [{ rotulo: "Tab", leitura: `recuo de ${recuo.length} espaços`, antes: recuo, chave: "tab" }, ...TECLAS_DE_CODIGO],
    [recuo],
  );
  const nome = nomeDaLinguagem(linguagem);

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: paleta.text, fontFamily: FontFamily.interMedium }}>
        {nome ? `Seu código em ${nome}` : "Seu código"}
      </Text>
      <BarraDeTeclas teclas={teclas} paleta={paleta} desabilitada={!editavel} onTecla={(t) => inserir(t.antes, t.depois)} />
      <TextInput
        multiline
        value={valor}
        onChangeText={onChange}
        selection={selection}
        onSelectionChange={onSelectionChange}
        editable={editavel}
        placeholder="Escreva o código aqui"
        placeholderTextColor={paleta.textSubtle}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        importantForAutofill="no"
        textAlignVertical="top"
        accessibilityLabel={nome ? `Resposta em código ${nome}` : "Resposta em código"}
        style={{
          minHeight: 160,
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
      {valor.trim() ? (
        <View style={{ gap: 2 }}>
          <Text style={{ color: paleta.textSubtle, fontFamily: FontFamily.interMedium, fontSize: 12 }}>Prévia</Text>
          <BlocoDeCodigo codigo={valor} linguagem={linguagem} paleta={paleta} />
        </View>
      ) : null}
    </View>
  );
}
