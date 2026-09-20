import assert from "node:assert/strict";
import test from "node:test";

import { servidorCorrige } from "./correcaoDaQuestao";

test("questao do professor vai para o servidor", () => {
  assert.equal(servidorCorrige({ questaoId: 1061 }), true);
  assert.equal(servidorCorrige({ questaoId: "1062" }), true);
  assert.equal(servidorCorrige({ questaoId: 1063, personalizada: false }), true);
});

test("questao personalizada nunca vai, nem com id real", () => {
  // O id real existe -- `_enriquecer_questao` preserva o da semente --, entao a
  // RPC acharia a linha e corrigiria contra o gabarito do professor. Como a
  // versao personalizada reescreve e reordena as alternativas, a letra "A" do
  // aluno nao e a "A" do professor: o veredito sairia errado com cara de certo.
  assert.equal(servidorCorrige({ questaoId: 1061, personalizada: true }), false);
  assert.equal(servidorCorrige({ questaoId: -1876543, personalizada: true }), false);
});

test("id inventado pelo cliente e sempre negativo, e fica na tela", () => {
  // `stableNegativeId` devolve `-Math.max(1, Math.abs(hash))`: negativo, nunca
  // zero. Sem a guarda a RPC responderia `questao_inexistente` e a tela
  // abortaria a resposta.
  assert.equal(servidorCorrige({ questaoId: -1876543 }), false);
  assert.equal(servidorCorrige({ questaoId: -1 }), false);
});

test("id ausente ou sem sentido nao vira chamada de rede", () => {
  for (const valor of [null, undefined, 0, "", "abc", NaN, 12.5, {}, []]) {
    assert.equal(
      servidorCorrige({ questaoId: valor }),
      false,
      `deveria ser local: ${String(valor)}`
    );
  }
});
