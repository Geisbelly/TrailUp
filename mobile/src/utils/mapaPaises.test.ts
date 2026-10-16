import assert from "node:assert/strict";
import test from "node:test";

import { caminhoCelula, caminhoHexagono, layoutMapa, MAPA_BASE, MAPA_TOPO, trechoEstrada } from "./mapaPaises";

test("8 tópicos viram 4 colunas × 2 fileiras, em serpentina", () => {
  const L = layoutMapa(8, 1000, 600);
  assert.equal(L.cols, 4);
  assert.equal(L.rows, 2);
  assert.deepEqual(L.nos.map((n) => [n.r, n.c]), [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [1, 2], [1, 1], [1, 0]]);
});

test("as fileiras cabem na altura do quadro, entre 140 e 228 px", () => {
  assert.equal(layoutMapa(8, 1000, 500).faixa, (500 - MAPA_TOPO - MAPA_BASE) / 2);
  assert.equal(layoutMapa(8, 1000, 2000).faixa, 228);
  assert.equal(layoutMapa(16, 1000, 400).faixa, 140);
});

test("quadro estreito: o mapa ganha largura mínima e rola de lado", () => {
  const L = layoutMapa(8, 500, 600);
  assert.ok(L.largura > 500);
  assert.equal(layoutMapa(8, 1400, 600).largura, 1400);
});

test("todo nó fica dentro do mapa", () => {
  const L = layoutMapa(11, 900, 700);
  for (const n of L.nos) {
    assert.ok(n.x > 0 && n.x < L.largura);
    assert.ok(n.y > 0 && n.y < L.altura);
  }
});

test("vizinhos dividem a mesma fronteira", () => {
  // A borda direita do país (0,0) é a borda esquerda do (1,0), percorrida ao contrário.
  const L = layoutMapa(8, 1000, 600);
  const pontos = (d: string) => d.slice(1, -2).split(" L").map((p) => p.trim());
  const a = pontos(caminhoCelula(L, 0, 0));
  const b = pontos(caminhoCelula(L, 1, 0));
  // Em (0,0): vértice (1,0), 15 pontos da borda, vértice (1,1) = índices 16..32.
  // Em (1,0): a mesma borda vem ao contrário, do vértice (1,1) (índice 48) até o (1,0) (índice 0).
  assert.equal(a.length, 64);
  assert.deepEqual(a.slice(16, 33), [...b.slice(48), b[0]].reverse());
});

test("estrada e hexágono geram paths válidos", () => {
  const L = layoutMapa(8, 1000, 600);
  assert.match(trechoEstrada(L.nos[0], L.nos[1]), /^M[\d.]+ [\d.]+ C/);
  assert.match(trechoEstrada(L.nos[3], L.nos[4]), /^M[\d.]+ [\d.]+ C/);
  const hex = caminhoHexagono(50, 50, 46, 9);
  assert.equal((hex.match(/Q/g) || []).length, 6);
  assert.ok(hex.endsWith("Z"));
});
