import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStoreItem } from "./storeModel";
import { resolveStoreAccent, resolveStoreChest, resolveStoreIcon } from "./storeTheme";

test("item com gate nao atendido fica bloqueado", () => {
  const item = normalizeStoreItem({ id: 1, slug: "x", section: "itens", name: "X", description: "", assetKey: null, price: 10, currency: "coins", gate: { scope: "activity", minimum: 1 }, metadata: {}, gate_met: false, owned: false, active: true });
  assert.equal(item.state, "blocked");
});
test("tema usa perfil e fallback", () => {
  assert.equal(resolveStoreIcon("socializador"), "storefront");
  assert.equal(resolveStoreChest(null), "treasure-chest");
  assert.match(resolveStoreAccent("socializador"), /rgb|#/);
});
