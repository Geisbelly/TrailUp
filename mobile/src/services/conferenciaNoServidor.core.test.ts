import assert from "node:assert/strict";
import test from "node:test";

import { codigoDoErroDaEdge, lerConferencia, mensagemDoErroDaEdge, textoDoMotivo } from "./conferenciaNoServidor.core";

test("lê o corpo da edge, com o motivo só quando é um dos dois conhecidos", () => {
  const certo = lerConferencia({
    correta: true,
    acertos_percentual: 100,
    regra: "primeira",
    tentativa: 1,
    erros: 0,
    gabarito_liberado: true,
    resposta_correta: "10 m/s",
  });
  assert.equal(certo.correta, true);
  assert.equal(certo.acertosPercentual, 100);
  assert.equal(certo.respostaCorreta, "10 m/s");
  assert.equal(certo.motivo, null);

  const unidade = lerConferencia({ correta: false, acertos_percentual: 0, gabarito_liberado: false, motivo: "unidade_incompativel" });
  assert.equal(unidade.motivo, "unidade_incompativel");
  assert.equal(unidade.respostaCorreta, null);
  assert.equal(lerConferencia({ motivo: "qualquer" }).motivo, null);
  assert.equal(lerConferencia(null).correta, false);
});

test("o motivo vira dica de forma, sem gabarito", () => {
  assert.match(textoDoMotivo("unidade_incompativel") ?? "", /unidade/);
  assert.match(textoDoMotivo("expressao_invalida") ?? "", /ler a sua expressão/);
  assert.equal(textoDoMotivo(null), null);
});

function erroHttp(corpo: unknown) {
  const resposta = { json: async () => corpo };
  return { name: "FunctionsHttpError", context: { clone: () => resposta, json: resposta.json } };
}

test("o código vem do corpo da resposta HTTP; rede e corpo torto dão null", async () => {
  assert.equal(await codigoDoErroDaEdge(erroHttp({ error: "gabarito_invalido" })), "gabarito_invalido");
  assert.equal(await codigoDoErroDaEdge({ context: { json: async () => ({ error: "prazo_expirado" }) } }), "prazo_expirado");
  assert.equal(await codigoDoErroDaEdge({ name: "FunctionsFetchError", message: "rede" }), null);
  assert.equal(await codigoDoErroDaEdge(erroHttp("texto")), null);
  assert.equal(
    await codigoDoErroDaEdge({ context: { json: async () => { throw new Error("não é JSON"); } } }),
    null,
  );
  assert.equal(await codigoDoErroDaEdge(null), null);
});

test("cada recusa da edge tem texto; o resto é falha comum", () => {
  for (const codigo of [
    "questao_inexistente",
    "questao_nao_conferida_no_servidor",
    "questao_sem_permissao",
    "gabarito_invalido",
    "ia_indisponivel",
    "prazo_expirado",
    "unauthorized",
    "questao_sem_sessao",
  ]) {
    assert.ok(mensagemDoErroDaEdge(codigo)?.titulo, codigo);
  }
  assert.equal(mensagemDoErroDaEdge("prazo_expirado")?.titulo, "Prazo encerrado");
  assert.match(mensagemDoErroDaEdge("gabarito_invalido")?.descricao ?? "", /tentativa não foi gasta/);
  assert.match(mensagemDoErroDaEdge("ia_indisponivel")?.descricao ?? "", /não foi salva/);
  assert.equal(mensagemDoErroDaEdge("erro_inesperado"), null);
  assert.equal(mensagemDoErroDaEdge(null), null);
});
