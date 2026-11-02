import { SEM_NAO_LIDAS, zerarConversa, type NaoLidas, type TipoDeConversa } from "./chatNaoLidasModel";

/**
 * Uma contagem de mensagens não lidas para o app inteiro: o ícone Social da barra de baixo e a
 * própria aba Social leem e zeram a mesma coisa. Com duas cópias, abrir a conversa apagaria o
 * número dentro da aba e o ícone da barra continuaria mostrando até a próxima leitura.
 *
 * Leitura que saiu ANTES de uma conversa ser marcada como lida (ou enquanto a marca ia ao banco)
 * é descartada ao chegar: ela ainda conta as mensagens daquela conversa, e devolveria o número
 * que o aluno acabou de apagar.
 */
export type LojaDeNaoLidas = {
  atual: () => NaoLidas;
  assinar: (ouvinte: () => void) => () => void;
  atualizar: () => Promise<void>;
  marcarLida: (tipo: TipoDeConversa, conversaId: string) => void;
  limpar: () => void;
};

export function criarLojaDeNaoLidas(
  carregar: () => Promise<NaoLidas>,
  marcar: (tipo: TipoDeConversa, conversaId: string) => Promise<void>,
): LojaDeNaoLidas {
  let estado: NaoLidas = SEM_NAO_LIDAS;
  let versao = 0;
  const ouvintes = new Set<() => void>();
  const definir = (proximo: NaoLidas) => {
    if (proximo === estado) return;
    estado = proximo;
    ouvintes.forEach((ouvinte) => ouvinte());
  };
  return {
    atual: () => estado,
    assinar: (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    atualizar: async () => {
      const pedido = versao;
      const lido = await carregar();
      if (pedido === versao) definir(lido);
    },
    marcarLida: (tipo, conversaId) => {
      versao += 1;
      definir(zerarConversa(estado, tipo, conversaId));
      // Leitura que saiu enquanto a marca ia ao banco pode ter visto o banco antes dela.
      void marcar(tipo, conversaId).finally(() => { versao += 1; });
    },
    limpar: () => {
      versao += 1;
      definir(SEM_NAO_LIDAS);
    },
  };
}
