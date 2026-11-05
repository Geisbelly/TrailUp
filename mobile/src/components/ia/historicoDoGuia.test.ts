import assert from "node:assert/strict";
import test from "node:test";

import { falaAssinadaDaResposta, falaParaHistorico } from "./historicoDoGuia";

test("devolve o texto da API, não o que a tela mostra, junto da assinatura", () => {
  const falaAssinada = falaAssinadaDaResposta("O aluno foi bem.", "abc");

  assert.deepEqual(falaParaHistorico({ role: "assistant", content: "Você foi bem.", falaAssinada }), {
    role: "assistant",
    content: "O aluno foi bem.",
    assinatura: "abc",
  });
});

test("fala sem assinatura segue sem o campo", () => {
  assert.deepEqual(falaParaHistorico({ role: "user", content: "oi" }), { role: "user", content: "oi" });
  assert.equal(falaAssinadaDaResposta("oi", undefined), undefined);
  assert.equal(falaAssinadaDaResposta("oi", ""), undefined);
});
