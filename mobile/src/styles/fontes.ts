import { Jost_600SemiBold } from "@expo-google-fonts/jost";
import { Karla_400Regular } from "@expo-google-fonts/karla";

import { Fontes } from "./identidade";

/**
 * O mapa que o `useFonts` do layout raiz consome.
 *
 * As CHAVES sao os nomes de familia que `FontFamily` referencia — se elas nao
 * baterem com `Fontes`, o app roda, nao avisa nada e renderiza tudo na fonte do
 * sistema. Por isso as chaves saem de `Fontes`, e nao de literais repetidos:
 * um typo aqui seria invisivel ate alguem olhar o aparelho.
 *
 * Carrega SO' os pesos em uso. Os pacotes trazem 9 pesos de Jost e 7 de Karla,
 * e cada um vira um TTF no bundle — carregar todos seria pagar megabytes por
 * pesos que nenhuma tela pede.
 */
export const FONTES_DA_IDENTIDADE = {
  [Fontes.titulo]: Jost_600SemiBold,
  [Fontes.corpo]: Karla_400Regular,
};
