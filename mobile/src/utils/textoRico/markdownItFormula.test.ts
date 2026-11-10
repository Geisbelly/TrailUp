import assert from "node:assert/strict";
import test from "node:test";

import MarkdownIt from "markdown-it";

import { markdownItFormula } from "./markdownItFormula";
import { prepararTextoRico } from "./prepararTextoRico";

type Token = { type: string; content: string; block: boolean; children: Token[] | null };
type Parser = {
  parse: (texto: string, env: object) => Token[];
  parseInline: (texto: string, env: object) => Token[];
  renderInline: (texto: string) => string;
};

const md = markdownItFormula(new MarkdownIt({ typographer: true })) as unknown as Parser;

type Achado = { tipo: string; conteudo: string; bloco: boolean };

function formulas(markdown: string): Achado[] {
  const saida: Achado[] = [];
  const visitar = (tokens: Token[] | null) => {
    for (const t of tokens ?? []) {
      if (t.type.startsWith("formula_")) saida.push({ tipo: t.type, conteudo: t.content, bloco: t.block });
      visitar(t.children);
    }
  };
  visitar(md.parse(markdown, {}));
  return saida;
}

function textoVisivel(markdown: string): string {
  return md.renderInline(markdown).replace(/<[^>]+>/g, "");
}

test("inline", () => {
  assert.deepEqual(formulas("Se $x^2 = 4$, então"), [{ tipo: "formula_inline", conteudo: "x^2 = 4", bloco: false }]);
});

test("duas na mesma frase", () => {
  assert.deepEqual(
    formulas("$a$ e $b$").map((f) => f.conteudo),
    ["a", "b"],
  );
});

test("bloco sozinho na linha", () => {
  assert.deepEqual(formulas("Veja:\n\n$$E = mc^2$$\n\nfim"), [{ tipo: "formula_bloco", conteudo: "E = mc^2", bloco: true }]);
});

test("bloco em várias linhas", () => {
  assert.deepEqual(formulas("$$\n\\frac{a}{b}\n+ c\n$$"), [{ tipo: "formula_bloco", conteudo: "\\frac{a}{b}\n+ c", bloco: true }]);
});

test("$$ no meio da frase é destaque dentro do parágrafo", () => {
  assert.deepEqual(formulas("a soma $$\\sum i$$ vale"), [{ tipo: "formula_bloco", conteudo: "\\sum i", bloco: false }]);
});

test("cifrão escapado é cifrão", () => {
  assert.deepEqual(formulas("custa R\\$ 5 e \\$ 3"), []);
  assert.equal(textoVisivel("custa R\\$ 5"), "custa R$ 5");
});

test("cifrão escapado dentro da fórmula não fecha", () => {
  assert.deepEqual(formulas("$\\text{custa } \\$5$").map((f) => f.conteudo), ["\\text{custa } \\$5"]);
});

test("código leva o cifrão junto", () => {
  assert.deepEqual(formulas("use `$PATH` e `$x$`"), []);
  assert.deepEqual(formulas("```python\nprint('$x$')\n```"), []);
});

test("cifrão sem fechamento é texto", () => {
  assert.deepEqual(formulas("só um $ aqui"), []);
  assert.deepEqual(formulas("$a\nb$"), [], "inline não cruza linha");
});

test("vazio não é fórmula", () => {
  assert.deepEqual(formulas("$ $ e $$ $$"), []);
});

test("encadeado com prepararTextoRico: dinheiro some, fórmula fica", () => {
  const pronto = prepararTextoRico("Pagou R$ 1.200 por \\(\\ce{CO2}\\) e $x$");
  assert.deepEqual(formulas(pronto).map((f) => f.conteudo), ["\\ce{CO2}", "x"]);
  assert.match(textoVisivel(pronto), /Pagou R\$ 1\.200 por/);
});

test("ênfase em volta da fórmula continua ênfase", () => {
  const tokens = md.parseInline("*antes $x_1$ depois*", {})[0].children ?? [];
  assert.deepEqual(
    tokens.map((t) => t.type),
    ["em_open", "text", "formula_inline", "text", "em_close"],
  );
});
