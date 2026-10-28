import assert from "node:assert/strict";
import test from "node:test";

import { proximaVelocidade, rotuloVelocidade } from "./velocidadeAudio";

test("cada toque passa para a próxima velocidade e volta ao começo", () => {
  assert.equal(proximaVelocidade(1), 1.25);
  assert.equal(proximaVelocidade(2), 0.75);
  assert.equal(proximaVelocidade(0.75), 1);
});

test("velocidade desconhecida recomeça do 1×", () => {
  assert.equal(proximaVelocidade(3), 1);
});

test("rótulo sempre com uma casa no inteiro", () => {
  assert.equal(rotuloVelocidade(1), "1.0×");
  assert.equal(rotuloVelocidade(2), "2.0×");
  assert.equal(rotuloVelocidade(1.25), "1.25×");
  assert.equal(rotuloVelocidade(0.75), "0.75×");
});
