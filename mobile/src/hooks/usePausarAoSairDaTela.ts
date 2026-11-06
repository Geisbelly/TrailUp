import { NavigationContext } from "@react-navigation/native";
import { useContext, useEffect } from "react";

/**
 * Pausa a mídia quando a tela perde o foco.
 *
 * Navegar não desmonta: as abas e o stack mantêm a tela anterior viva por baixo (`router.push`
 * empilha), então a limpeza do `useEffect` não roda ao sair e o som seguiria por cima da tela nova.
 *
 * Lê o contexto em vez de usar `useIsFocused`, que lança fora de um navegador, e o player também é
 * renderizado sem navegação. O `blur` chega aqui mesmo quando quem trocou foi a aba de fora.
 */
export function usePausarAoSairDaTela(pausar: () => void) {
  const navegacao = useContext(NavigationContext);

  useEffect(() => navegacao?.addListener("blur", pausar), [navegacao, pausar]);
}
