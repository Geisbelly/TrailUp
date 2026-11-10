/**
 * Quebra um bloco de código em linhas de trechos com papel (palavra-chave, texto, número…), para o
 * `BlocoDeCodigo` colorir sem WebView (spec A, 08/11).
 *
 * Prism, só com as linguagens da spec B: Python, JavaScript, TypeScript, Java, C, C++, C#, SQL,
 * HTML e CSS. SQL em cinco sabores (genérico, MySQL, SQL Server, PostgreSQL e Oracle), pelo rótulo do
 * bloco: ver `dialetosSql.ts`. Linguagem fora da lista, ou bloco sem linguagem, vem sem cor: é texto monoespaçado,
 * nunca um erro. O papel é reduzido a poucos nomes (`PapelDoTrecho`), porque o tema do app colore
 * por papel, não pelos ~40 tipos de token do Prism.
 *
 * Cópia de `mobile/src/utils/textoRico/tokensDoCodigo.ts`; só a carga do Prism muda. Aqui as
 * gramáticas entram por `import` estático, na ordem em que uma estende a outra: o núcleo se registra
 * no `Prism` global (janela no navegador, `global` no vitest), e cada componente o lê de lá.
 */

import Prism from "prismjs/components/prism-core";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-plsql";
import type { TokenStream } from "prismjs";

import { registrarDialetosSql, type PrismComDialetos } from "./dialetosSql";

registrarDialetosSql(Prism as unknown as PrismComDialetos);

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
  sql: "sql-generico",
  sqlite: "sql-generico",
  mysql: "sql-mysql",
  mariadb: "sql-mysql",
  tsql: "sql-tsql",
  "t-sql": "sql-tsql",
  "transact-sql": "sql-tsql",
  mssql: "sql-tsql",
  sqlserver: "sql-tsql",
  "sql-server": "sql-tsql",
  postgres: "sql-postgres",
  postgresql: "sql-postgres",
  psql: "sql-postgres",
  pgsql: "sql-postgres",
  plpgsql: "sql-postgres",
  plsql: "plsql",
  "pl/sql": "plsql",
  oracle: "plsql",
  html: "markup",
  xml: "markup",
  markup: "markup",
  css: "css",
};

/** Nome da gramática do Prism para o rótulo do bloco cercado, ou `null` se não for suportada. */
export function linguagemDoCodigo(rotulo: string | null | undefined): string | null {
  if (!rotulo) return null;
  return APELIDOS[rotulo.trim().toLowerCase().replace(/[\s_]+/g, "")] ?? null;
}

const NOMES: Record<string, string> = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  java: "Java",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  "sql-generico": "SQL",
  "sql-mysql": "MySQL",
  "sql-tsql": "SQL Server",
  "sql-postgres": "PostgreSQL",
  plsql: "Oracle",
  markup: "HTML",
  css: "CSS",
};

/** Nome para gente ler (leitor de tela, seletor do console): `sqlserver` vira "SQL Server". */
export function nomeDaLinguagem(rotulo: string | null | undefined): string | null {
  const linguagem = linguagemDoCodigo(rotulo);
  return linguagem ? NOMES[linguagem] ?? null : null;
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
  variable: "atributo",
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
    const gramatica = Prism.languages[linguagem];
    if (!gramatica) return emLinhas([{ texto: semFimDeLinha, papel: "simples" }]);
    const trechos: Trecho[] = [];
    achatar(Prism.tokenize(semFimDeLinha, gramatica), "simples", trechos);
    return emLinhas(trechos);
  } catch {
    return emLinhas([{ texto: semFimDeLinha, papel: "simples" }]);
  }
}
