// Só o peso 700: o índice do pacote puxaria os seis arquivos (cerca de 1,1 MB) para o pacote do app.
import { Cinzel_700Bold } from "@expo-google-fonts/cinzel/700Bold";
import { useFonts } from "expo-font";

import { FontFamily } from "@/styles/GlobalStyle";

/**
 * Fonte dos títulos da Trilha na web em tela larga (#346): a Cinzel do
 * protótipo v4 (03-trilha.html, `--font-title`). Até ela carregar, e se não
 * carregar, vale a serifada de antes.
 */
export const FONTE_TITULO_TRILHA = `Cinzel_700Bold, ${FontFamily.inikaBold}, serif`;

/** Carrega a Cinzel; quem usa `FONTE_TITULO_TRILHA` chama isto uma vez. */
export function useFonteCinzel() {
  useFonts({ Cinzel_700Bold });
}
