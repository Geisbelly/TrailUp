import { useEffect, useState } from "react";
import { Platform } from "react-native";

export type AreaVisivel = { top: number; height: number };

/**
 * A parte da tela que sobra no navegador do celular. O teclado encolhe só a `visualViewport`: o
 * `useWindowDimensions` não muda no Safari do iPhone, e o campo de escrever ficaria atrás dele.
 * Devolve `null` no app instalado, onde o `KeyboardAvoidingView` já cuida disso.
 */
export function useAreaVisivelWeb(ativa = true): AreaVisivel | null {
  const [area, setArea] = useState<AreaVisivel | null>(null);

  useEffect(() => {
    const vv = Platform.OS === "web" && ativa ? window.visualViewport : null;
    if (!vv) {
      setArea(null);
      return;
    }
    const medir = () => setArea({ top: vv.offsetTop, height: vv.height });
    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
    };
  }, [ativa]);

  return area;
}
