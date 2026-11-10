import assert from "node:assert/strict";
import test from "node:test";

import { alternativaDaResposta, letraDaAlternativa, textoRicoLegivel } from "./respostaRica";

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

test("texto rico legível, para leitor de tela", () => {
  assert.equal(textoRicoLegivel("Quanto vale \\(\\frac{a}{b}\\) se custa R$ 5?"), "Quanto vale a/b se custa R$ 5?");
  assert.equal(textoRicoLegivel("Use `print(x)`"), "Use print(x)");
  assert.equal(textoRicoLegivel(null), "");
});
