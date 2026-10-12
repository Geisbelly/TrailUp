import { useEffect } from "react";
import { Platform } from "react-native";

import { cssRolagemTematica } from "@/utils/rolagemTematica";

const ID_ESTILO = "trailup-rolagem-tematica";

/**
 * Web em tela larga (#346, protótipo v4, revisão 03): barras de rolagem finas,
 * na cor da borda do perfil, no lugar da barra cinza do sistema. Põe uma
 * folha de estilo no <head> enquanto `ativo`; a cor acompanha o perfil.
 */
export function useRolagemTematica(ativo: boolean, cor: string) {
  useEffect(() => {
    if (!ativo || Platform.OS !== "web" || typeof document === "undefined") return;
    let estilo = document.getElementById(ID_ESTILO) as HTMLStyleElement | null;
    if (!estilo) {
      estilo = document.createElement("style");
      estilo.id = ID_ESTILO;
      document.head.appendChild(estilo);
    }
    estilo.textContent = cssRolagemTematica(cor);
    return () => {
      document.getElementById(ID_ESTILO)?.remove();
    };
  }, [ativo, cor]);
}
