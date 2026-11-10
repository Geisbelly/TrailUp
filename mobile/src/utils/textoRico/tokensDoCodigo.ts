/**
 * Quebra um bloco de código em linhas de trechos com papel (palavra-chave, texto, número…), para o
 * `BlocoDeCodigo` colorir sem WebView (spec A, 08/11).
 *
 * Prism, só com as linguagens da spec B: Python, JavaScript, TypeScript, Java, C, C++, C#, SQL,
 * HTML e CSS. Linguagem fora da lista, ou bloco sem linguagem, vem sem cor: é texto monoespaçado,
 * nunca um erro. O papel é reduzido a poucos nomes (`PapelDoTrecho`), porque o tema do app colore
 * por papel, não pelos ~40 tipos de token do Prism.
 *
 * O Prism é carregado na primeira chamada, como o MathJax em `formulaParaSvg`.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import type { Grammar, TokenStream } from "prismjs";

export type PapelDoTrecho =
  | "comentario"
  | "palavra"
  | "texto"
  | "numero"
  | "funcao"
  | "classe"
  | "operador"
  | "pontuacao"
  | "tag"
  | "atributo"
  | "simples";

export type Trecho = { texto: string; papel: PapelDoTrecho };
export type LinhaDeCodigo = Trecho[];

const APELIDOS: Record<string, string> = {
  py: "python",
  python: "python",
  js: "javascript",
  javascript: "javascript",
  jsx: "javascript",
  ts: "typescript",
  typescript: "typescript",
  tsx: "typescript",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  "c++": "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  csharp: "csharp",
  "c#": "csharp",
  sql: "sql",
  html: "markup",
  xml: "markup",
  markup: "markup",
  css: "css",
};

/** Nome da gramática do Prism para o rótulo do bloco cercado, ou `null` se não for suportada. */
export function linguagemDoCodigo(rotulo: string | null | undefined): string | null {
  if (!rotulo) return null;
  return APELIDOS[rotulo.trim().toLowerCase()] ?? null;
}

type Prism = { languages: Record<string, Grammar>; tokenize: (codigo: string, gramatica: Grammar) => TokenStream };

let prism: Prism | null = null;

function carregarPrism(): Prism {
  const nucleo = require("prismjs/components/prism-core") as Prism;
  // As gramáticas se registram no `Prism` global, e algumas estendem outras: a ordem importa.
  const global = globalThis as { Prism?: Prism };
  global.Prism ??= nucleo;
  require("prismjs/components/prism-clike");
  require("prismjs/components/prism-markup");
  require("prismjs/components/prism-css");
  require("prismjs/components/prism-javascript");
  require("prismjs/components/prism-typescript");
  require("prismjs/components/prism-python");
  require("prismjs/components/prism-java");
  require("prismjs/components/prism-c");
  require("prismjs/components/prism-cpp");
  require("prismjs/components/prism-csharp");
  require("prismjs/components/prism-sql");
  return nucleo;
}

const PAPEIS: Record<string, PapelDoTrecho> = {
  comment: "comentario",
  prolog: "comentario",
  doctype: "comentario",
  cdata: "comentario",
  keyword: "palavra",
  boolean: "palavra",
  important: "palavra",
  builtin: "palavra",
  string: "texto",
  char: "texto",
  "template-string": "texto",
  "triple-quoted-string": "texto",
  regex: "texto",
  url: "texto",
  "attr-value": "texto",
  number: "numero",
  constant: "numero",
  function: "funcao",
  "function-definition": "funcao",
  "class-name": "classe",
  "maybe-class-name": "classe",
  namespace: "classe",
  selector: "classe",
  operator: "operador",
  punctuation: "pontuacao",
  tag: "tag",
  "attr-name": "atributo",
  property: "atributo",
  decorator: "atributo",
  annotation: "atributo",
};

function papelDe(tipo: string | undefined, alias: string | string[] | undefined): PapelDoTrecho | undefined {
  const nomes = [tipo, ...(Array.isArray(alias) ? alias : alias ? [alias] : [])];
  for (const nome of nomes) if (nome && PAPEIS[nome]) return PAPEIS[nome];
  return undefined;
}

function achatar(fluxo: TokenStream, herdado: PapelDoTrecho, saida: Trecho[]): void {
  if (typeof fluxo === "string") {
    saida.push({ texto: fluxo, papel: herdado });
    return;
  }
  if (Array.isArray(fluxo)) {
    for (const parte of fluxo) achatar(parte, herdado, saida);
    return;
  }
  achatar(fluxo.content, papelDe(fluxo.type, fluxo.alias) ?? herdado, saida);
}

/** Corta os trechos em linhas, juntando vizinhos do mesmo papel. Linha vazia é `[]`. */
function emLinhas(trechos: Trecho[]): LinhaDeCodigo[] {
  const linhas: LinhaDeCodigo[] = [[]];
  for (const trecho of trechos) {
    trecho.texto.split("\n").forEach((pedaco, indice) => {
      if (indice > 0) linhas.push([]);
      if (pedaco === "") return;
      const linha = linhas[linhas.length - 1];
      const anterior = linha[linha.length - 1];
      if (anterior && anterior.papel === trecho.papel) anterior.texto += pedaco;
      else linha.push({ texto: pedaco, papel: trecho.papel });
    });
  }
  return linhas;
}

export function tokensDoCodigo(codigo: string, rotulo?: string | null): LinhaDeCodigo[] {
  const semFimDeLinha = codigo.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  const linguagem = linguagemDoCodigo(rotulo);
  if (!linguagem) return emLinhas([{ texto: semFimDeLinha, papel: "simples" }]);
  try {
    prism ??= carregarPrism();
    const gramatica = prism.languages[linguagem];
    if (!gramatica) return emLinhas([{ texto: semFimDeLinha, papel: "simples" }]);
    const trechos: Trecho[] = [];
    achatar(prism.tokenize(semFimDeLinha, gramatica), "simples", trechos);
    return emLinhas(trechos);
  } catch {
    return emLinhas([{ texto: semFimDeLinha, papel: "simples" }]);
  }
}
