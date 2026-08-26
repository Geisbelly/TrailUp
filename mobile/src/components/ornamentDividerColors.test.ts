import assert from "node:assert/strict";
import test from "node:test";

import tinycolor from "tinycolor2";

import { coresDoDivisor, OPACIDADE_MINIMA_VISIVEL } from "./ornamentDividerColors";

const alpha = (cor: string) => tinycolor(cor).getAlpha();

test("sem atenuacao mantem o contraste original do divisor", () => {
  const { dim, bright } = coresDoDivisor("#ffffff");

  assert.equal(Math.round(alpha(dim) * 100), 55);
  assert.equal(alpha(bright), 1);
});

test("atenuacao multiplica em vez de exigir camada de opacidade", () => {
  // Equivale a um <View style={{ opacity }}> em volta, sem promover a View a
  // uma camada de render propria no Android.
  const { dim, bright } = coresDoDivisor("#ffffff", 0.8);

  assert.equal(Math.round(alpha(dim) * 100), 44); // 0.55 * 0.8
  assert.equal(Math.round(alpha(bright) * 100), 80);
});

test("atenuacao que apagaria as linhas sobe pro piso visivel", () => {
  // 0.4 punha as linhas em 1.98:1 contra o fundo do salao -- era o divisor
  // "quebrado" do rodape do ranking: losangos como marcas soltas, linhas
  // invisiveis.
  const pedido = coresDoDivisor("#ffffff", 0.4);
  const piso = coresDoDivisor("#ffffff", OPACIDADE_MINIMA_VISIVEL);

  assert.deepEqual(pedido, piso);
  assert.ok(alpha(pedido.dim) > 0.3);
});

test("linha do divisor passa do piso de 3:1 para elementos graficos", () => {
  const { dim } = coresDoDivisor("#ffffff", 0.4);
  const efetiva = tinycolor.mix(tinycolor("#0b1020"), tinycolor("#ffffff"), alpha(dim) * 100);

  assert.ok(
    tinycolor.readability(efetiva, "#0b1020") >= 3,
    `contraste ${tinycolor.readability(efetiva, "#0b1020")} abaixo de 3:1`
  );
});

test("alpha ja presente na cor recebida e respeitado", () => {
  // O piso vale para a ATENUACAO pedida, nao para o alpha da cor base: uma cor
  // deliberadamente fraca (Color.colorWhite10 nas notificacoes) continua fraca.
  const { bright } = coresDoDivisor("rgba(255,255,255,0.5)", 0.8);

  assert.equal(Math.round(alpha(bright) * 100), 40);
});

test("opacidade fora da faixa e contida", () => {
  assert.equal(alpha(coresDoDivisor("#ffffff", 5).bright), 1);
  // Negativo nao vira zero: apagaria o divisor. Cai no piso visivel.
  assert.equal(
    Math.round(alpha(coresDoDivisor("#ffffff", -2).bright) * 100),
    Math.round(OPACIDADE_MINIMA_VISIVEL * 100)
  );
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
