import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeDesafio,
  placarDoAluno,
  proximaQuestao,
  tentativasIniciais,
} from "./desafioModel";

const cru = (extra: Record<string, unknown> = {}) => ({
  id: "7f3a1b2c-0000-4000-8000-000000000001",
  formato: "guilda",
  modo: "todos",
  status: "aberto",
  dificuldade: "dificil",
  consequencia: "ranqueada",
  params: { dificuldade: "dificil", tempo_seg: 30, tentativas: 1, aposta_fator: 2.0 },
  meu_estado: "aceito",
  minha_equipe: 1,
  questoes: [
    {
      ordem: 2,
      questao_id: 20,
      enunciado: "Segunda",
      tipo: "multipla",
      alternativas: ["a", "b"],
      midia_url: null,
      minha_resposta: null,
      correta: null,
      resposta_correta: null,
    },
    {
      ordem: 1,
      questao_id: 10,
      enunciado: "Primeira",
      tipo: "multipla",
      alternativas: [{ texto: "x" }, { label: "y" }, ""],
      midia_url: " https://a/b.png ",
      minha_resposta: "x",
      correta: true,
      resposta_correta: "x",
    },
  ],
  ...extra,
});

describe("normalizeDesafio", () => {
  it("ordena por ordem, não pela ordem que veio", () => {
    const d = normalizeDesafio(cru())!;
    assert.deepEqual(d.questoes.map((q) => q.questaoId), [10, 20]);
  });

  it("lê os eixos e o preset que a RPC passou a devolver em 20261021_13", () => {
    const d = normalizeDesafio(cru())!;
    assert.equal(d.dificuldade, "dificil");
    assert.equal(d.consequencia, "ranqueada");
    assert.deepEqual(d.params, { tempoSeg: 30, tentativas: 1, apostaFator: 2 });
  });

  it("alternativa como objeto, como texto e vazia", () => {
    const d = normalizeDesafio(cru())!;
    assert.deepEqual(d.questoes[0].alternativas, ["x", "y"]);
  });

  it("gabarito ausente é questão não respondida, não dado faltando", () => {
    // `arena_desafio` devolve `resposta_correta: null` enquanto não existe resposta minha.
    const d = normalizeDesafio(cru())!;
    const naoRespondida = d.questoes.find((q) => q.questaoId === 20)!;
    assert.equal(naoRespondida.respostaCorreta, null);
    assert.equal(naoRespondida.minhaResposta, null);
    assert.equal(naoRespondida.correta, null);
  });

  it("sem id não há desafio", () => {
    assert.equal(normalizeDesafio({ ...cru(), id: null }), null);
    assert.equal(normalizeDesafio(null), null);
    assert.equal(normalizeDesafio("não é objeto"), null);
  });

  it("questão sem id é descartada em vez de virar questão de id zero", () => {
    const d = normalizeDesafio(cru({ questoes: [{ ordem: 1, questao_id: null, enunciado: "?" }] }))!;
    assert.deepEqual(d.questoes, []);
  });

  it("RPC antiga, sem params: cai no mesmo padrão de fn_desafio_params_efetivos", () => {
    // Só acontece se `20261021_13` não estiver aplicada.
    const semParams = normalizeDesafio(cru({ params: undefined }))!;
    assert.deepEqual(semParams.params, { tempoSeg: 30, tentativas: 1, apostaFator: 2 });
    const normal = normalizeDesafio(cru({ params: undefined, dificuldade: "normal" }))!;
    assert.deepEqual(normal.params, { tempoSeg: 60, tentativas: 2, apostaFator: 1 });
  });

  it("status desconhecido é tratado como aberto", () => {
    assert.equal(normalizeDesafio(cru({ status: "qualquer" }))!.status, "aberto");
    assert.equal(normalizeDesafio(cru({ status: "encerrado" }))!.status, "encerrado");
  });
});

describe("proximaQuestao", () => {
  it("é a primeira sem resposta minha, na ordem", () => {
    const d = normalizeDesafio(cru())!;
    assert.equal(proximaQuestao(d)!.questaoId, 20);
  });

  it("null quando respondi todas", () => {
    const d = normalizeDesafio(cru())!;
    d.questoes[1].minhaResposta = "b";
    assert.equal(proximaQuestao(d), null);
  });
});

describe("tentativasIniciais", () => {
  it("usa o preset da dificuldade, não constante do cliente", () => {
    const d = normalizeDesafio(cru())!;
    // difícil = 1 tentativa, e a questão 20 ainda não foi respondida.
    assert.equal(tentativasIniciais(d, 20), 1);
  });

  it("zero para questão já respondida — o banco recusa a segunda no difícil", () => {
    const d = normalizeDesafio(cru())!;
    assert.equal(tentativasIniciais(d, 10), 0);
  });

  it("zero para questão que não é do desafio", () => {
    const d = normalizeDesafio(cru())!;
    assert.equal(tentativasIniciais(d, 999), 0);
  });
});

describe("placarDoAluno", () => {
  it("conta só o que eu respondi", () => {
    const d = normalizeDesafio(cru())!;
    assert.deepEqual(placarDoAluno(d), { respondidas: 1, acertos: 1, total: 2 });
  });

  it("errada conta como respondida e não como acerto", () => {
    const d = normalizeDesafio(cru())!;
    d.questoes[1].minhaResposta = "b";
    d.questoes[1].correta = false;
    assert.deepEqual(placarDoAluno(d), { respondidas: 2, acertos: 1, total: 2 });
  });
});
