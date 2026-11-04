/**
 * Enquanto um pedido está em voo, ignora os outros. É para botão que enfileira trabalho caro:
 * antes da resposta da API não há job para desativar o botão, e nessa janela cada clique virava
 * um pedido (#775). A trava é uma variável e não um `useState` porque estado de React só muda no
 * próximo render, e dois cliques podem cair antes dele; `aoMudar` existe só para desenhar o botão.
 */
export function criarUmPedidoPorVez(aoMudar: (emVoo: boolean) => void) {
  let emVoo = false;
  return async (pedido: () => Promise<void>): Promise<void> => {
    if (emVoo) return;
    emVoo = true;
    aoMudar(true);
    try {
      await pedido();
    } finally {
      emVoo = false;
      aoMudar(false);
    }
  };
}
