import assert from "node:assert/strict";
import test from "node:test";
import { emPosse, maxQuantidade, normalizeStoreItem } from "./storeModel";
import { purchaseErrorMessage, resolveStoreAccent, resolveStoreChest, resolveStoreIcon, storeIconKind } from "./storeTheme";

test("item com gate nao atendido fica bloqueado", () => {
  const item = normalizeStoreItem({ id: "1", slug: "x", section: "itens", name: "X", description: "", assetKey: null, price: 10, currency: "coins", gate: { scope: "activity", minimum: 1 }, metadata: {}, gate_met: false, active: true });
  assert.equal(item.state, "blocked");
});

const cru = (metadata: Record<string, unknown>) => ({ id: "1", slug: "x", section: "itens" as const, name: "X", description: "", assetKey: null, price: 10, currency: "coins", gate: null, metadata, active: true });

test("ter o item na Bag não bloqueia comprar mais; o limite da turma e o estoque sim", () => {
  const comPosse = normalizeStoreItem(cru({ emPosse: 2, comprasRestantes: null }));
  assert.equal(comPosse.state, "available");
  assert.equal(emPosse(comPosse), 2);
  assert.equal(maxQuantidade(comPosse), 20);
  assert.equal(normalizeStoreItem(cru({ comprasRestantes: 0 })).state, "limit");
  assert.equal(normalizeStoreItem(cru({ estoqueRestante: 0 })).state, "limit");
  assert.equal(maxQuantidade(cru({ comprasRestantes: 4, estoqueRestante: 2 })), 2);
});
test("tema usa perfil e fallback", () => {
  assert.equal(resolveStoreIcon("socializador"), "storefront");
  assert.equal(resolveStoreChest(null), "treasure-chest");
  assert.match(resolveStoreAccent("socializador"), /rgb|#/);
});

test("compra bem-sucedida não produz erro", () => {
  assert.equal(purchaseErrorMessage({ ok: true }), null);
});

test("compra traduz falha de saldo", () => {
  assert.equal(purchaseErrorMessage({ ok: false, erro: "saldo_insuficiente" }), "Saldo insuficiente para esta quantidade.");
  assert.equal(purchaseErrorMessage({ ok: false, erro: "limite_de_compras", restantes: 2 }), "Você só pode comprar mais 2 deste item.");
  assert.equal(purchaseErrorMessage({ ok: false, erro: "estoque_esgotado", restantes: 0 }), "O estoque deste item acabou.");
});

test("compra usa mensagem segura para falha desconhecida", () => {
  assert.equal(purchaseErrorMessage({ ok: false, erro: "qualquer_coisa" }), "Não foi possível concluir a compra.");
});

test("efeitos do catálogo escolhem ícones SVG únicos", () => {
  assert.equal(storeIconKind("prazo_extra"), "deadline");
  assert.equal(storeIconKind("segunda_chance"), "retry");
  assert.equal(storeIconKind("dica"), "hint");
  assert.equal(storeIconKind("troca_formato"), "format");
  assert.equal(storeIconKind("desconhecido"), "hint");
});
