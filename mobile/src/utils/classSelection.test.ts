import assert from "node:assert/strict";
import test from "node:test";
import { findSelectedClass, isTopicOutsideSelectedClass } from "./classSelection";

const classes = [
  { classe_id: 32, aluno_id: "aluno", topicos: [{ id: 125 }] },
  { classe_id: 54, aluno_id: "aluno", topicos: [{ id: 131 }] },
];

test("login nunca escolhe automaticamente a primeira turma, nem com matrícula única", () => {
  assert.equal(findSelectedClass(classes, null, "aluno"), null);
  assert.equal(findSelectedClass(classes.slice(0, 1), undefined, "aluno"), null);
  assert.equal(findSelectedClass([], null, "aluno"), null);
});

test("seleção usa o ID estável da turma, não sua posição na lista", () => {
  assert.equal(findSelectedClass(classes, 54, "aluno"), classes[1]);
  assert.equal(findSelectedClass([...classes].reverse(), 54, "aluno"), classes[1]);
  assert.equal(findSelectedClass(classes, 1, "aluno"), null);
});

test("atualizar progresso mantém a escolha e usa os dados novos da turma", () => {
  const refreshed = classes.map((item) => ({ ...item, updated: true }));
  assert.equal(findSelectedClass(refreshed, 54, "aluno"), refreshed[1]);
});

test("remover matrícula exige nova escolha, sem cair silenciosamente na primeira turma", () => {
  assert.equal(findSelectedClass(classes.slice(0, 1), 54, "aluno"), null);
  assert.equal(findSelectedClass([], 54, "aluno"), null);
});

test("não herda seleção de outro aluno nem aceita turma fora das matrículas", () => {
  assert.equal(findSelectedClass(classes, 54, "outro-aluno"), null);
  assert.equal(findSelectedClass(classes, 54, null), null);
  assert.equal(findSelectedClass(classes, 999, "aluno"), null);
});

test("links diretos só retomam tópico da turma que o aluno escolheu", () => {
  assert.equal(isTopicOutsideSelectedClass("/trilha/131", classes[1]), false);
  assert.equal(isTopicOutsideSelectedClass("/(tabs)/trilha/131?contentId=192", classes[1]), false);
  assert.equal(isTopicOutsideSelectedClass("/trilha/131", classes[0]), true);
  assert.equal(isTopicOutsideSelectedClass("/trilha/invalido", classes[0]), true);
  for (const route of ["/", "/(tabs)", "/trilha", "/trilha/index", "/perfil", "/notificacoes"]) {
    assert.equal(isTopicOutsideSelectedClass(route, classes[0]), false);
  }
});
