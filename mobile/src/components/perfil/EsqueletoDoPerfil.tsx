/**
 * Esqueletos da aba Perfil, no formato do que vai chegar. Enquanto o ConquistaRank faz a
 * primeira carga, as métricas mostravam "0%", "Sem rank" e barras zeradas, a faixa de XP
 * aparecia depois empurrando a tela, e a aba dizia "Conquistas (0)".
 *
 * As medidas copiam as de `ProfileMetricsViews` (heroCard, statTile, surfaceCard),
 * `FaixaXpCartao` e a linha de conquista de `perfil/index.tsx`, para nada pular quando o
 * conteúdo chega.
 */
import {
  EsqueletoBloco,
  EsqueletoCirculo,
  EsqueletoGrupo,
  EsqueletoRepetir,
  EsqueletoTexto,
} from "@/components/carregamento/Esqueleto";
import type { ProfileShellPalette } from "@/utils/profileShellPalette";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type Props = { palette: ProfileShellPalette; style?: StyleProp<ViewStyle> };

/** Painel de métricas: cartão de destaque com a grade 2 × 2 e dois cartões abaixo. */
export function EsqueletoDasMetricas({ palette }: Props) {
  const cartao = { backgroundColor: palette.surface, borderColor: palette.border };
  return (
    <EsqueletoGrupo rotulo="Carregando suas métricas" superficie={palette.surface} style={styles.metricas}>
      <View style={[styles.cartaoDestaque, cartao]}>
        <EsqueletoBloco largura={96} altura={10} />
        <EsqueletoBloco largura="64%" altura={22} style={styles.tituloDestaque} />
        <EsqueletoTexto linhas={2} altura={12} />
        <View style={styles.grade}>
          {Array.from({ length: 4 }, (_, i) => (
            <View key={i} style={[styles.ladrilho, { borderColor: palette.border }]}>
              <EsqueletoBloco largura="46%" altura={10} />
              <EsqueletoBloco largura="58%" altura={22} />
            </View>
          ))}
        </View>
      </View>
      {[3, 2].map((linhas, i) => (
        <View key={i} style={[styles.cartao, cartao]}>
          <EsqueletoBloco largura="40%" altura={14} />
          <EsqueletoRepetir quantos={linhas} espaco={12}>
            {() => (
              <View style={styles.linhaDeProgresso}>
                <EsqueletoBloco largura="34%" altura={11} />
                <EsqueletoBloco altura={8} raio={4} />
              </View>
            )}
          </EsqueletoRepetir>
        </View>
      ))}
    </EsqueletoGrupo>
  );
}

/** Faixa de XP da turma (FaixaXpCartao): nível, título, XP e a barra. Decorativo. */
export function EsqueletoDaFaixaXp({ palette, style }: Props) {
  return (
    <EsqueletoGrupo superficie={palette.surface}>
      <View style={[styles.faixa, { backgroundColor: palette.surface, borderColor: palette.border }, style]}>
        <View style={styles.faixaTopo}>
          <View style={styles.faixaTitulos}>
            <EsqueletoBloco largura={70} altura={10} />
            <EsqueletoBloco largura="60%" altura={16} />
          </View>
          <EsqueletoBloco largura={54} altura={14} />
        </View>
        <EsqueletoBloco altura={8} raio={4} />
      </View>
    </EsqueletoGrupo>
  );
}

/** Lista de conquistas da aba: arte 50 × 54, título com data e uma linha de descrição. */
export function EsqueletoDaListaDeConquistas({ palette }: Props) {
  return (
    <EsqueletoGrupo rotulo="Carregando conquistas" superficie={palette.background}>
      <EsqueletoRepetir quantos={5} espaco={0}>
        {(i) => (
          <View style={[styles.conquista, { borderBottomColor: palette.border }]}>
            <EsqueletoBloco largura={50} altura={54} raio={10} />
            <View style={styles.conquistaTexto}>
              <View style={styles.conquistaTopo}>
                <EsqueletoBloco largura={i % 2 === 0 ? "54%" : "66%"} altura={14} />
                <EsqueletoBloco largura={36} altura={10} />
              </View>
              <EsqueletoBloco largura="82%" altura={12} />
            </View>
          </View>
        )}
      </EsqueletoRepetir>
    </EsqueletoGrupo>
  );
}

/**
 * Grade da Biblioteca de conquistas: duas linhas de três células (arte de 52 px e o nome
 * em duas linhas), o que cabe na primeira dobra do celular. Medidas de `styles.celula`
 * em `perfil/biblioteca-conquistas.tsx`.
 */
export function EsqueletoDaBiblioteca({ palette }: Props) {
  return (
    <EsqueletoGrupo rotulo="Carregando conquistas" superficie={palette.surface} style={styles.biblioteca}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={[styles.celula, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <EsqueletoCirculo tamanho={52} />
          <View style={styles.celulaNome}>
            <EsqueletoTexto linhas={2} altura={11} espaco={5} centralizar />
          </View>
        </View>
      ))}
    </EsqueletoGrupo>
  );
}

const styles = StyleSheet.create({
  biblioteca: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  celula: {
    width: "31.6%",
    minHeight: 128,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 6,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 6,
  },
  celulaNome: { width: "80%", marginTop: 4 },
  metricas: { gap: 12 },
  cartaoDestaque: { borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  tituloDestaque: { marginBottom: 2 },
  grade: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 8 },
  ladrilho: { width: "48.3%", borderRadius: 6, padding: 14, marginBottom: 10, borderWidth: 1, gap: 10 },
  cartao: { borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16, gap: 14 },
  linhaDeProgresso: { gap: 7 },
  faixa: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  faixaTopo: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  faixaTitulos: { flex: 1, gap: 6 },
  conquista: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, gap: 15 },
  conquistaTexto: { flex: 1, gap: 8 },
  conquistaTopo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
});
