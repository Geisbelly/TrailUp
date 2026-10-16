import { createContext, useContext } from "react";

/**
 * Verdadeiro quando a tela de configuração está embutida no painel das
 * Configurações da web em tela larga (#346). Lá o painel já mostra o título
 * (e, em algumas seções, a descrição), então a tela não repete. Fora dele
 * o valor é falso e nada muda.
 */
export const EmbutidoConfiguracoes = createContext(false);

export const useEmbutidoConfiguracoes = () => useContext(EmbutidoConfiguracoes);
