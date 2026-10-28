import assert from "node:assert/strict";
import test from "node:test";

import { ARVORE_PASSO, ARVORE_TOPO, caminhoLigacao, layoutArvoreCelular } from "./arvoreCelular";

test("cada nível vira uma fileira, de cima para baixo", () => {
  const L = layoutArvoreCelular([["1"], ["2"], ["3", "4"], ["5"]], 390);
  assert.equal(L.pos["1"].y, ARVORE_TOPO);
  assert.equal(L.pos["3"].y, L.pos["4"].y, "o mesmo nível fica na mesma fileira");
  assert.equal(L.pos["5"].y, ARVORE_TOPO + 3 * ARVORE_PASSO);
  assert.equal(L.altura, ARVORE_TOPO + 4 * ARVORE_PASSO);
});

test("sozinho a 24% com nome largo; em dupla a 12% e 56% com nome estreito", () => {
  const L = layoutArvoreCelular([["1"], ["3", "4"]], 400);
  assert.deepEqual(L.pos["1"], { x: 96, y: ARVORE_TOPO, larguraRotulo: 200 });
  assert.equal(L.pos["3"].x, 48);
  assert.equal(L.pos["4"].x, 224);
  assert.equal(L.pos["3"].larguraRotulo, 110);
});

test("nível com mais de 2 tópicos quebra em fileiras de 2 e nada sai da tela", () => {
  const largura = 360;
  const L = layoutArvoreCelular([["1"], ["2", "3", "4", "5", "6"]], largura);
  assert.equal(new Set(["2", "3", "4", "5", "6"].map((id) => L.pos[id].y)).size, 3);
  for (const p of Object.values(L.pos)) {
    // Hexágono de 48 à esquerda do ponto, nome à direita com 10px de folga.
    assert.ok(p.x - 24 >= 0 && p.x + 24 + 10 + p.larguraRotulo <= largura + 24, JSON.stringify(p));
  }
});

test("ligação sai de baixo de um hexágono e entra por cima do outro", () => {
  const d = caminhoLigacao({ x: 50, y: 44, larguraRotulo: 200 }, { x: 100, y: 148, larguraRotulo: 110 });
  assert.equal(d, "M50 68 C50 96,100 96,100 124");
});
