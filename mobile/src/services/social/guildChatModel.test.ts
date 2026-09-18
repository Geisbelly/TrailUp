import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeGuildMessages } from "./guildChatModel";

describe("modelo do chat da guilda", () => {
  it("normaliza texto e compartilhamentos de desafios e questões", () => {
    const messages = normalizeGuildMessages([
      { id: "m1", guilda_id: "g1", autor_id: "a1", autor_nome: "Domi", tipo: "text", texto: "Bora?", conteudo: {}, created_at: "2026-09-13T10:00:00Z" },
      { id: "m2", guilda_id: "g1", autor_id: "a2", autor_nome: "Lia", tipo: "desafio", texto: null, conteudo: { id: 7, titulo: "Desafio solar" }, created_at: "2026-09-13T10:01:00Z" },
      { id: "m3", guilda_id: "g1", autor_id: "a3", autor_nome: "Noa", tipo: "questao", texto: null, conteudo: { id: 8, titulo: "Questão da bússola" }, created_at: "2026-09-13T10:02:00Z" },
    ]);

    assert.equal(messages.length, 3);
    assert.equal(messages[1].share?.kind, "desafio");
    assert.equal(messages[2].share?.title, "Questão da bússola");
  });

  it("rejeita compartilhamento sem referência válida", () => {
    const messages = normalizeGuildMessages([{ id: "m1", guilda_id: "g1", autor_id: "a1", tipo: "desafio", conteudo: {} }]);
    assert.equal(messages[0].share, null);
  });
});
