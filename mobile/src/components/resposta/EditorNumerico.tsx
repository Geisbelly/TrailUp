/**
 * Resposta numérica (spec B, PR 5): um campo só (`10 m/s`), um botão que troca o teclado de
 * número para texto (a unidade precisa de letra) e atalhos de unidade da `dimensao` da questão.
 * Vírgula ou ponto: a edge aceita os dois.
 */

import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import { trocarUnidade, unidadesDaDimensao } from "@/utils/textoRico/editorDeResposta";

import { BarraDeTeclas, type PaletaDoEditor } from "./BarraDeTeclas";

type Props = {
  valor: string;
  onChange: (texto: string) => void;
  dimensao: string | null;
  editavel: boolean;
  paleta: PaletaDoEditor;
};

export function EditorNumerico({ valor, onChange, dimensao, editavel, paleta }: Props) {
  const [teclado, setTeclado] = useState<"numero" | "texto">("numero");
  const unidades = unidadesDaDimensao(dimensao);

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: paleta.text, fontFamily: FontFamily.interMedium }}>Sua resposta</Text>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          value={valor}
          onChangeText={onChange}
          editable={editavel}
          keyboardType={teclado === "numero" ? "decimal-pad" : "default"}
          placeholder={unidades.length ? `Ex.: 10 ${unidades[0]}` : "Ex.: 3,5"}
          placeholderTextColor={paleta.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          accessibilityLabel="Resposta numérica"
          style={{
            flex: 1,
            minHeight: 52,
            borderRadius: 12,
            paddingHorizontal: 14,
            backgroundColor: paleta.background,
            borderWidth: 1,
            borderColor: paleta.border,
            color: paleta.text,
            fontFamily: FontFamily.interMedium,
            fontSize: 18,
          }}
        />
        <TouchableOpacity
          disabled={!editavel}
          onPress={() => setTeclado((t) => (t === "numero" ? "texto" : "numero"))}
          accessibilityRole="button"
          accessibilityLabel={teclado === "numero" ? "Usar teclado de letras" : "Usar teclado de números"}
          style={{
            minWidth: 56,
            minHeight: 52,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: paleta.accentMuted,
            borderWidth: 1,
            borderColor: paleta.border,
          }}
        >
          <Text style={{ color: paleta.text, fontFamily: FontFamily.interMedium }}>{teclado === "numero" ? "abc" : "123"}</Text>
        </TouchableOpacity>
      </View>
      {unidades.length ? (
        <BarraDeTeclas
          teclas={unidades.map((u) => ({ rotulo: u, leitura: `unidade ${u}`, antes: u }))}
          paleta={paleta}
          desabilitada={!editavel}
          onTecla={(t) => onChange(trocarUnidade(valor, t.antes))}
        />
      ) : null}
      <Text style={{ color: paleta.textSubtle, fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 18 }}>
        {unidades.length
          ? "Escreva o número e a unidade. Vírgula ou ponto valem."
          : "Escreva o número, e a unidade se a questão pedir. Vírgula ou ponto valem."}
      </Text>
    </View>
  );
}
