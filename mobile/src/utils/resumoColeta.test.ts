import assert from "node:assert/strict";
import test from "node:test";

import { contarSinaisAtivos, descreverTermo, SINAIS_COLETA } from "./resumoColeta";

test("conta os sinais ligados entre os quatro", () => {
  assert.deepEqual(
    contarSinaisAtivos({ cameraEnabled: false, usageEnabled: true, performanceEnabled: true, chatEnabled: true }),
    { ativos: 3, total: 4 },
  );
  assert.equal(
    contarSinaisAtivos({ cameraEnabled: false, usageEnabled: false, performanceEnabled: false, chatEnabled: false }).ativos,
    0,
  );
});

test("um sinal por interruptor da tela", () => {
  assert.deepEqual(
    SINAIS_COLETA.map((s) => s.chave),
    ["cameraEnabled", "usageEnabled", "performanceEnabled", "chatEnabled"],
  );
});

test("o termo mostra a versão e a data da última mudança", () => {
  assert.equal(
    descreverTermo({ version: "2026-10-02-v4", updatedAt: new Date(2026, 9, 7, 12).toISOString() }),
    "Termo de consentimento · versão 2026-10-02-v4 · atualizado em 07/10/2026",
  );
  assert.equal(descreverTermo({ version: "4", updatedAt: "lixo" }), "Termo de consentimento · versão 4");
  assert.equal(descreverTermo(null), null);
});
