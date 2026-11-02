/**
 * Linhas falsas da tabela do ranking, para o recorte por perfil: ele depende do perfil de
 * cada aluno, que chega depois do rank (`useRankingPeople`). Antes era um spinner sozinho.
 *
 * As medidas copiam as de `s.row`, `s.rowCelular` e `s.rowLarga` em `ranking/[id].tsx`.
 */
import {
  EsqueletoBloco,
  EsqueletoCirculo,
  EsqueletoGrupo,
  EsqueletoRepetir,
} from "@/components/carregamento/Esqueleto";
import type { ProfileShellPalette } from "@/utils/profileShellPalette";
import React from "react";
import { StyleSheet, View } from "react-native";

export function EsqueletoDasLinhasDoRank({ palette, embutido = false }: { palette: ProfileShellPalette; embutido?: boolean }) {
  return (
    <EsqueletoGrupo rotulo="Carregando ranking" superficie={palette.surface}>
      <EsqueletoRepetir quantos={5} espaco={0}>
        {() => (
          <View
            style={[
              styles.linha,
              embutido ? styles.linhaLarga : styles.linhaCelular,
              { borderBottomColor: palette.border, backgroundColor: embutido ? "transparent" : palette.surface },
            ]}
          >
            <EsqueletoBloco largura={24} altura={16} />
            <EsqueletoCirculo tamanho={embutido ? 32 : 38} />
            <View style={styles.aluno}>
              <EsqueletoBloco largura="60%" altura={14} />
              <EsqueletoBloco largura={92} altura={10} />
            </View>
            <EsqueletoBloco largura={52} altura={16} />
          </View>
        )}
      </EsqueletoRepetir>
    </EsqueletoGrupo>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 88,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
    gap: 8,
  },
  linhaCelular: { minHeight: 60, paddingVertical: 6, paddingHorizontal: 8, marginHorizontal: 12, gap: 12 },
  linhaLarga: { minHeight: 52, paddingVertical: 8, borderBottomWidth: 1 },
  aluno: { flex: 1, minWidth: 0, gap: 9 },
});
