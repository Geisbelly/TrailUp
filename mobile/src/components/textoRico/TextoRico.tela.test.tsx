import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server");

// O TextoRico tem de: desenhar questão `'texto'` igual a antes (um Text, sem markdown); levar a
// `'rico'` ao markdown já preparada (dinheiro escapado, delimitadores em cifrão); e as regras
// darem fórmula, código com indentação e o TeX quebrado cru, sem lançar. O núcleo puro está
// coberto nos testes de `utils/textoRico`.

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { id: path, filename: path, loaded: true, exports };
};

type PropsDeHost = { children?: React.ReactNode; style?: unknown; accessibilityLabel?: string; numberOfLines?: number };
function Host({ children, style, accessibilityLabel, numberOfLines }: PropsDeHost) {
  return (
    <div data-estilo={JSON.stringify(style ?? null)} data-rotulo={accessibilityLabel} data-linhas={numberOfLines}>
      {children}
    </div>
  );
}

mockModule("react-native", {
  Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android ?? o.default },
  StyleSheet: { create: (s: unknown) => s },
  ScrollView: Host,
  Text: Host,
  View: Host,
});
mockModule("react-native-svg", { SvgXml: () => <svg /> });

let ultimasRegras: Record<string, (no: unknown) => React.ReactNode> = {};
const MarkdownIt = require("markdown-it");
function MarkdownDuble({ children, rules }: { children: string; rules: typeof ultimasRegras }) {
  ultimasRegras = rules;
  return <section data-markdown={children} />;
}
mockModule("react-native-markdown-display", { __esModule: true, default: MarkdownDuble, MarkdownIt });

const { TextoRico, formatoDoTexto } = require("./TextoRico");

const PALETA = { background: "#0b1020", accent: "#7c9cff", text: "#f2f4ff", border: "#334", surface: "#141a2e" };
const ESTILO = { color: "#f2f4ff", fontSize: 18 };

const desenhar = (texto: string, formato: string | null) =>
  renderToString(<TextoRico texto={texto} formato={formato} estilo={ESTILO} paleta={PALETA} />);

const desfazerEntidades = (html: string) =>
  html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

test("só 'rico' exatamente é rico", () => {
  assert.equal(formatoDoTexto("rico"), "rico");
  for (const outro of ["texto", "RICO", null, undefined, 1, ""]) assert.equal(formatoDoTexto(outro), "texto");
});

test("'texto' desenha um Text com o texto cru, sem markdown", () => {
  for (const formato of ["texto", null]) {
    const html = desenhar("Quanto é *2* + $x$? Custa R$ 5.", formato);
    assert.doesNotMatch(html, /data-markdown/);
    assert.ok(html.includes("Quanto é *2* + $x$? Custa R$ 5."));
  }
});

test("'rico' vai ao markdown preparado: dinheiro escapado, delimitador em cifrão", () => {
  const html = desfazerEntidades(desenhar("Custa R$ 50 e vale \\(\\frac{a}{b}\\)", "rico"));
  assert.match(html, /data-markdown="Custa R\\\$ 50 e vale \$\\frac\{a\}\{b\}\$"/);
});

test("as regras desenham fórmula, inline e em bloco", () => {
  desenhar("x", "rico");
  const inline = renderToString(<>{ultimasRegras.formula_inline({ key: "a", content: "\\frac{a}{b}" })}</>);
  // Antes do efeito rodar, a fórmula aparece legível, com o rótulo de acessibilidade.
  assert.match(desfazerEntidades(inline), /data-rotulo="a\/b"/);
  const bloco = renderToString(<>{ultimasRegras.formula_bloco({ key: "b", content: "x^2", block: true })}</>);
  assert.ok(bloco.length > 0);
});

test("cerca com linguagem vira código numerado e com a indentação de antes", () => {
  desenhar("x", "rico");
  const html = desfazerEntidades(
    renderToString(
      <>{ultimasRegras.fence({ key: "c", content: "def f(x):\n\treturn x\n", sourceInfo: "python" })}</>,
    ),
  );
  assert.match(html, /data-rotulo="Código em Python: def f\(x\):\n\treturn x\n"/);
  assert.ok(html.includes("    "), "tabulação vira quatro espaços");
  assert.ok(html.includes(">def<"));
  assert.ok(html.includes(">return<"));
  assert.match(html, />1<!-- --> {2}</, "número da linha");
});

test("cerca sem linguagem fica monoespaçada, sem número de linha (diagrama em ASCII)", () => {
  desenhar("x", "rico");
  const html = desfazerEntidades(
    renderToString(<>{ultimasRegras.fence({ key: "d", content: "+--+\n|  |\n+--+\n", sourceInfo: "" })}</>),
  );
  assert.ok(html.includes("+--+\n|  |\n+--+"));
  assert.doesNotMatch(html, /Código/);
  assert.match(html, /"fontFamily":"monospace"/);
});
