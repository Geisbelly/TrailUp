import { describe, expect, it } from "vitest";

import {
  listaSalva,
  motivoDaRecusa,
  paresSalvos,
  payloadDeAssociacao,
  payloadDeMultiplaResposta,
  payloadDeOrdenacao,
} from "./questaoDeRelacao";

describe("associacao", () => {
  it("manda as duas listas SOLTAS e o pareamento so no gabarito", () => {
    const payload = payloadDeAssociacao([
      { termo: "Stub", definicao: "Lado do cliente" },
      { termo: "Skeleton", definicao: "Lado do servidor" },
    ]);

    expect(payload).not.toBeNull();
    expect(payload!.alternativas).toEqual({
      termos: ["Stub", "Skeleton"],
      definicoes: ["Lado do cliente", "Lado do servidor"],
    });
    // Nada em `alternativas` liga um ao outro -- e esse e o ponto: guardar
    // pares ali entregaria a resposta ao aluno.
    expect(JSON.stringify(payload!.alternativas)).not.toContain("=>");
    expect(JSON.parse(payload!.respostaCorreta)).toEqual([
      ["Stub", "Lado do cliente"],
      ["Skeleton", "Lado do servidor"],
    ]);
  });

  it("recusa par incompleto, unico e repetido", () => {
    expect(payloadDeAssociacao([{ termo: "Stub", definicao: "" }])).toBeNull();
    expect(payloadDeAssociacao([{ termo: "Stub", definicao: "Cliente" }])).toBeNull();
    // Termo repetido quebra a relacao 1:1: duas linhas competem pela mesma
    // ligacao e o aluno nao tem como acertar.
    expect(
      payloadDeAssociacao([
        { termo: "Stub", definicao: "Cliente" },
        { termo: "stub", definicao: "Servidor" },
      ])
    ).toBeNull();
    expect(
      payloadDeAssociacao([
        { termo: "Stub", definicao: "Cliente" },
        { termo: "Skeleton", definicao: "cliente" },
      ])
    ).toBeNull();
  });
});

describe("ordenacao", () => {
  it("grava os itens e a sequencia a partir da mesma lista", () => {
    const payload = payloadDeOrdenacao(["Primeiro", "Segundo", "Terceiro"]);
    expect(payload!.alternativas).toEqual(["Primeiro", "Segundo", "Terceiro"]);
    expect(JSON.parse(payload!.respostaCorreta)).toEqual([
      "Primeiro",
      "Segundo",
      "Terceiro",
    ]);
  });

  it("recusa lista curta ou com item repetido", () => {
    expect(payloadDeOrdenacao(["So um"])).toBeNull();
    // Item repetido torna a sequencia ambigua: as duas ordens sao "certas".
    expect(payloadDeOrdenacao(["A", "a", "B"])).toBeNull();
  });
});

describe("multipla resposta", () => {
  it("separa opcoes de gabarito", () => {
    const payload = payloadDeMultiplaResposta([
      { texto: "Filas", correta: true },
      { texto: "RPC sincrono", correta: false },
      { texto: "Pub/Sub", correta: true },
      { texto: "Socket bloqueante", correta: false },
    ]);
    expect(payload!.alternativas).toEqual([
      "Filas",
      "RPC sincrono",
      "Pub/Sub",
      "Socket bloqueante",
    ]);
    expect(JSON.parse(payload!.respostaCorreta)).toEqual(["Filas", "Pub/Sub"]);
  });

  it("recusa uma so certa e recusa todas certas", () => {
    // Uma certa e' multipla escolha comum, e o formato induz o aluno a marcar
    // mais de uma.
    expect(
      payloadDeMultiplaResposta([
        { texto: "A", correta: true },
        { texto: "B", correta: false },
        { texto: "C", correta: false },
      ])
    ).toBeNull();
    // Todas certas nao separa quem sabe de quem marca tudo.
    expect(
      payloadDeMultiplaResposta([
        { texto: "A", correta: true },
        { texto: "B", correta: true },
        { texto: "C", correta: true },
      ])
    ).toBeNull();
  });

  it("recusa menos de tres alternativas", () => {
    expect(
      payloadDeMultiplaResposta([
        { texto: "A", correta: true },
        { texto: "B", correta: true },
      ])
    ).toBeNull();
  });
});

describe("reabrir no editor", () => {
  it("os pares vem do GABARITO, nunca de alternativas", () => {
    const pares = paresSalvos(
      // `alternativas` chega embaralhada e sem vinculo nenhum.
      { termos: ["Skeleton", "Stub"], definicoes: ["Cliente", "Servidor"] },
      '[["Stub","Cliente"],["Skeleton","Servidor"]]'
    );
    expect(pares).toEqual([
      { termo: "Stub", definicao: "Cliente" },
      { termo: "Skeleton", definicao: "Servidor" },
    ]);
  });

  it("gabarito nao-JSON nao explode o editor", () => {
    expect(paresSalvos(null, "texto solto")).toEqual([]);
    expect(paresSalvos(null, null)).toEqual([]);
  });

  it("lista aceita JSON e a reserva por barra", () => {
    expect(listaSalva('["a","b"]')).toEqual(["a", "b"]);
    expect(listaSalva("a|b")).toEqual(["a", "b"]);
    expect(listaSalva(null)).toEqual([]);
  });
});

describe("mensagens", () => {
  it("cada formato explica o proprio minimo", () => {
    expect(motivoDaRecusa("associacao")).toContain("2 pares");
    expect(motivoDaRecusa("ordenacao")).toContain("2 etapas");
    expect(motivoDaRecusa("multipla_resposta")).toContain("3 alternativas");
  });
});
