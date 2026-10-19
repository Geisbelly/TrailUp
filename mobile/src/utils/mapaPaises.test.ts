import assert from "node:assert/strict";
import test from "node:test";

import { caminhoCelula, caminhoHexagono, layoutMapa, MAPA_BASE, MAPA_TOPO, ondaMar, trechoEstrada } from "./mapaPaises";

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

test("turma com menos de 4 tópicos: uma coluna por tópico, sem terra vazia", () => {
  // A turma real de teste tem 1 tópico: antes eram 4 colunas, 1 país e 3 terras escuras sem clique.
  for (const total of [1, 2, 3]) {
    const L = layoutMapa(total, 900, 640);
    assert.equal(L.cols, total);
    assert.equal(L.rows, 1);
    assert.equal(L.celulas.length, total, "toda célula tem um tópico");
  }
  assert.equal(layoutMapa(5, 900, 640).cols, 4);
});

test("numa fileira só o país cresce até 320 px para ocupar o quadro", () => {
  assert.equal(layoutMapa(1, 900, 2000).faixa, 320);
  assert.equal(layoutMapa(2, 900, 400).faixa, 400 - MAPA_TOPO - MAPA_BASE);
});

test("onda do mar é um path SVG válido (S com quatro números)", () => {
  const d = ondaMar(100, 8, 900);
  const s = d.slice(d.indexOf("S") + 1).trim().split(/[ ,]+/).map(Number);
  assert.equal(s.length, 4);
  assert.ok(s.every(Number.isFinite));
  assert.match(d, /^M0 100\.0 C/);
});
