import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server");

// Os editores do spec B: o campo de código sem nada que reescreva o que o aluno digita, o recuo da
// linguagem na tecla Tab, o teclado numérico que alterna e as unidades da dimensão, e a prévia da
// expressão como fórmula. A inserção no cursor tem o teste puro dela (`editorDeResposta.test.ts`).

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { id: path, filename: path, loaded: true, exports };
};

type Qualquer = Record<string, unknown> & { children?: React.ReactNode };
const entradas: Qualquer[] = [];
const botoes: Qualquer[] = [];
function Host({ children }: Qualquer) {
  return <div>{children}</div>;
}
mockModule("react-native", {
  Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android ?? o.default },
  StyleSheet: { create: (s: unknown) => s },
  ScrollView: Host,
  Text: Host,
  View: Host,
  TextInput: (props: Qualquer) => {
    entradas.push(props);
    return <input data-rotulo={String(props.accessibilityLabel)} />;
  },
  TouchableOpacity: (props: Qualquer) => {
    botoes.push(props);
    return <button aria-label={String(props.accessibilityLabel)}>{props.children}</button>;
  },
});
mockModule("@/styles/GlobalStyle", { FontFamily: {} });
mockModule("@/components/textoRico/Formula", { MONO: "monospace" });
mockModule("@/components/textoRico/BlocoDeCodigo", {
  BlocoDeCodigo: ({ codigo, linguagem }: { codigo: string; linguagem: string }) => <pre>{`bloco[${linguagem}]:${codigo}`}</pre>,
});
mockModule("@/components/textoRico/TextoRico", {
  TextoRico: ({ texto, formato }: { texto: string; formato: string }) => <p>{`rico[${formato}]:${texto}`}</p>,
});

const { EditorDeCodigo } = require("./EditorDeCodigo");
const { EditorNumerico } = require("./EditorNumerico");
const { EditorDeExpressao } = require("./EditorDeExpressao");

const paleta = {
  accent: "#0af",
  accentMuted: "#024",
  background: "#000",
  border: "#333",
  surface: "#111",
  text: "#fff",
  textSubtle: "#aaa",
};

function desenhar(elemento: React.ReactElement) {
  entradas.length = 0;
  botoes.length = 0;
  return renderToString(elemento);
}

test("código: monoespaçado, sem autocorreção nem sugestão, e prévia com a linguagem", () => {
  const html = desenhar(<EditorDeCodigo valor={"def f():\n    return 1"} onChange={() => undefined} linguagem="python" editavel paleta={paleta} />);
  const [campo] = entradas;
  assert.equal(campo.multiline, true);
  assert.equal(campo.autoCorrect, false);
  assert.equal(campo.autoCapitalize, "none");
  assert.equal(campo.spellCheck, false);
  assert.equal(campo.autoComplete, "off");
  assert.equal((campo.style as { fontFamily?: string }).fontFamily, "monospace");
  assert.match(html, /Seu código em Python/);
  assert.match(html, /bloco\[python\]:def f\(\):/);
});

test("código: Tab põe o recuo da linguagem onde o cursor está", () => {
  const mudancas: string[] = [];
  desenhar(<EditorDeCodigo valor="ab" onChange={(t: string) => mudancas.push(t)} linguagem="javascript" editavel paleta={paleta} />);
  const tab = botoes.find((b) => String(b.accessibilityLabel).includes("recuo"));
  assert.ok(tab);
  (tab.onPress as () => void)();
  assert.deepEqual(mudancas, ["ab  "]);
});

test("código vazio não mostra prévia; bloqueado desliga a barra", () => {
  const html = desenhar(<EditorDeCodigo valor="  " onChange={() => undefined} linguagem={null} editavel={false} paleta={paleta} />);
  assert.doesNotMatch(html, /bloco\[/);
  assert.ok(botoes.length > 0 && botoes.every((b) => b.disabled === true));
  assert.equal(entradas[0].editable, false);
});

test("numérica: teclado de número que alterna para letras, e unidades da dimensão trocam a do fim", () => {
  const mudancas: string[] = [];
  const html = desenhar(<EditorNumerico valor="36 km/h" onChange={(t: string) => mudancas.push(t)} dimensao="velocidade" editavel paleta={paleta} />);
  assert.equal(entradas[0].keyboardType, "decimal-pad");
  assert.match(html, /Usar teclado de letras/);
  const ms = botoes.find((b) => b.accessibilityLabel === "Inserir unidade m/s");
  assert.ok(ms);
  (ms.onPress as () => void)();
  assert.deepEqual(mudancas, ["36 m/s"]);
});

test("numérica sem dimensão não inventa unidade", () => {
  const html = desenhar(<EditorNumerico valor="" onChange={() => undefined} dimensao={null} editavel paleta={paleta} />);
  assert.doesNotMatch(html, /Inserir unidade/);
  assert.match(html, /Vírgula ou ponto/);
});

test("expressão: barra de símbolos, variáveis e prévia como fórmula", () => {
  const mudancas: string[] = [];
  const html = desenhar(<EditorDeExpressao valor="x" onChange={(t: string) => mudancas.push(t)} variaveis={["x", "t"]} editavel paleta={paleta} />);
  assert.match(html, /Use as variáveis: (<!-- -->)?x, t/);
  assert.match(html, /rico\[rico\]:\$x\$/);
  const fracao = botoes.find((b) => b.accessibilityLabel === "Inserir fração");
  assert.ok(fracao);
  (fracao.onPress as () => void)();
  assert.deepEqual(mudancas, ["x\\frac{}{}"]);
});
