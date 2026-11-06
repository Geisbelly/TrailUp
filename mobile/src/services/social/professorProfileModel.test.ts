import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProfessorProfile } from "./professorProfileModel";

test("normaliza o perfil do professor com as turmas em comum", () => {
  const perfil = normalizeProfessorProfile({
    nome: "Ana",
    foto_url: "perfil_fotos/x/foto.png",
    descricao: " Gosta de grafos ",
    instituicao: "Ulbra",
    disciplina: "",
    turmas: [{ classe_id: 1, nome: "3º período", materia: "Algoritmos" }, { classe_id: 2, nome: null, materia: null }, { nome: "sem id" }],
  });
  assert.equal(perfil?.nome, "Ana");
  assert.equal(perfil?.descricao, "Gosta de grafos");
  assert.equal(perfil?.disciplina, null);
  assert.deepEqual(perfil?.turmas, [
    { classeId: 1, nome: "3º período", materia: "Algoritmos" },
    { classeId: 2, nome: null, materia: null },
  ]);
});

test("fora da turma a função devolve nulo e o app mostra indisponível", () => {
  assert.equal(normalizeProfessorProfile(null), null);
  assert.equal(normalizeProfessorProfile({}), null);
  assert.equal(normalizeProfessorProfile({ nome: "   " }), null);
});

test("turmas fora do formato não derrubam o perfil", () => {
  assert.deepEqual(normalizeProfessorProfile({ nome: "Ana", turmas: "x" })?.turmas, []);
  assert.deepEqual(normalizeProfessorProfile({ nome: "Ana", turmas: [null, 3] })?.turmas, []);
});
