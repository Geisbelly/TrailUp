import assert from "node:assert/strict";
import test from "node:test";
import { rotuloDaTurma } from "./rotuloDaTurma";

test("turma com nome e matéria mostra as duas coisas", () => {
  const rotulo = rotuloDaTurma({ classe_nome: "3º período", materia_nome: "Algoritmos", professor_nome: "Ana" });
  assert.equal(rotulo.titulo, "3º período");
  assert.equal(rotulo.materia, "Algoritmos");
  assert.equal(rotulo.professor, "Ana");
  assert.equal(rotulo.descricaoAcessivel, "3º período, matéria Algoritmos");
});

test("turma sem matéria usa o mesmo nome do console", () => {
  const rotulo = rotuloDaTurma({ classe_nome: "Reforço", materia_nome: null, professor_nome: null });
  assert.equal(rotulo.materia, "Geral");
  assert.equal(rotulo.titulo, "Reforço");
  assert.equal(rotulo.professor, null);
});

test("sem nome de turma, o título cai na matéria e não repete no leitor de tela", () => {
  const rotulo = rotuloDaTurma({ classe_nome: "  ", materia_nome: "História", professor_nome: " " });
  assert.equal(rotulo.titulo, "História");
  assert.equal(rotulo.descricaoAcessivel, "História");
  assert.equal(rotulo.professor, null);
});

test("sem resumo o card ainda tem o que mostrar", () => {
  const rotulo = rotuloDaTurma(null);
  assert.equal(rotulo.titulo, "Turma");
  assert.equal(rotulo.materia, "Geral");
});
