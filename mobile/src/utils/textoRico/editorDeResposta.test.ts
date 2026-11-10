import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  TECLAS_DA_EXPRESSAO,
  formaDaResposta,
  inserirNoCursor,
  previaDaExpressao,
  recuoDaLinguagem,
  trocarUnidade,
  unidadesDaDimensao,
} from "./editorDeResposta";

test("forma da resposta: os dois idiomas do banco, e o tipo da questão antes do da atividade", () => {
  assert.equal(formaDaResposta("codigo"), "codigo");
  assert.equal(formaDaResposta(" Code "), "codigo");
  assert.equal(formaDaResposta("numérica"), "numerica");
  assert.equal(formaDaResposta("numeric"), "numerica");
  assert.equal(formaDaResposta("expressão"), "expressao");
  assert.equal(formaDaResposta(null, "expression"), "expressao");
  assert.equal(formaDaResposta("numerica", "code"), "numerica");
  assert.equal(formaDaResposta("multipla_escolha", "quiz"), null);
  assert.equal(formaDaResposta(undefined), null);
});

test("recuo: 2 espaços na web e no SQL, 4 no resto e sem linguagem", () => {
  assert.equal(recuoDaLinguagem("JavaScript"), "  ");
  assert.equal(recuoDaLinguagem("sql"), "  ");
  assert.equal(recuoDaLinguagem("python"), "    ");
  assert.equal(recuoDaLinguagem("c++"), "    ");
  assert.equal(recuoDaLinguagem(null), "    ");
});

test("inserir no cursor: par deixa o cursor dentro, seleção é envolvida", () => {
  assert.deepEqual(inserirNoCursor("x = ", { start: 4, end: 4 }, "\\frac{", "}{}"), {
    texto: "x = \\frac{}{}",
    selecao: { start: 10, end: 10 },
  });
  assert.deepEqual(inserirNoCursor("a+b", { start: 0, end: 3 }, "(", ")"), {
    texto: "(a+b)",
    selecao: { start: 4, end: 4 },
  });
  // Seleção invertida e fora do texto não quebram.
  assert.equal(inserirNoCursor("ab", { start: 2, end: 0 }, "[", "]").texto, "[ab]");
  assert.deepEqual(inserirNoCursor("ab", { start: 99, end: 99 }, ";"), { texto: "ab;", selecao: { start: 3, end: 3 } });
  assert.deepEqual(inserirNoCursor("ab", null, ":"), { texto: "ab:", selecao: { start: 3, end: 3 } });
});

test("unidades: atalhos da dimensão, nada para a desconhecida", () => {
  assert.deepEqual(unidadesDaDimensao("Velocidade"), ["m/s", "km/h"]);
  assert.deepEqual(unidadesDaDimensao("aceleração"), ["m/s²"]);
  assert.deepEqual(unidadesDaDimensao("felicidade"), []);
  assert.deepEqual(unidadesDaDimensao(undefined), []);
});

test("trocar unidade mantém o número, com vírgula e notação científica", () => {
  assert.equal(trocarUnidade("10 km/h", "m/s"), "10 m/s");
  assert.equal(trocarUnidade("3,5", "kg"), "3,5 kg");
  assert.equal(trocarUnidade("-2.5e3 J", "kJ"), "-2.5e3 kJ");
  assert.equal(trocarUnidade("6 · 10^23", "mol"), "6 · 10^23 mol");
  assert.equal(trocarUnidade("", "m"), "m");
});

test("prévia da expressão: vira fórmula, a não ser que o aluno já tenha posto o cifrão", () => {
  assert.equal(previaDaExpressao(" \\frac{1}{2} "), "$\\frac{1}{2}$");
  assert.equal(previaDaExpressao("a $x$"), "a $x$");
  assert.equal(previaDaExpressao("   "), "");
});

test("toda tecla da expressão escreve o que a edge lê", () => {
  // A edge recusa comando fora do vocabulário dela. Este teste lê o vocabulário no código da edge,
  // para a barra não oferecer uma tecla que dá `expressao_invalida` com a resposta certa.
  const edge = resolve(__dirname, "../../../../frontend/supabase/functions/questao-conferir-resposta");
  const latex = readFileSync(resolve(edge, "latexParaMathjs.ts"), "utf8");
  const quimica = readFileSync(resolve(edge, "quimica.ts"), "utf8");
  for (const tecla of TECLAS_DA_EXPRESSAO) {
    for (const comando of `${tecla.antes}${tecla.depois ?? ""}`.match(/\\[A-Za-z]+/g) ?? []) {
      const nome = comando.slice(1);
      const conhecido =
        new RegExp(`\\b${nome}:`).test(latex) ||
        new RegExp(`"${nome}"`).test(latex) ||
        (nome === "ce" && quimica.includes("\\ce{"));
      assert.ok(conhecido, `a edge não lê ${comando} (tecla ${tecla.leitura})`);
    }
  }
  assert.ok(quimica.includes("→"), "a seta Unicode é lida pela química");
});
