import assert from "node:assert/strict";
import test from "node:test";

import { ehContaDemonstracao } from "../constants/contasDemonstracao";
import {
  perfilVisualDoAluno,
  perfisSelecionaveisDoAluno,
  resolveRepresentativeBrainHexProfiles,
  TODOS_OS_PERFIS,
} from "./brainHex";

const perfis = [
  { nome: "seeker", afinidade: 80 },
  { nome: "achiever", afinidade: 30 },
  { nome: "mastermind", afinidade: 10 },
  { nome: "survivor", afinidade: 5 },
];

test("conta de demonstração é reconhecida sem depender da caixa nem de espaços", () => {
  assert.equal(ehContaDemonstracao("geisbelly19@gmail.com"), true);
  assert.equal(ehContaDemonstracao("  Geisbelly19@Gmail.com "), true);
  assert.equal(ehContaDemonstracao("outra@gmail.com"), false);
  assert.equal(ehContaDemonstracao(null), false);
  assert.equal(ehContaDemonstracao(""), false);
});

test("aluno comum escolhe só entre os representativos", () => {
  const aluno = { email: "aluno@escola.test", perfis, perfilAtivo: "survivor" };
  assert.deepEqual(perfisSelecionaveisDoAluno(aluno), resolveRepresentativeBrainHexProfiles(perfis));
  // Perfil fora dos representativos volta ao dominante, como sempre.
  assert.equal(perfilVisualDoAluno(aluno), "seeker");
});

test("conta de demonstração oferece os 7 perfis, representativos primeiro", () => {
  const aluno = { email: "geisbelly19@gmail.com", perfis, perfilAtivo: null };
  const selecionaveis = perfisSelecionaveisDoAluno(aluno);
  assert.equal(selecionaveis.length, 7);
  assert.deepEqual([...selecionaveis].sort(), [...TODOS_OS_PERFIS].sort());
  // O primeiro continua sendo o dominante; depois vêm os demais pela afinidade.
  assert.deepEqual(selecionaveis.slice(0, 4), ["seeker", "achiever", "mastermind", "survivor"]);
  assert.equal(perfilVisualDoAluno(aluno), "seeker");
});

test("conta de demonstração mantém o perfil escolhido mesmo sem afinidade", () => {
  for (const perfilAtivo of TODOS_OS_PERFIS) {
    assert.equal(
      perfilVisualDoAluno({ email: "geisbelly19@gmail.com", perfis, perfilAtivo }),
      perfilAtivo,
    );
  }
});

test("conta de demonstração sem nenhuma linha em aluno_perfil também vê os 7", () => {
  assert.equal(perfisSelecionaveisDoAluno({ email: "geisbelly19@gmail.com", perfis: [] }).length, 7);
});
