import assert from "node:assert/strict";
import test from "node:test";

import { corpoDaFormula, matematicaLegivel, pareceMatematica } from "./matematicaLegivel";

/**
 * O gerador entrega fórmula em LaTeX e o `react-native-markdown-display` não renderiza
 * matemática — o aluno via `$x$` e `$$ax + b = 0$$` literalmente (#522).
 *
 * O risco do conserto é o cifrão de MOEDA. Metade destes testes existe por causa dele: errar
 * "R$ 1.200" é pior que deixar o LaTeX à vista.
 */

test("os exemplos exatos da issue viram texto", () => {
  assert.equal(matematicaLegivel("A incógnita $x$ é o que se procura."), "A incógnita x é o que se procura.");
  assert.equal(matematicaLegivel("com $a \\neq 0$"), "com a ≠ 0");
  assert.equal(matematicaLegivel("A forma é $$ax + b = 0$$ sempre."), "A forma é ax + b = 0 sempre.");
});

test("dinheiro em real NAO e tocado", () => {
  // O caso que torna a conversão perigosa.
  for (const texto of ["custa R$ 50", "R$1.200,00 por mês", "de R$ 10 a R$ 20"]) {
    assert.equal(matematicaLegivel(texto), texto, texto);
  }
});

test("numero entre cifroes continua numero", () => {
  assert.equal(matematicaLegivel("são $50$ reais"), "são $50$ reais");
  assert.equal(matematicaLegivel("$1.200,00$"), "$1.200,00$");
});

test("prosa entre cifroes nao e formula", () => {
  const texto = "o preço $de  lista$ mudou";
  assert.equal(matematicaLegivel(texto), texto, "espaço duplo indica prosa, não fórmula");
});

test("cifrao solto nao quebra nada", () => {
  assert.equal(matematicaLegivel("o símbolo $ é cifrão"), "o símbolo $ é cifrão");
  assert.equal(matematicaLegivel("sem cifrão nenhum"), "sem cifrão nenhum");
});

test("dentro de bloco de codigo fica intocado", () => {
  // `$` em código é `$`: shell, template, regex.
  const texto = "veja:\n```bash\necho $x\n```\nfim";
  assert.equal(matematicaLegivel(texto), texto);

  const inline = "use `$x` no shell";
  assert.equal(matematicaLegivel(inline), inline);
});

test("fracao, raiz e expoente viram simbolo", () => {
  assert.equal(corpoDaFormula("\\frac{a}{b}"), "a/b");
  assert.equal(corpoDaFormula("\\sqrt{2}"), "√2");
  assert.equal(corpoDaFormula("x^2"), "x²");
  assert.equal(corpoDaFormula("x^{3}"), "x³");
});

test("expoente nao numerico nao vira unicode errado", () => {
  // Nao existe sobrescrito unicode para `n+1`; inventar um seria pior que manter o `^`.
  assert.equal(corpoDaFormula("x^{n+1}"), "x^n+1");
});

test("comando desconhecido perde a barra, nao o texto", () => {
  assert.equal(corpoDaFormula("\\lambda"), "lambda");
  assert.ok(!corpoDaFormula("\\vec{v}").includes("\\"), "barra invertida nao pode sobrar");
});

test("chave solta nao aparece para o aluno", () => {
  assert.ok(!corpoDaFormula("\\mathbb{R}").includes("{"));
  assert.ok(!corpoDaFormula("\\mathbb{R}").includes("}"));
});

test("pareceMatematica recusa o que nao tem operador nem comando", () => {
  assert.equal(pareceMatematica("x = 4"), true);
  assert.equal(pareceMatematica("a \\neq 0"), true);
  assert.equal(pareceMatematica("50"), false);
  assert.equal(pareceMatematica("1.200,00"), false);
  assert.equal(pareceMatematica(""), false);
  assert.equal(pareceMatematica("x".repeat(300)), false, "texto longo nao e formula");
});

test("markdown sem cifrao volta identico, sem trabalho", () => {
  const texto = "# Título\n\nParágrafo com **negrito** e lista:\n\n1. um\n2. dois\n";
  assert.equal(matematicaLegivel(texto), texto);
});

test("varias formulas na mesma linha", () => {
  assert.equal(
    matematicaLegivel("se $x = 2$ entao $y = x^2$ vale 4"),
    "se x = 2 entao y = x² vale 4",
  );
});
