import test from "node:test";
import assert from "node:assert/strict";
import { convitesPendentesEnviados, normalizeGuild, normalizeGuilds } from "./guildModel";

test("normaliza membros e convite de guilda", () => {
  const guild = normalizeGuild({ guilda_id: "g1", classe_id: 9, nome: "Aurora", membros: [{ aluno_id: "a1", nome: "Marcie" }], convites_recebidos: [{ id: "i1", guilda_id: "g1", convidante_id: "a2" }] });
  assert.equal(guild.id, "g1");
  assert.equal(guild.membros[0]?.alunoId, "a1");
  assert.equal(guild.convitesRecebidos[0]?.id, "i1");
});

test("lista ausente vira lista vazia", () => {
  assert.deepEqual(normalizeGuilds(null), []);
});

test("convite enviado guarda o created_at que vinha sendo descartado", () => {
  const guild = normalizeGuild({
    guilda_id: "g1", classe_id: 9, nome: "Aurora",
    convites_enviados: [{ id: "e1", convidado_id: "a3", status: "pending", created_at: "2026-10-20T10:00:00Z" }],
  });
  assert.equal(guild.convitesEnviados[0]?.createdAt, "2026-10-20T10:00:00Z");
  assert.equal(guild.convitesEnviados[0]?.convidadoId, "a3");
});

test("convites enviados viram linhas com nome, do mais antigo para o mais novo", () => {
  const pessoas = [
    { alunoId: "a1", nome: "Marcie Silva", apelido: "Marcie" },
    { alunoId: "a2", nome: "Joca", apelido: null },
  ];
  const linhas = convitesPendentesEnviados([
    { id: "e2", convidadoId: "a2", status: "pending", createdAt: "2026-10-20T12:00:00Z" },
    { id: "e1", convidadoId: "a1", status: "pending", createdAt: "2026-10-20T09:00:00Z" },
  ], pessoas);
  assert.deepEqual(linhas.map((l) => l.nome), ["Marcie", "Joca"]);
  assert.equal(linhas[0]?.id, "e1");
});

test("convite respondido nao aparece como pendente", () => {
  const linhas = convitesPendentesEnviados([
    { id: "e1", convidadoId: "a1", status: "accepted", createdAt: null },
    { id: "e2", convidadoId: "a1", status: "pending", createdAt: null },
  ], [{ alunoId: "a1", nome: "Marcie" }]);
  assert.deepEqual(linhas.map((l) => l.id), ["e2"]);
});

test("colega fora da lista aparece como 'Colega', nunca como uuid", () => {
  // Aluno que saiu da turma: o convite segue pendente e segue ocupando lugar na guilda, entao
  // esconder a linha deixaria o aluno sem como cancelar. Mostrar o uuid nao ajudaria ninguem.
  const linhas = convitesPendentesEnviados(
    [{ id: "e1", convidadoId: "fantasma-uuid", status: "pending", createdAt: null }],
    [{ alunoId: "a1", nome: "Marcie" }],
  );
  assert.equal(linhas[0]?.nome, "Colega");
  assert.equal(linhas.length, 1);
});

test("sem created_at a ordem fica estavel pelo id", () => {
  const linhas = convitesPendentesEnviados([
    { id: "e9", convidadoId: "a1", status: "pending", createdAt: null },
    { id: "e1", convidadoId: "a1", status: "pending", createdAt: null },
  ], [{ alunoId: "a1", nome: "Marcie" }]);
  assert.deepEqual(linhas.map((l) => l.id), ["e1", "e9"]);
});
