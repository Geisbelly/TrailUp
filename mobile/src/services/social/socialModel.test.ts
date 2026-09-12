import assert from "node:assert/strict";
import test from "node:test";
import { groupSocialRows } from "./socialModel";

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

