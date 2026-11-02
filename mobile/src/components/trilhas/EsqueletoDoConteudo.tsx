/**
 * O cartão do bloco atual de `trilha/[id]` enquanto o percurso ainda não está pronto.
 *
 * O percurso só se conhece quando a personalização chega (ou a tentativa termina sem ela):
 * antes disso, um tópico em que o professor não cadastrou nada mostrava "Sem conteúdos"
 * e, segundos depois, o material personalizado. O cartão usa o estilo `card` da tela.
 */
import { EsqueletoBloco, EsqueletoGrupo, EsqueletoTexto } from "@/components/carregamento/Esqueleto";
import { styles as estilosDoTopico } from "@/styles/trilhaTopicoStyles";
import type { ProfileShellPalette } from "@/utils/profileShellPalette";
import React from "react";
import { StyleSheet, View } from "react-native";

export function EsqueletoDoConteudo({ palette }: { palette: ProfileShellPalette }) {
  return (
    <EsqueletoGrupo
      rotulo="Carregando o conteúdo"
      superficie={palette.surfaceElevated}
      style={[estilosDoTopico.card, styles.cartao, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}
    >
      <View style={styles.corpo}>
        <EsqueletoBloco largura={84} altura={10} />
        <EsqueletoBloco largura="68%" altura={20} />
        <EsqueletoBloco altura={160} raio={10} style={styles.midia} />
        <EsqueletoTexto linhas={4} altura={12} />
      </View>
    </EsqueletoGrupo>
  );
}

const styles = StyleSheet.create({
  cartao: { gap: 0 },
  corpo: { gap: 12 },
  midia: { marginVertical: 4 },
});
