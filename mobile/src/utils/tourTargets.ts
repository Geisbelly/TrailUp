import { useEffect, useRef } from "react";
import type { View } from "react-native";

/**
 * Registro global dos elementos que o tutorial inicial pode destacar.
 *
 * O tour percorre VÁRIAS telas, e cada passo precisa apontar para um elemento
 * que vive dentro da tela da vez. Passar refs por props não resolve: quem
 * renderiza o tour (`(tabs)/_layout`) não é quem renderiza o elemento, e as
 * telas montam e desmontam conforme a navegação.
 *
 * Antes disto o tour desenhava retângulos com geometria fixa — uma faixa no
 * rodapé, um quadrado adivinhado no canto, um bloco genérico cobrindo meia
 * tela. Ele não destacava o item: destacava a região onde o item talvez
 * estivesse. Um botão que mudasse de lugar deixava o recorte apontando para o
 * vazio, que foi exatamente o que aconteceu com o botão de guia.
 *
 * Cada tela registra os seus alvos por nome; o tour procura pelo nome do passo.
 * Alvo não registrado não é erro: o tour cai no destaque antigo, então uma tela
 * ainda não migrada continua funcionando.
 */

export type AlvoTour = React.RefObject<View | null>;

const alvos = new Map<string, AlvoTour>();

export function registrarAlvoTour(nome: string, ref: AlvoTour): () => void {
  alvos.set(nome, ref);
  return () => {
    // Só remove se ainda for a MESMA ref. Durante uma troca de tela a nova
    // monta antes de a antiga desmontar, e um `delete` cego apagaria o alvo
    // recém-registrado.
    if (alvos.get(nome) === ref) {
      alvos.delete(nome);
    }
  };
}

export function obterAlvoTour(nome: string | undefined): AlvoTour | undefined {
  if (!nome) return undefined;
  const ref = alvos.get(nome);
  return ref?.current ? ref : undefined;
}

/**
 * Cria a ref e a registra pelo nome. A View precisa de `collapsable={false}`,
 * senão o Android remove do layout nativo qualquer View sem estilo próprio e
 * `measureInWindow` devolve zeros.
 */
export function useAlvoTour(nome: string): AlvoTour {
  const ref = useRef<View | null>(null);
  useEffect(() => registrarAlvoTour(nome, ref), [nome]);
  return ref;
}
