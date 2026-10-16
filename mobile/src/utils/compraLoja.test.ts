import assert from "node:assert/strict";
import test from "node:test";

import { avisoCompraFeita, estadoCompra, textoConfirmacao } from "./compraLoja";

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
  assert.equal(estadoCompra(item({ state: "owned" }), 99).rotulo, "Adquirido");
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
