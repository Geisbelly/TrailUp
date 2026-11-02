import assert from "node:assert/strict";
import test from "node:test";
import { groupSocialRows, peopleForSocialSection, pessoaDaConversa } from "./socialModel";

test("agrupa amigos, convites e candidatos", () => {
  const result = groupSocialRows([
    { aluno_id: "1", nome: "A", status: "friend", relationship_id: "r1" },
    { aluno_id: "2", nome: "B", status: "incoming", relationship_id: "r2" },
    { aluno_id: "3", nome: "C", status: "outgoing", relationship_id: "r3" },
    { aluno_id: "4", nome: "D", status: "candidate", relationship_id: null },
  ]);
  assert.equal(result.friends.length, 1);
  assert.equal(result.incoming.length, 1);
  assert.equal(result.outgoing.length, 1);
  assert.equal(result.candidates.length, 1);
});

test("mantém bloqueados na seção própria para permitir desbloqueio", () => {
  const result = groupSocialRows([
    { aluno_id: "9", nome: "Bloqueado", status: "blocked", relationship_id: "r9" },
  ]);

  assert.deepEqual(peopleForSocialSection(result, "blocked"), result.blocked);
});

test("acha o colega da conversa do push em qualquer lista, menos a dos bloqueados", () => {
  const snapshot = groupSocialRows([
    { aluno_id: "1", nome: "A", status: "friend", relationship_id: "r1" },
    { aluno_id: "4", nome: "D", status: "candidate", relationship_id: null },
    { aluno_id: "5", nome: "E", status: "blocked", relationship_id: "r5" },
  ]);
  assert.equal(pessoaDaConversa(snapshot, "1")?.nome, "A");
  assert.equal(pessoaDaConversa(snapshot, "4")?.nome, "D");
  assert.equal(pessoaDaConversa(snapshot, "5"), null);
  assert.equal(pessoaDaConversa(snapshot, "9"), null);
});
