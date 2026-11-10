/**
 * Uma fórmula desenhada em SVG, dentro do texto ou em destaque (spec A, 08/11).
 *
 * Enquanto o MathJax converte (na primeira fórmula ele ainda está carregando) aparece o texto
 * legível de `corpoDaFormula` (`a/b`, `√x`), o mesmo que o app 1.0.x mostrava. Fórmula que não
 * converte aparece crua, em monoespaçado: é erro de quem escreveu, e o legível o esconderia. Nunca
 * derruba a tela. Em bloco, a fórmula mais larga que a tela rola na horizontal, sem encolher.
 *
 * Dentro de um `Text` ela é uma view embutida: o Android e o iOS a alinham pela base da linha, e o
 * `translateY` desce o que o MathJax diz que fica abaixo da base (`alinhamento`, em ex).
 */

import React, { useEffect, useState } from "react";
import { Platform, ScrollView, Text, View, type StyleProp, type TextStyle } from "react-native";
import { SvgXml } from "react-native-svg";

import { corpoDaFormula } from "@/utils/matematicaLegivel";
import { EX_POR_EM, formulaParaSvg, type ResultadoFormula } from "@/utils/textoRico/formulaParaSvg";

type Props = {
  tex: string;
  /** Em destaque, centralizada na própria linha. */
  bloco?: boolean;
  tamanhoDaFonte: number;
  cor: string;
  /** Estilo do texto legível, para casar com o texto ao redor. */
  estiloDoTexto?: StyleProp<TextStyle>;
};

export const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

export function rotuloDaFormula(tex: string): string {
  return corpoDaFormula(tex).replace(/\s+/g, " ").trim();
}

export function Formula({ tex, bloco = false, tamanhoDaFonte, cor, estiloDoTexto }: Props) {
  const [resultado, setResultado] = useState<ResultadoFormula | null>(null);

  useEffect(() => {
    let vivo = true;
    setResultado(null);
    void formulaParaSvg(tex, { display: bloco }).then((r) => {
      if (vivo) setResultado(r);
    });
    return () => {
      vivo = false;
    };
  }, [tex, bloco]);

  const rotulo = rotuloDaFormula(tex);

  if (!resultado) {
    return (
      <Text style={[estiloDoTexto, { color: cor }]} accessibilityLabel={rotulo}>
        {rotulo}
      </Text>
    );
  }
  if ("erro" in resultado) {
    return (
      <Text style={[estiloDoTexto, { color: cor, fontFamily: MONO }]} accessibilityLabel={rotulo}>
        {tex}
      </Text>
    );
  }

  const pixelPorEx = tamanhoDaFonte * EX_POR_EM;
  const largura = resultado.largura * pixelPorEx;
  const altura = resultado.altura * pixelPorEx;
  const desenho = (
    <SvgXml xml={resultado.svg} width={largura} height={altura} color={cor} accessible={false} />
  );

  if (bloco) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={rotulo}
        style={{ marginVertical: tamanhoDaFonte * 0.4 }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        >
          {desenho}
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={rotulo}
      style={{ width: largura, height: altura, transform: [{ translateY: -resultado.alinhamento * pixelPorEx }] }}
    >
      {desenho}
    </View>
  );
}
