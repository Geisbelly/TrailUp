import assert from "node:assert/strict";
import { test } from "vitest";

import { formatoDoTexto, temMarcacaoRica } from "./formatoTexto";
import { alternativaDaResposta, alternativasRepetidas, letraDaAlternativa } from "./respostaRica";

const QUIMICA = ["\\(\\ce{Co}\\)", "\\(\\ce{CO}\\)", "\\(\\ce{C2O}\\)", "\\(\\ce{CO2}\\)"];

test("letra da alternativa", () => {
  assert.deepEqual([0, 1, 3].map(letraDaAlternativa), ["A", "B", "D"]);
});

test("a letra volta a ser a alternativa, sem confundir maiúscula", () => {
  assert.equal(alternativaDaResposta("B", QUIMICA), "\\(\\ce{CO}\\)");
  assert.equal(alternativaDaResposta("a", QUIMICA), "\\(\\ce{Co}\\)");
});

test("texto exato (app 1.0.x) vence a letra", () => {
  assert.equal(alternativaDaResposta(" \\(\\ce{CO2}\\) ", QUIMICA), "\\(\\ce{CO2}\\)");
  assert.equal(alternativaDaResposta("A", ["B", "A"]), "A", "alternativa que é uma letra");
});

test("letra fora da lista e vazio", () => {
  assert.equal(alternativaDaResposta("F", QUIMICA), "F");
  assert.equal(alternativaDaResposta("", QUIMICA), null);
  assert.equal(alternativaDaResposta(null, QUIMICA), null);
});

test("alternativas repetidas depois de trim", () => {
  assert.deepEqual(alternativasRepetidas(["x", " x ", "y", "", ""]), ["x"]);
  assert.deepEqual(alternativasRepetidas(QUIMICA), []);
});

test("só 'rico' exatamente é rico", () => {
  assert.equal(formatoDoTexto("rico"), "rico");
  for (const outro of ["texto", "RICO", null, undefined, 1, ""]) assert.equal(formatoDoTexto(outro), "texto");
});

test("marcação rica: fórmula ou cerca, não dinheiro", () => {
  assert.ok(temMarcacaoRica("veja \\(x\\)"));
  assert.ok(temMarcacaoRica("\\[x\\]"));
  assert.ok(temMarcacaoRica("```py\nx\n```"));
  assert.ok(temMarcacaoRica("se $x$ vale"));
  assert.ok(!temMarcacaoRica("custa R$ 5"));
  assert.ok(!temMarcacaoRica(null));
});
