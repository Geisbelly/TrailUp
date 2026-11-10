import assert from "node:assert/strict";
import test from "node:test";

import { linguagemDoCodigo, tokensDoCodigo, type LinhaDeCodigo } from "./tokensDoCodigo";

function texto(linhas: LinhaDeCodigo[]): string {
  return linhas.map((linha) => linha.map((t) => t.texto).join("")).join("\n");
}

function papelDe(linhas: LinhaDeCodigo[], trecho: string): string | undefined {
  for (const linha of linhas) for (const t of linha) if (t.texto.includes(trecho)) return t.papel;
  return undefined;
}

const AMOSTRAS: [string, string, string, string][] = [
  ["python", "def soma(a, b):\n    # comentário\n    return a + b", "def", "palavra"],
  ["js", "const x = 'oi';\nconsole.log(x)", "'oi'", "texto"],
  ["ts", "let n: number = 42;", "42", "numero"],
  ["java", "public class Ola {\n  // nota\n}", "// nota", "comentario"],
  ["c", "int main() { return 0; }", "return", "palavra"],
  ["cpp", "std::cout << \"a\";", "\"a\"", "texto"],
  ["cs", "var nome = \"Ana\";", "var", "palavra"],
  ["sql", "SELECT nome FROM aluno WHERE id = 1;", "SELECT", "palavra"],
  ["html", "<p class=\"x\">oi</p>", "class", "atributo"],
  ["css", "p { color: red; }", "color", "atributo"],
];

for (const [rotulo, codigo, trecho, papel] of AMOSTRAS) {
  test(`${rotulo}: o texto volta igual e ${trecho} é ${papel}`, () => {
    const linhas = tokensDoCodigo(codigo, rotulo);
    assert.equal(texto(linhas), codigo);
    assert.equal(papelDe(linhas, trecho), papel);
  });
}

test("linguagem desconhecida ou ausente vem sem cor, linha por linha", () => {
  for (const rotulo of ["portugol", "", null, undefined]) {
    const linhas = tokensDoCodigo("leia x\n\nescreva x", rotulo);
    assert.deepEqual(linhas, [[{ texto: "leia x", papel: "simples" }], [], [{ texto: "escreva x", papel: "simples" }]]);
  }
});

test("quebra de linha do Windows e a do fim não viram linha a mais", () => {
  assert.equal(tokensDoCodigo("a = 1\r\nb = 2\n", "python").length, 2);
});

test("comentário de várias linhas fica comentário em cada linha", () => {
  const linhas = tokensDoCodigo("/* um\ndois */ int x;", "c");
  assert.equal(linhas[0][0].papel, "comentario");
  assert.equal(linhas[1][0].papel, "comentario");
});

test("apelidos", () => {
  assert.equal(linguagemDoCodigo("C++"), "cpp");
  assert.equal(linguagemDoCodigo(" C# "), "csharp");
  assert.equal(linguagemDoCodigo("Py"), "python");
  assert.equal(linguagemDoCodigo("portugol"), null);
});
