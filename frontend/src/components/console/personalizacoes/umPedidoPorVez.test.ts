import { describe, expect, it, vi } from "vitest";
import { criarUmPedidoPorVez } from "./umPedidoPorVez";

function pedidoPendente() {
  let concluir = () => {};
  let falhar = (_erro: Error) => {};
  const promessa = new Promise<void>((resolve, reject) => {
    concluir = resolve;
    falhar = reject;
  });
  return { pedido: vi.fn(() => promessa), concluir: () => concluir(), falhar: (erro: Error) => falhar(erro) };
}

describe("criarUmPedidoPorVez", () => {
  it("três cliques antes da resposta fazem um pedido só", async () => {
    const umPorVez = criarUmPedidoPorVez(() => {});
    const { pedido, concluir } = pedidoPendente();

    const cliques = [umPorVez(pedido), umPorVez(pedido), umPorVez(pedido)];
    concluir();
    await Promise.all(cliques);

    expect(pedido).toHaveBeenCalledTimes(1);
  });

  it("libera o próximo pedido depois da resposta", async () => {
    const umPorVez = criarUmPedidoPorVez(() => {});
    const pedido = vi.fn(async () => {});

    await umPorVez(pedido);
    await umPorVez(pedido);

    expect(pedido).toHaveBeenCalledTimes(2);
  });

  it("libera depois de uma falha, para o professor tentar de novo", async () => {
    const umPorVez = criarUmPedidoPorVez(() => {});
    const { pedido, falhar } = pedidoPendente();

    const clique = umPorVez(pedido);
    falhar(new Error("API fora do ar"));
    await expect(clique).rejects.toThrow("API fora do ar");

    const seguinte = vi.fn(async () => {});
    await umPorVez(seguinte);
    expect(seguinte).toHaveBeenCalledTimes(1);
  });

  it("avisa quando entra e quando sai de voo, uma vez cada", async () => {
    const aoMudar = vi.fn();
    const umPorVez = criarUmPedidoPorVez(aoMudar);
    const { pedido, concluir } = pedidoPendente();

    const clique = umPorVez(pedido);
    void umPorVez(pedido);
    expect(aoMudar.mock.calls).toEqual([[true]]);

    concluir();
    await clique;
    expect(aoMudar.mock.calls).toEqual([[true], [false]]);
  });
});
