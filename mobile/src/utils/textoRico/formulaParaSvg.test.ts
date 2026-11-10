import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  FAIXAS_EMBUTIDAS,
  extrairSvg,
  formulaParaSvg,
  tamanhoDoCacheDeFormulas,
  type FormulaSvg,
} from "./formulaParaSvg";

function ok(resultado: Awaited<ReturnType<typeof formulaParaSvg>>): FormulaSvg {
  assert.ok(!("erro" in resultado), `esperava svg, veio erro: ${"erro" in resultado ? resultado.erro : ""}`);
  return resultado as FormulaSvg;
}

const ESCOLARES = [
  "\\frac{\\Delta s}{\\Delta t}",
  "\\sqrt{x^2+1}",
  "\\vec{F} = m\\vec{a}",
  "\\ce{2H2 + O2 -> 2H2O}",
  "\\ce{N2 + 3H2 <=> 2NH3}",
  "\\ce{Cu^{2+} + 2e- -> Cu}",
  "\\pu{9,8 m/s^2}",
  "\\text{área} = \\pi r^2",
  "\\mathbb{R}",
  "\\mathcal{L}",
  "\\mathbf{v}",
  "\\Rightarrow",
  "\\angle ABC = 90^\\circ",
  "\\star",
  "\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}",
  "\\dv{x}{t}",
  "\\cancel{x}",
];

for (const tex of ESCOLARES) {
  test(`fórmula escolar vira svg: ${tex}`, async () => {
    const r = ok(await formulaParaSvg(tex));
    assert.match(r.svg, /^<svg[\s\S]*<\/svg>$/);
    assert.ok(r.largura > 0 && r.altura > 0);
    assert.doesNotMatch(r.svg, /data-latex|mjx-container/);
    assert.match(r.svg, /currentColor/, "a cor vem do texto ao redor");
  });
}

test("fórmula em linha com vários termos sai inteira, num svg só (medido no Android)", async () => {
  for (const tex of ["n = 0", "v_m = \\frac{\\Delta s}{\\Delta t}", "\\frac{3}{4} + \\frac{1}{8}", "\\sqrt{\\frac{49}{64}} + 0{,}5"]) {
    const r = ok(await formulaParaSvg(tex));
    assert.equal(r.svg.match(/<svg/g)?.length, 1, tex);
    assert.doesNotMatch(r.svg, /mjx-break/, tex);
  }
  const sozinho = ok(await formulaParaSvg("n"));
  const comTermos = ok(await formulaParaSvg("n = 0"));
  assert.ok(comTermos.largura > sozinho.largura * 2, "a largura é a da fórmula inteira");
});

test("extrairSvg recusa fórmula partida em trechos", () => {
  const partida = '<mjx-container><svg width="1ex" height="2ex"></svg><mjx-break size="4"> </mjx-break><svg width="3ex" height="2ex"></svg></mjx-container>';
  assert.deepEqual(extrairSvg(partida), { erro: "fórmula partida em trechos" });
});

test("TeX quebrado volta como erro, não como svg de erro", async () => {
  const r = await formulaParaSvg("\\frac{a");
  assert.ok("erro" in r);
});

test("comando desconhecido volta como erro", async () => {
  const r = await formulaParaSvg("\\comandoquenaoexiste{x}");
  assert.ok("erro" in r);
});

test("vazio volta como erro", async () => {
  assert.ok("erro" in (await formulaParaSvg("   ")));
});

test("bloco é diferente de inline e os dois ficam no cache", async () => {
  const antes = tamanhoDoCacheDeFormulas();
  const inline = ok(await formulaParaSvg("\\sum_{i=1}^{n} i"));
  const bloco = ok(await formulaParaSvg("\\sum_{i=1}^{n} i", { display: true }));
  assert.notEqual(inline.svg, bloco.svg);
  assert.equal(tamanhoDoCacheDeFormulas(), antes + 2);
  assert.equal(ok(await formulaParaSvg("\\sum_{i=1}^{n} i")).svg, inline.svg);
  assert.equal(tamanhoDoCacheDeFormulas(), antes + 2);
});

test("o cache não passa de 200", async () => {
  for (let i = 0; i < 230; i += 1) await formulaParaSvg(`x_{${i}}`);
  assert.equal(tamanhoDoCacheDeFormulas(), 200);
});

test("cada faixa embutida existe no pacote da fonte", () => {
  const pasta = join(dirname(require.resolve("@mathjax/mathjax-newcm-font/cjs/svg.js")), "svg", "dynamic");
  for (const faixa of FAIXAS_EMBUTIDAS) assert.ok(existsSync(join(pasta, `${faixa}.js`)), faixa);
});

test("extrairSvg lê medidas e alinhamento", () => {
  const r = extrairSvg(
    '<mjx-container><svg style="vertical-align: -0.798ex;" xmlns="http://www.w3.org/2000/svg" width="1.842ex" height="2.397ex" role="img" viewBox="0 0 1 1"><g data-latex="a" fill="currentColor"></g></svg></mjx-container>',
  );
  assert.deepEqual(r, {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1.842ex" height="2.397ex" viewBox="0 0 1 1"><g fill="currentColor"></g></svg>',
    largura: 1.842,
    altura: 2.397,
    alinhamento: -0.798,
  });
});
