import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGuild, normalizeGuilds, temVaga } from "./guildModel";

test("normaliza membros e convite de guilda", () => {
  const guild = normalizeGuild({ guilda_id: "g1", classe_id: 9, nome: "Aurora", membros: [{ aluno_id: "a1", nome: "Marcie" }], convites_recebidos: [{ id: "i1", guilda_id: "g1", convidante_id: "a2" }] });
  assert.equal(guild.id, "g1");
  assert.equal(guild.membros[0]?.alunoId, "a1");
  assert.equal(guild.convitesRecebidos[0]?.id, "i1");
});

test("lista ausente vira lista vazia", () => {
  assert.deepEqual(normalizeGuilds(null), []);
});

test("os quatro campos que `guilda_listar` devolve nao sao mais descartados", () => {
  // A RPC devolve `logo_url`, `modo_perfil`, `perfil_alvo` e
  // `convites_enviados` desde que ganhou o formulario de configuracao, e
  // `normalizeGuild` ignorava os quatro -- entao a guilda travada num perfil
  // BrainHex aparecia como mista, o logo nunca desenhava, e o criador nao via
  // quem ja tinha convidado (deixando `guilda_cancelar_convite` sem chamador).
  const guild = normalizeGuild({
    guilda_id: "g1", classe_id: 32, nome: "Aurora",
    logo_url: "https://exemplo/logo.png", modo_perfil: "perfil", perfil_alvo: "achiever",
    convites_enviados: [{ id: "c1", convidado_id: "a9", status: "pending" }],
  });
  assert.equal(guild.logoUrl, "https://exemplo/logo.png");
  assert.equal(guild.modoPerfil, "perfil");
  assert.equal(guild.perfilAlvo, "achiever");
  assert.equal(guild.convitesEnviados[0]?.convidadoId, "a9");
});

test("guilda mista nao carrega perfil alvo mesmo se a coluna vier preenchida", () => {
  // O CHECK do banco so exige `perfil_alvo` quando o modo e `perfil`; uma
  // guilda que trocou de modo pode ter deixado a coluna velha para tras, e
  // mostrar "so para Seekers" numa guilda mista e mentira na tela.
  const guild = normalizeGuild({ guilda_id: "g1", modo_perfil: "misto", perfil_alvo: "seeker" });
  assert.equal(guild.perfilAlvo, null);
});

test("o limite padrao e 10, que e o que a tela anuncia e o banco permite", () => {
  // Era 4. `guilda_criar` grava LEAST(config, 10) e o CHECK da coluna e
  // BETWEEN 2 AND 10 -- um default de 4 escondia 6 vagas e o botao de entrar.
  const guild = normalizeGuild({ guilda_id: "g1", membros_ativos: 6 });
  assert.equal(guild.limiteMembros, 10);
  assert.equal(temVaga(guild), true);
});

test("guilda cheia nao tem vaga", () => {
  assert.equal(temVaga(normalizeGuild({ guilda_id: "g1", limite_membros: 4, membros_ativos: 4 })), false);
});

test("convite enviado sem id ou sem convidado e descartado", () => {
  const guild = normalizeGuild({
    guilda_id: "g1",
    convites_enviados: [{ id: "c1" }, { convidado_id: "a9" }, null, { id: "c2", convidado_id: "a1" }],
  });
  assert.deepEqual(guild.convitesEnviados.map((c) => c.id), ["c2"]);
});
