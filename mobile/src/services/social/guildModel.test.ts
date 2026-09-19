import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGuild, normalizeGuilds } from "./guildModel";

test("normaliza membros e convite de guilda", () => {
  const guild = normalizeGuild({ guilda_id: "g1", classe_id: 9, nome: "Aurora", membros: [{ aluno_id: "a1", nome: "Marcie" }], convites_recebidos: [{ id: "i1", guilda_id: "g1", convidante_id: "a2" }] });
  assert.equal(guild.id, "g1");
  assert.equal(guild.membros[0]?.alunoId, "a1");
  assert.equal(guild.convitesRecebidos[0]?.id, "i1");
});

test("lista ausente vira lista vazia", () => {
  assert.deepEqual(normalizeGuilds(null), []);
});
