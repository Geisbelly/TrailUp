import assert from "node:assert/strict";
import test from "node:test";

import { colunasDoMapa, fileirasNoQuadro, MAPA } from "./gradeMapaTrilha";

test("no quadro, a última fileira cabe na altura sem rolar", () => {
  for (const altura of [420, 520, 640, 780, 900]) {
    const fileiras = fileirasNoQuadro(altura);
    const fundo = MAPA.paddingY + (fileiras - 1) * MAPA.cellH + MAPA.deriva + MAPA.territorioAltura + MAPA.folgaBaixo;
    assert.ok(fileiras === 1 || fundo <= altura - 24, `altura ${altura}: ${fileiras} fileiras passam do quadro`);
  }
});

test("no quadro, mais tópicos viram mais colunas, não mais fileiras", () => {
  assert.equal(fileirasNoQuadro(700), 2);
  assert.equal(colunasDoMapa(10, 1000, 700, true), 5);
  assert.equal(colunasDoMapa(3, 1000, 700, true), 2);
});

test("fora do quadro, as colunas vêm da largura (como antes)", () => {
  assert.equal(colunasDoMapa(10, 390, 800, false), 2);
  assert.equal(colunasDoMapa(10, 1200, 800, false), 4);
});
