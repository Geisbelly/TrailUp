import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStoreItem } from "./storeModel";
import { purchaseErrorMessage, resolveStoreAccent, resolveStoreChest, resolveStoreIcon, storeIconKind } from "./storeTheme";

test("item com gate nao atendido fica bloqueado", () => {
  const item = normalizeStoreItem({ id: "1", slug: "x", section: "itens", name: "X", description: "", assetKey: null, price: 10, currency: "coins", gate: { scope: "activity", minimum: 1 }, metadata: {}, gate_met: false, owned: false, active: true });
  assert.equal(item.state, "blocked");
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
  assert.equal(purchaseErrorMessage({ ok: false, erro: "saldo_insuficiente" }), "Saldo insuficiente para este item.");
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
