import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

import { criarGravacaoAdiada } from "./gravacaoAdiada";

describe("criarGravacaoAdiada", () => {
  let gravados: string[];
  beforeEach(() => {
    gravados = [];
    mock.timers.enable({ apis: ["setTimeout"] });
  });

  it("grava só o último valor, quando a digitação para", () => {
    const g = criarGravacaoAdiada<string>((v) => void gravados.push(v), 400);
    g.agendar("a");
    mock.timers.tick(200);
    g.agendar("ab");
    mock.timers.tick(399);
    assert.deepEqual(gravados, []);
    mock.timers.tick(1);
    assert.deepEqual(gravados, ["ab"]);
    mock.timers.reset();
  });

  it("descarregar grava o pendente na hora (o aluno saiu da tela antes da espera)", () => {
    const g = criarGravacaoAdiada<string>((v) => void gravados.push(v), 400);
    g.agendar("parcial");
    g.descarregar();
    assert.deepEqual(gravados, ["parcial"]);
    // A espera que estava armada não grava de novo.
    mock.timers.tick(1000);
    assert.deepEqual(gravados, ["parcial"]);
    mock.timers.reset();
  });

  it("descarregar sem nada pendente não grava", () => {
    const g = criarGravacaoAdiada<string>((v) => void gravados.push(v), 400);
    g.descarregar();
    g.agendar("x");
    mock.timers.tick(400);
    g.descarregar();
    assert.deepEqual(gravados, ["x"]);
    mock.timers.reset();
  });

  it("cancelar descarta o pendente: depois do acerto, nada recria o rascunho", () => {
    const g = criarGravacaoAdiada<string>((v) => void gravados.push(v), 400);
    g.agendar("parcial");
    g.cancelar();
    mock.timers.tick(1000);
    g.descarregar();
    assert.deepEqual(gravados, []);
    mock.timers.reset();
  });
});
