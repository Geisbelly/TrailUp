import { useEffect, useState, type CSSProperties } from "react";

/**
 * A área que sobra na tela, em variáveis de CSS para o painel da Lumi. No celular o teclado encolhe
 * só a `visualViewport`: `100dvh` e `position: fixed` não acompanham no Safari do iPhone, e o campo
 * de escrever ficaria atrás do teclado.
 */
export function useAreaVisivel(ativa: boolean): CSSProperties | undefined {
  const [estilo, setEstilo] = useState<CSSProperties>();

  useEffect(() => {
    const vv = window.visualViewport;
    if (!ativa || !vv) return;
    const medir = () =>
      setEstilo({ "--escriba-topo": `${vv.offsetTop}px`, "--escriba-altura": `${vv.height}px` } as CSSProperties);
    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
    };
  }, [ativa]);

  return estilo;
}
