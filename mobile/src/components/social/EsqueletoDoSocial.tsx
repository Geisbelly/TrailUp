/**
 * Esqueletos da aba Social. Enquanto `carregarSocial`, guildas e a janela da formação não
 * voltavam, a página inteira era um spinner: sem stories, sem o cartão de destaque e sem
 * listas, e tudo isso aparecia de uma vez depois, deslocando a tela.
 *
 * As medidas copiam as de `SocialStories` e `SocialHubDestaque` (SocialHub.tsx) e de
 * `SocialPersonCard`, para nada pular quando o conteúdo chega.
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

type Props = { palette: ProfileShellPalette };

/** A fileira de stories: círculo de 48 px e o primeiro nome. Decorativo. */
export function EsqueletoDasHistorias({ palette }: Props) {
  return (
    <EsqueletoGrupo superficie={palette.background} style={styles.historias}>
      {Array.from({ length: 5 }, (_, i) => (
        <View key={i} style={styles.historia}>
          <EsqueletoCirculo tamanho={48} />
          <EsqueletoBloco largura={36} altura={9} />
        </View>
      ))}
    </EsqueletoGrupo>
  );
}

/** Corpo da aba: o cartão de destaque (quando a aba tem) e cartões de pessoa. */
export function EsqueletoDoSocial({ palette, comDestaque }: Props & { comDestaque: boolean }) {
  const cartao = { backgroundColor: palette.surface, borderColor: palette.border };
  return (
    <EsqueletoGrupo rotulo="Carregando sua turma" superficie={palette.surface}>
      {comDestaque ? (
        <View style={[styles.destaque, cartao]}>
          <EsqueletoBloco largura={110} altura={10} />
          <EsqueletoBloco largura="70%" altura={22} />
          <EsqueletoBloco largura="88%" altura={12} />
          <View style={styles.destaqueBotoes}>
            <EsqueletoBloco largura="48%" altura={44} raio={12} />
            <EsqueletoBloco largura="48%" altura={44} raio={12} />
          </View>
        </View>
      ) : null}
      <View style={styles.bloco}>
        <View style={styles.tituloDoBloco}>
          <EsqueletoBloco largura={32} altura={32} raio={10} />
          <EsqueletoBloco largura={120} altura={16} />
        </View>
        <EsqueletoRepetir quantos={3} espaco={12}>
          {() => (
            <View style={[styles.pessoa, cartao]}>
              <View style={styles.pessoaTopo}>
                <EsqueletoBloco largura={56} altura={56} raio={6} />
                <View style={styles.pessoaTexto}>
                  <EsqueletoBloco largura="64%" altura={18} />
                  <EsqueletoBloco largura="42%" altura={11} />
                </View>
              </View>
              <View style={styles.pessoaAcoes}>
                <EsqueletoBloco largura={96} altura={44} raio={6} />
              </View>
            </View>
          )}
        </EsqueletoRepetir>
      </View>
    </EsqueletoGrupo>
  );
}

const styles = StyleSheet.create({
  historias: { flexDirection: "row", gap: 10, paddingTop: 4, paddingBottom: 8 },
  historia: { width: 56, alignItems: "center", gap: 6 },
  destaque: { marginTop: 16, borderWidth: 1.5, borderRadius: 20, padding: 18, gap: 10 },
  destaqueBotoes: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  bloco: { marginTop: 22, gap: 12 },
  tituloDoBloco: { flexDirection: "row", alignItems: "center", gap: 10 },
  pessoa: { padding: 14, borderWidth: 1, borderRadius: 12 },
  pessoaTopo: { flexDirection: "row", alignItems: "center", gap: 12 },
  pessoaTexto: { flex: 1, gap: 9 },
  pessoaAcoes: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
});
