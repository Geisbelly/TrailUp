import assert from "node:assert/strict";
import { test } from "vitest";

import { linguagemDoCodigo, nomeDaLinguagem, tokensDoCodigo, type LinhaDeCodigo } from "./tokensDoCodigo";

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

// SQL em cinco sabores: cada caso é a regra que separa um dialeto do outro.
const DIALETOS: [string, string, string, string][] = [
  ["mysql", "SELECT nome FROM `aluno` # só ativos", "# só ativos", "comentario"],
  ["mariadb", "SELECT GROUP_CONCAT(nome) FROM aluno;", "GROUP_CONCAT", "funcao"],
  ["sqlserver", "SELECT TOP 5 * INTO #notas FROM aluno;", "#notas", "simples"],
  ["tsql", "SELECT [Nome do Aluno] FROM dbo.aluno;", "[Nome do Aluno]", "simples"],
  ["mssql", "DECLARE @nota NVARCHAR(10) = N'dez';\nGO", "NVARCHAR", "palavra"],
  ["sql server", "SELECT GETDATE();", "GETDATE", "funcao"],
  ["T-SQL", "SET @nota = @@ROWCOUNT;", "@nota", "atributo"],
  ["postgresql", "SELECT id::text FROM aluno WHERE id = $1 RETURNING *;", "$1", "atributo"],
  ["postgres", "CREATE TABLE a (id BIGSERIAL, dados JSONB);", "JSONB", "palavra"],
  ["psql", "SELECT 5 # 3; -- XOR", "#", "simples"],
  ["plpgsql", "AS $$\nBEGIN\n  RETURN 1;\nEND;\n$$ LANGUAGE plpgsql;", "BEGIN", "palavra"],
  ["oracle", "SELECT NVL(nota, 0) FROM aluno WHERE ROWNUM <= 5;", "NVL", "funcao"],
  ["plsql", "BEGIN\n  -- nota\n  NULL;\nEND;", "-- nota", "comentario"],
  ["sql", "SELECT * FROM aluno -- os ativos", "-- os ativos", "comentario"],
  ["sql", "SELECT * INTO #notas FROM aluno; # nota", "# nota", "comentario"],
  ["sqlite", "SELECT LEFT(nome, 3) FROM aluno LEFT JOIN turma ON 1 = 1;", "LEFT", "funcao"],
];

for (const [rotulo, codigo, trecho, papel] of DIALETOS) {
  test(`${rotulo}: o texto volta igual e ${trecho} é ${papel}`, () => {
    const linhas = tokensDoCodigo(codigo, rotulo);
    assert.equal(texto(linhas), codigo);
    assert.equal(papelDe(linhas, trecho), papel);
  });
}

test("sql genérico: #tabela temporária não vira comentário, e LEFT JOIN é palavra", () => {
  const linhas = tokensDoCodigo("SELECT * INTO #notas FROM aluno LEFT JOIN turma", "sql");
  assert.equal(papelDe(linhas, "FROM"), "palavra");
  assert.equal(papelDe(linhas, "LEFT"), "palavra");
});

test("comentário de SQL dentro de texto continua texto", () => {
  const linhas = tokensDoCodigo("SELECT '-- não é comentário' AS x", "postgresql");
  assert.equal(papelDe(linhas, "não é"), "texto");
  assert.equal(papelDe(linhas, "AS"), "palavra");
});

test("apelidos de SQL", () => {
  assert.equal(linguagemDoCodigo("MySQL"), "sql-mysql");
  assert.equal(linguagemDoCodigo("SQL Server"), "sql-tsql");
  assert.equal(linguagemDoCodigo("sql_server"), "sql-tsql");
  assert.equal(linguagemDoCodigo("PostgreSQL"), "sql-postgres");
  assert.equal(linguagemDoCodigo("PL/SQL"), "plsql");
  assert.equal(linguagemDoCodigo("SQL"), "sql-generico");
});

test("nome da linguagem para o leitor de tela", () => {
  assert.equal(nomeDaLinguagem("sqlserver"), "SQL Server");
  assert.equal(nomeDaLinguagem("mysql"), "MySQL");
  assert.equal(nomeDaLinguagem("cpp"), "C++");
  assert.equal(nomeDaLinguagem("portugol"), null);
});
