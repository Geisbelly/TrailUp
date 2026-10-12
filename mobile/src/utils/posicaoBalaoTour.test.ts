import assert from "node:assert/strict";
import test from "node:test";

import { posicaoBalaoTour } from "@/utils/posicaoBalaoTour";

const tela = { width: 1536, height: 730 };
const balao = { width: 380, height: 220 };

test("sem alvo, o balão fica no centro", () => {
  assert.deepEqual(posicaoBalaoTour(null, balao, tela), { left: 578, top: 255 });
});

test("alvo à esquerda (barra lateral): balão logo à direita, alinhado ao topo do alvo", () => {
  const alvo = { top: 60, left: 0, width: 212, height: 600 };
  assert.deepEqual(posicaoBalaoTour(alvo, balao, tela), { left: 228, top: 60 });
});

test("alvo encostado à direita: balão à esquerda dele", () => {
  const alvo = { top: 80, left: 1200, width: 320, height: 500 };
  assert.deepEqual(posicaoBalaoTour(alvo, balao, tela), { left: 804, top: 80 });
});

test("o topo é preso para o balão não sair por baixo da tela", () => {
  const alvo = { top: 650, left: 0, width: 212, height: 50 };
  assert.equal(posicaoBalaoTour(alvo, balao, tela).top, 730 - 220 - 16);
});

test("alvo na largura toda: balão abaixo; sem espaço abaixo, acima", () => {
  const largo = { left: 0, width: 1536 };
  assert.deepEqual(posicaoBalaoTour({ ...largo, top: 20, height: 100 }, balao, tela), { left: 16, top: 136 });
  assert.deepEqual(posicaoBalaoTour({ ...largo, top: 400, height: 300 }, balao, tela), { left: 16, top: 164 });
});

test("sem espaço em lado nenhum: canto inferior direito", () => {
  const alvo = { top: 0, left: 0, width: 1536, height: 730 };
  assert.deepEqual(posicaoBalaoTour(alvo, balao, tela), { left: 1536 - 380 - 32, top: 730 - 220 - 32 });
});
