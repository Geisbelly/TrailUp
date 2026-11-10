/**
 * Bloco de código com realce, sem WebView (spec A, 08/11).
 *
 * Monoespaçado, rola na horizontal (linha longa não quebra: quebrar mudaria o sentido de Python),
 * preserva espaço e tabulação, e numera as linhas. As cores vêm de `coresDoCodigo`, AAA sobre o
 * fundo do bloco em todo perfil. O leitor de tela lê o código inteiro, sem os números das linhas.
 */

import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";

import type { ProfileShellPalette } from "@/utils/profileShellPalette";
import { coresDoCodigo } from "@/utils/textoRico/coresDoCodigo";
import { nomeDaLinguagem, tokensDoCodigo } from "@/utils/textoRico/tokensDoCodigo";

import { MONO } from "./Formula";

type Props = {
  codigo: string;
  linguagem?: string | null;
  paleta: Pick<ProfileShellPalette, "background" | "accent" | "text" | "border">;
  tamanhoDaFonte?: number;
};

/** Tabulação vira quatro espaços: o `Text` do Android desenha `\t` com largura imprevisível. */
const TAB = "    ";

export function BlocoDeCodigo({ codigo, linguagem, paleta, tamanhoDaFonte = 14 }: Props) {
  const linhas = useMemo(() => tokensDoCodigo(codigo.replace(/\t/g, TAB), linguagem), [codigo, linguagem]);
  const cores = useMemo(() => coresDoCodigo(paleta), [paleta]);
  const alturaDaLinha = Math.round(tamanhoDaFonte * 1.5);
  const larguraDoNumero = String(linhas.length).length;
  const nome = nomeDaLinguagem(linguagem);
  const rotulo = nome ? `Código em ${nome}` : "Código";

  return (
    <View
      accessible
      accessibilityLabel={`${rotulo}: ${codigo}`}
      style={{
        backgroundColor: cores.fundo,
        borderColor: cores.borda,
        borderWidth: 1,
        borderRadius: 10,
        marginVertical: 8,
        overflow: "hidden",
      }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ padding: 12 }}>
        <View>
          {linhas.map((linha, indice) => (
            <Text
              key={indice}
              style={{ fontFamily: MONO, fontSize: tamanhoDaFonte, lineHeight: alturaDaLinha, color: cores.simples }}
            >
              <Text style={{ color: cores.numeroDaLinha }}>
                {String(indice + 1).padStart(larguraDoNumero, " ")}
                {"  "}
              </Text>
              {linha.length === 0
                ? " "
                : linha.map((trecho, j) => (
                    <Text key={j} style={{ color: cores[trecho.papel] }}>
                      {trecho.texto}
                    </Text>
                  ))}
            </Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
