import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mensagemEhMinha, normalizeGuildMessages } from "./guildChatModel";

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

describe("mensagemEhMinha", () => {
  it("compara pelo uuid do autor, não pela string \"me\"", () => {
    const minha = { authorId: "11111111-1111-1111-1111-111111111111" };
    const outra = { authorId: "22222222-2222-2222-2222-222222222222" };
    assert.equal(mensagemEhMinha(minha, "11111111-1111-1111-1111-111111111111"), true);
    assert.equal(mensagemEhMinha(outra, "11111111-1111-1111-1111-111111111111"), false);
    // Sem sessão carregada, não reivindica mensagem de ninguém.
    assert.equal(mensagemEhMinha(minha, null), false);
    // E o literal antigo não vale mais nada.
    assert.equal(mensagemEhMinha({ authorId: "me" }, null), false);
    assert.equal(mensagemEhMinha({ authorId: "me" }, "me"), true, "comparação é por igualdade, sem caso especial");
  });
});

describe("normalizeShare do desafio", () => {
  const mensagem = (conteudo: Record<string, unknown>) =>
    normalizeGuildMessages([
      { id: "m1", guilda_id: "g1", autor_id: "a1", autor_nome: "Ana", tipo: "desafio",
        texto: "Um novo desafio foi lançado!", conteudo, created_at: null },
    ])[0];

  it("o id é uuid e o cartão existe", () => {
    // Era `Number(row.id)` com `isFinite && > 0`: uuid virava NaN e o share saía null, então
    // o cartão NUNCA existia e o cliente não sabia de qual desafio a mensagem falava.
    const m = mensagem({ id: "7f3a1b2c-0000-4000-8000-000000000001", quantidade: 3,
                         dificuldade: "dificil", consequencia: "ranqueada" });
    assert.ok(m.share, "o share do desafio não pode ser null");
    assert.equal(m.share!.kind, "desafio");
    assert.equal(m.share!.kind === "desafio" ? m.share!.desafioId : null,
                 "7f3a1b2c-0000-4000-8000-000000000001");
  });

  it("o título é montado do payload, que não traz título nenhum", () => {
    const m = mensagem({ id: "u-1", quantidade: 3, dificuldade: "dificil", consequencia: "ranqueada" });
    assert.equal(m.share!.title, "Desafio · 3 questões · Difícil · Ranqueada");
    const uma = mensagem({ id: "u-2", quantidade: 1, dificuldade: "normal", consequencia: "treino" });
    assert.equal(uma.share!.title, "Desafio · 1 questão · Normal · Treino");
  });

  it("payload sem os eixos ainda rende cartão — a mensagem é de antes da fase 7", () => {
    const m = mensagem({ id: "u-3" });
    assert.equal(m.share!.title, "Desafio");
    assert.equal(m.share!.kind === "desafio" ? m.share!.quantidade : "x", null);
  });

  it("sem id não há cartão — não dá para abrir desafio nenhum", () => {
    assert.equal(mensagem({ quantidade: 3 }).share, null);
  });

  it("a questão continua com id numérico e título obrigatório", () => {
    const q = normalizeGuildMessages([
      { id: "m2", guilda_id: "g1", autor_id: "a1", tipo: "questao",
        conteudo: { id: 1366, enunciado: "Quanto é 2+2?", tipo: "multipla", alternativas: ["3", "4"] },
        created_at: null },
    ])[0];
    assert.equal(q.share!.kind, "questao");
    assert.equal(q.share!.kind === "questao" ? q.share!.id : null, 1366);
    // Questão sem enunciado continua sem cartão.
    const vazia = normalizeGuildMessages([
      { id: "m3", guilda_id: "g1", autor_id: "a1", tipo: "questao", conteudo: { id: 1 }, created_at: null },
    ])[0];
    assert.equal(vazia.share, null);
  });
});
