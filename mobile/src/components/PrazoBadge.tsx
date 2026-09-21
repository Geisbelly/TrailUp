import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import {
  formatarPrazoCurto,
  prazoMereceDestaque,
  situacaoDoPrazo,
} from "@/utils/prazoDaAtividade";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

type Props = {
  dataEntrega?: string | null;
  palette: ProfileShellPalette;
};

/**
 * Selo de prazo da atividade.
 *
 * Devolve `null` sem prazo: um selo dizendo "sem prazo" ocuparia a linha para
 * informar nada, e a maioria das atividades não tem prazo (248 cadastradas,
 * nenhuma com data quando isto foi escrito).
 *
 * A cor NÃO vem do accent do perfil. Atraso é um estado, não decoração: ele
 * precisa se distinguir do resto da tela, e o accent muda de cor a cada perfil
 * BrainHex -- num perfil de accent avermelhado, "atrasado" e "faltam 5 dias"
 * ficariam iguais. `warning` e `info` são fixos por essa razão, que é a mesma
 * do CLAUDE.md sobre `success`/`warning`/`info` não serem derivados do accent.
 */
export function PrazoBadge({ dataEntrega, palette }: Props) {
  const situacao = useMemo(() => situacaoDoPrazo(dataEntrega), [dataEntrega]);
  const dataCurta = useMemo(() => formatarPrazoCurto(dataEntrega), [dataEntrega]);

  if (situacao.estado === "sem-prazo" || !situacao.rotulo) return null;

  const destaque = prazoMereceDestaque(situacao);
  const cor =
    situacao.estado === "atrasado"
      ? COR_ATRASADO
      : destaque
        ? COR_PROXIMO
        : palette.textMuted;

  return (
    <View
      style={[
        st.selo,
        {
          borderColor: cor,
          backgroundColor: destaque ? `${cor}1F` : "transparent",
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={
        dataCurta ? `${situacao.rotulo}, prazo ${dataCurta}` : situacao.rotulo
      }
    >
      <MaterialCommunityIcons
        name={situacao.estado === "atrasado" ? "clock-alert-outline" : "clock-outline"}
        size={13}
        color={cor}
      />
      <Text style={[st.texto, { color: cor }]}>{situacao.rotulo}</Text>
      {dataCurta && !destaque ? (
        <Text style={[st.data, { color: palette.textMuted }]}>· {dataCurta}</Text>
      ) : null}
    </View>
  );
}

// Fixos de propósito -- ver o comentário do componente. Medidos no PIOR caso
// entre os 7 perfis e os 3 temas visuais (Achiever/mágica, fundo #151016):
// 8,23:1 o vermelho e 13,14:1 o âmbar. Os dois passam AAA (7:1) mesmo como
// texto normal, então o selo continua legível em qualquer perfil.
//
// Ao trocar estas cores, meça de novo contra o fundo mais CLARO que a paleta
// produz, não contra `Color.background`: o fundo é derivado do accent do
// perfil e varia.
const COR_ATRASADO = "#FF8A80";
const COR_PROXIMO = "#FFD180";

const st = StyleSheet.create({
  selo: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
    marginTop: 6,
  },
  texto: { fontSize: 12, fontFamily: FontFamily.interMedium },
  data: { fontSize: 12, fontFamily: FontFamily.interMedium },
});

export default PrazoBadge;
