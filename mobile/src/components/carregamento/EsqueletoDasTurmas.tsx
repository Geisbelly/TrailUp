/**
 * Esqueleto da escolha de turma: os cartões no formato dos de verdade (matéria, título,
 * professor, número da turma, progresso e o botão de entrar), para nada pular quando as
 * turmas chegam. Antes era um indicador girando no meio de uma tela vazia.
 *
 * `lista` copia o cartão de `SelecionarTurmaScreen` (celular e web estreita); `grade`, o de
 * `EscolhaTurmaDesktop` (300 px, lado a lado).
 *
 * Cada linha é uma FAIXA com a altura da linha real e a barra centralizada nela: a barra é
 * mais fina que o texto, e se ela ocupasse só a própria altura o cartão sairia mais baixo
 * que o de verdade e a lista desceria quando as turmas chegassem. As alturas vêm do cartão
 * real medido no Android (lista) e no navegador (grade); a do professor é o `minHeight: 44`
 * de `ProfessorDaTurma`, que é alvo de toque e não texto. Ao mudar o cartão real, meça os
 * dois de novo.
 */
import { EsqueletoBloco, EsqueletoGrupo } from "@/components/carregamento/Esqueleto";
import type { ProfileShellPalette } from "@/utils/profileShellPalette";
import React from "react";
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";

/** Três cartões: cabe na primeira tela do celular e enche uma linha da grade. */
export const CARTOES_DO_ESQUELETO = 3;

type Faixa = { altura: number; barra: number; largura: [DimensionValue, DimensionValue]; raio?: number; margem?: number };

/** Uma faixa por linha do cartão real, na ordem em que elas aparecem. */
export const FAIXAS_DO_CARTAO: Record<"lista" | "grade", Faixa[]> = {
  lista: [
    { altura: 23, barra: 23, largura: [92, 74], raio: 999 }, // pílula da matéria
    { altura: 26, barra: 20, largura: ["68%", "54%"] }, // título
    { altura: 44, barra: 13, largura: ["46%", "40%"] }, // professor (alvo de toque)
    { altura: 19, barra: 12, largura: [64, 64] }, // "Turma N"
    { altura: 6, barra: 6, largura: ["100%", "100%"], raio: 3, margem: 4 }, // trilho
    { altura: 18, barra: 12, largura: [96, 96] }, // "N% concluído"
    { altura: 48, barra: 48, largura: ["100%", "100%"], raio: 8, margem: 6 }, // entrar
  ],
  grade: [
    { altura: 20, barra: 20, largura: [92, 74], raio: 999 }, // chip da matéria
    { altura: 27, barra: 20, largura: ["68%", "54%"] }, // título
    { altura: 44, barra: 13, largura: ["46%", "40%"] }, // professor (alvo de toque)
    { altura: 15, barra: 12, largura: [64, 64] }, // "Turma N"
    { altura: 6, barra: 6, largura: ["100%", "100%"], raio: 3, margem: 6 }, // trilho
    { altura: 15, barra: 12, largura: [96, 96] }, // "N% concluído"
    { altura: 38, barra: 38, largura: ["100%", "100%"], raio: 999, margem: 6 }, // entrar
  ],
};

function LinhaDoEsqueleto({ faixa, alternada }: { faixa: Faixa; alternada: boolean }) {
  const estilo: StyleProp<ViewStyle> = [s.faixa, { height: faixa.altura, marginTop: faixa.margem ?? 0 }];
  return (
    <View style={estilo}>
      <EsqueletoBloco largura={faixa.largura[alternada ? 1 : 0]} altura={faixa.barra} raio={faixa.raio ?? 6} />
    </View>
  );
}

export function EsqueletoDasTurmas({ palette, variante }: { palette: ProfileShellPalette; variante: "lista" | "grade" }) {
  const grade = variante === "grade";
  return (
    <EsqueletoGrupo testID="esqueleto-das-turmas" rotulo="Carregando suas turmas" superficie={palette.surface} style={grade ? s.grade : s.lista}>
      {Array.from({ length: CARTOES_DO_ESQUELETO }, (_, i) => (
        <View
          key={i}
          style={[grade ? s.cartaoGrade : s.cartaoLista, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          {FAIXAS_DO_CARTAO[variante].map((faixa, j) => (
            <LinhaDoEsqueleto key={j} faixa={faixa} alternada={i % 2 === 1} />
          ))}
        </View>
      ))}
    </EsqueletoGrupo>
  );
}

// Mesmo `padding` e `gap` dos cartões reais (`styles.card` e `s.cartao`).
const s = StyleSheet.create({
  lista: { gap: 12 },
  grade: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 16, marginTop: 18, width: "100%" },
  cartaoLista: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  cartaoGrade: { width: 300, borderRadius: 16, borderWidth: 1, padding: 18, gap: 8 },
  faixa: { justifyContent: "center" },
});
