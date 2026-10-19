import assert from "node:assert/strict";
import test from "node:test";

import { avisoCompraFeita, estadoCompra, limitarQuantidade, precosDoPedido, textoConfirmacao, textoNaBag } from "./compraLoja";

const item = (extra: Partial<Parameters<typeof estadoCompra>[0]> = {}) => ({
  name: "Dica",
  assetKey: "dica",
  price: 5,
  state: "available" as const,
  metadata: {},
  ...extra,
});

test("com saldo, compra; sem saldo, diz quanto falta", () => {
  assert.equal(estadoCompra(item(), 10).rotulo, "Comprar");
  assert.equal(estadoCompra(item(), 3).rotulo, "Faltam 2 moedas");
  assert.equal(estadoCompra(item(), 4).rotulo, "Falta 1 moeda");
  assert.equal(estadoCompra(item(), 3).habilitado, false);
});

test("unidade grátis não depende de saldo", () => {
  const e = estadoCompra(item({ metadata: { gratisRestantes: 1 } }), 0);
  assert.equal(e.rotulo, "Pegar grátis");
  assert.equal(e.habilitado, true);
  assert.equal(e.custo, 0);
});

test("estados do servidor vencem o saldo", () => {
  assert.equal(estadoCompra(item({ state: "blocked" }), 99).rotulo, "Bloqueado");
  assert.equal(estadoCompra(item({ state: "unavailable" }), 99).rotulo, "Indisponível");
  assert.equal(estadoCompra(item({ state: "limit" }), 99).rotulo, "Limite atingido");
});

test("a confirmação mostra o destino e a conta do saldo", () => {
  assert.deepEqual(textoConfirmacao(item(), 10), {
    titulo: "Comprar Dica?",
    descricao: "Fica na sua Bag até você usar numa questão.\nSaldo: 10 → 5",
    confirmar: "Comprar",
  });
  const gratis = textoConfirmacao(item({ name: "Prazo extra", assetKey: "prazo_extra", metadata: { gratisRestantes: 2 } }), 10);
  assert.equal(gratis.titulo, "Pegar Prazo extra?");
  assert.equal(gratis.descricao, "Fica na sua Bag até você usar numa atividade com prazo.\nNão gasta moedas.");
  assert.equal(gratis.confirmar, "Pegar");
  assert.equal(avisoCompraFeita({ name: "Dica" }), "Dica foi para a sua Bag.");
});

test("várias unidades: grátis primeiro, depois o preço com o aumento por compra", () => {
  assert.deepEqual(precosDoPedido(item({ price: 8, metadata: { precoFator: 2 } }), 3), [8, 16, 32]);
  assert.deepEqual(precosDoPedido(item({ price: 10, metadata: { precoFator: 1, gratisRestantes: 2 } }), 3), [0, 0, 10]);
  const e = estadoCompra(item({ price: 10, metadata: { precoFator: 1 } }), 25, 3);
  assert.equal(e.rotulo, "Faltam 5 moedas");
  assert.equal(estadoCompra(item({ price: 10, metadata: { precoFator: 1 } }), 30, 3).rotulo, "Comprar 3");
  assert.equal(estadoCompra(item({ metadata: { gratisRestantes: 2 } }), 0, 2).rotulo, "Pegar 2 grátis");
});

test("a quantidade fica entre 1 e o que ainda cabe (limite da turma, estoque, 20 por pedido)", () => {
  assert.equal(limitarQuantidade(item({ metadata: { comprasRestantes: 2 } }), 5), 2);
  assert.equal(limitarQuantidade(item({ metadata: { estoqueRestante: 3, comprasRestantes: null } }), 9), 3);
  assert.equal(limitarQuantidade(item(), 50), 20);
  assert.equal(limitarQuantidade(item(), 0), 1);
});

test("a confirmação de várias unidades diz que cada uso gasta uma", () => {
  const t = textoConfirmacao(item({ price: 5, metadata: { precoFator: 1 } }), 20, 3);
  assert.equal(t.titulo, "Comprar 3 × Dica?");
  assert.equal(t.descricao, "Ficam na sua Bag até você usar numa questão.\nCada uso gasta uma unidade.\nSaldo: 20 → 5");
  assert.equal(avisoCompraFeita({ name: "Dica" }, 3), "3 × Dica foram para a sua Bag.");
  assert.equal(textoNaBag(0), null);
  assert.equal(textoNaBag(2), "2 na sua Bag");
});
