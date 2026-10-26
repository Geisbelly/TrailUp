import assert from "node:assert/strict";
import test from "node:test";

import { MIN_PARTICIPANTES_PARA_PROGRESSO, progressoDaLinha, progressoDoLider } from "@/utils/rankProgresso";

test("lê a coluna do banco (percentual_do_lider) e aceita progresso já montado", () => {
  assert.equal(progressoDaLinha({ percentual_do_lider: 66.67 }), 66.67);
  assert.equal(progressoDaLinha({ percentual_do_lider: "50" }), 50);
  assert.equal(progressoDaLinha({ progresso: 10, percentual_do_lider: 90 }), 10);
  assert.equal(progressoDaLinha({ percentual_do_lider: null }), null);
  assert.equal(progressoDaLinha({}), null);
  assert.equal(progressoDaLinha({ percentual_do_lider: "x" }), null);
});

test("rank pequeno não mostra percentual", () => {
  assert.equal(MIN_PARTICIPANTES_PARA_PROGRESSO, 8);
  assert.equal(progressoDoLider(30, 30, 6, "pontuacao"), null);
  assert.equal(progressoDoLider(30, 30, 8, "pontuacao"), 100);
  assert.equal(progressoDoLider(20, 30, 8, "pontuacao"), 66.67);
});

test("Elo e líder sem ponto não têm percentual; o resto fica em 0..100", () => {
  assert.equal(progressoDoLider(1000, 1016, 20, "elo"), null);
  assert.equal(progressoDoLider(1000, 1016, 20, " ELO "), null);
  assert.equal(progressoDoLider(0, 0, 20, "pontuacao"), null);
  assert.equal(progressoDoLider(-5, -1, 20, "ranqueada"), null);
  assert.equal(progressoDoLider(-5, 10, 20, "ranqueada"), 0);
});
