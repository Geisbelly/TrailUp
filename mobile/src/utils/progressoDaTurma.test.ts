import assert from "node:assert/strict";
import test from "node:test";
import { porcentagemDaTurma } from "./progressoDaTurma";

test("usa o progresso geral da turma, arredondado", () => {
  assert.equal(porcentagemDaTurma({ getProgressoGeral: () => 57.6 }), 58);
  assert.equal(porcentagemDaTurma({ getProgressoGeral: () => 0 }), 0);
});

test("fica entre 0 e 100", () => {
  assert.equal(porcentagemDaTurma({ getProgressoGeral: () => 130 }), 100);
  assert.equal(porcentagemDaTurma({ getProgressoGeral: () => -5 }), 0);
});

test("sem número válido vale 0", () => {
  assert.equal(porcentagemDaTurma({}), 0);
  assert.equal(porcentagemDaTurma({ getProgressoGeral: () => Number.NaN }), 0);
});
