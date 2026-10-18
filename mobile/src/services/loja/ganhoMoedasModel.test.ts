import assert from "node:assert/strict";
import test from "node:test";

import { resolverGanhoMoedas } from "./ganhoMoedasModel";

const GLOBAIS = [
  { tipo: "conteudo_concluido", moedas: 2 },
  { tipo: "atividade_concluida", moedas: "3" },
  { tipo: "atividade_acertada", moedas: 1 },
  { tipo: "atividade_revisada", moedas: 0 },
];

test("sem sobreposição, vale o global (numeric chega como texto)", () => {
  assert.deepEqual(resolverGanhoMoedas(GLOBAIS, []).map((g) => g.moedas), [2, 3, 1, 0]);
});

test("a turma sobrepõe; NULL na turma herda o global", () => {
  const turma = [
    { tipo: "conteudo_concluido", moedas: 5 },
    { tipo: "atividade_concluida", moedas: null },
  ];
  assert.deepEqual(resolverGanhoMoedas(GLOBAIS, turma).map((g) => g.moedas), [5, 3, 1, 0]);
});

test("ação sem linha em lugar nenhum rende zero, na ordem da tela", () => {
  const r = resolverGanhoMoedas([], []);
  assert.deepEqual(r.map((g) => g.rotulo), ["Concluir um conteúdo", "Concluir uma atividade", "Acertar uma atividade", "Revisar uma atividade"]);
  assert.ok(r.every((g) => g.moedas === 0));
});
