/**
 * Texto que o professor marcou como rico (`formato_texto = 'rico'`): markdown com fórmula e código
 * (spec A, 08/11). Com `'texto'`, ou sem a marca, desenha o mesmo `Text` de antes, sem markdown —
 * questão antiga não muda de aparência, nem um `*` vira ênfase.
 *
 * Rico: `prepararTextoRico` acerta os delimitadores e o dinheiro, o markdown-it com
 * `markdownItFormula` lê, e as regras de `regrasDeTextoRico` desenham. Bloco cercado sem linguagem
 * sai monoespaçado e rolando, sem número de linha.
 */

import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View, type TextStyle } from "react-native";
import Markdown, { MarkdownIt } from "react-native-markdown-display";

import type { ProfileShellPalette } from "@/utils/profileShellPalette";
import { formatoDoTexto, type FormatoTexto } from "@/utils/textoRico/formatoTexto";
import { markdownItFormula } from "@/utils/textoRico/markdownItFormula";
import { prepararTextoRico } from "@/utils/textoRico/prepararTextoRico";

import { MONO } from "./Formula";
import { cercaComoCodigo, regrasDeTextoRico } from "./regrasDeTextoRico";

export { formatoDoTexto, type FormatoTexto } from "@/utils/textoRico/formatoTexto";

// Fora do componente: a biblioteca memoiza o parser pela identidade da instância.
const parserRico = markdownItFormula(new MarkdownIt({ typographer: true }));

type Props = {
  texto: string | null | undefined;
  formato: FormatoTexto | string | null | undefined;
  /** Cor e tamanho valem para o texto, para a fórmula e para o código. */
  estilo: TextStyle & { color: string; fontSize: number };
  paleta: Pick<ProfileShellPalette, "background" | "accent" | "text" | "border" | "surface">;
  /** Só para `'texto'`: o mesmo `numberOfLines` que o `Text` de antes usava. */
  numberOfLines?: number;
};

export function TextoRico({ texto, formato, estilo, paleta, numberOfLines }: Props) {
  const rico = formatoDoTexto(formato) === "rico";
  const pronto = useMemo(() => (rico ? prepararTextoRico(texto) : ""), [rico, texto]);

  const regras = useMemo(() => {
    const opcoes = { paleta, cor: estilo.color, tamanhoDaFonte: estilo.fontSize };
    const cercaSimples = (no: { key: string; content: string }) => (
      <ScrollView key={no.key} horizontal showsHorizontalScrollIndicator={false} style={styles.cerca}>
        <Text
          style={{
            fontFamily: MONO,
            fontSize: Math.max(12, estilo.fontSize - 2),
            color: estilo.color,
            backgroundColor: paleta.surface,
            padding: 10,
            borderRadius: 8,
          }}
        >
          {no.content.replace(/\n$/, "")}
        </Text>
      </ScrollView>
    );
    return {
      ...regrasDeTextoRico(opcoes),
      fence: (no: { key: string; content: string; sourceInfo?: string }) => cercaComoCodigo(no, opcoes) ?? cercaSimples(no),
      code_block: (no: { key: string; content: string }) => cercaSimples(no),
    };
  }, [paleta, estilo.color, estilo.fontSize]);

  const estilosDoMarkdown = useMemo(
    () => ({
      body: { ...estilo },
      paragraph: { marginTop: 0, marginBottom: 6 },
      code_inline: {
        fontFamily: MONO,
        backgroundColor: paleta.surface,
        color: estilo.color,
        borderRadius: 4,
        paddingHorizontal: 4,
      },
      strong: { fontWeight: "700" as const },
    }),
    [estilo, paleta.surface],
  );

  if (!rico) {
    return (
      <Text style={estilo} numberOfLines={numberOfLines}>
        {texto ?? ""}
      </Text>
    );
  }

  // Todo bloco termina com pelo menos 6 de margem embaixo (parágrafo, cerca, código, fórmula); sem
  // descontar, sobra espaço embaixo do texto dentro do botão de alternativa (medido no Android).
  return (
    <View style={styles.semSobraEmbaixo}>
      <Markdown markdownit={parserRico} rules={regras as never} style={estilosDoMarkdown}>
        {pronto}
      </Markdown>
    </View>
  );
}

const styles = StyleSheet.create({
  cerca: { marginVertical: 6 },
  semSobraEmbaixo: { marginBottom: -6 },
});
