import assert from "node:assert/strict";
import test from "node:test";

import tinycolor from "tinycolor2";

import { coresDoDivisor } from "./ornamentDividerColors";

const alpha = (cor: string) => tinycolor(cor).getAlpha();

test("sem atenuacao mantem o contraste original do divisor", () => {
  const { dim, bright } = coresDoDivisor("#ffffff");

  assert.equal(Math.round(alpha(dim) * 100), 55);
  assert.equal(alpha(bright), 1);
});

test("atenuacao multiplica em vez de exigir camada de opacidade", () => {
  // Equivale ao antigo <View style={{ opacity: 0.4 }}> em volta, sem promover
  // a View a uma camada de render propria no Android.
  const { dim, bright } = coresDoDivisor("#ffffff", 0.4);

  assert.equal(Math.round(alpha(dim) * 100), 22); // 0.55 * 0.4
  assert.equal(Math.round(alpha(bright) * 100), 40);
});

test("alpha ja presente na cor recebida e respeitado", () => {
  const { bright } = coresDoDivisor("rgba(255,255,255,0.5)", 0.5);

  assert.equal(Math.round(alpha(bright) * 100), 25);
});

test("opacidade fora da faixa e contida", () => {
  assert.equal(alpha(coresDoDivisor("#ffffff", 5).bright), 1);
  assert.equal(alpha(coresDoDivisor("#ffffff", -2).bright), 0);
});

test("valor invalido nao derruba o divisor", () => {
  // Melhor um divisor branco do que a tela inteira sem ornamento.
  const { dim, bright } = coresDoDivisor("nao-e-cor" as string);

  assert.ok(dim.startsWith("rgba"));
  assert.ok(bright.startsWith("rgb"));
});

test("opacidade ausente se comporta como 1", () => {
  assert.deepEqual(coresDoDivisor("#c9a227"), coresDoDivisor("#c9a227", 1));
});
