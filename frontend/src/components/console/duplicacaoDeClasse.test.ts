import { describe, expect, it } from "vitest";

import { lerReferencias, remapearReferencias } from "./duplicacaoDeClasse";

describe("lerReferencias", () => {
  it("aceita o array que a coluna json entrega", () => {
    expect(lerReferencias([3, 4])).toEqual([3, 4]);
  });

  it("aceita dado antigo gravado como string JSON", () => {
    expect(lerReferencias("[3,4]")).toEqual([3, 4]);
  });

  it("string invalida vira lista vazia em vez de derrubar a duplicacao", () => {
    // `JSON.parse` solto aqui estourava e caia no catch generico, abortando a
    // copia inteira por causa de uma aresta malformada.
    expect(lerReferencias("{nao e json")).toEqual([]);
  });

  it("nulo, vazio e valor de outro tipo viram lista vazia", () => {
    expect(lerReferencias(null)).toEqual([]);
    expect(lerReferencias(undefined)).toEqual([]);
    expect(lerReferencias("")).toEqual([]);
    expect(lerReferencias("   ")).toEqual([]);
    expect(lerReferencias(42)).toEqual([]);
    expect(lerReferencias({ a: 1 })).toEqual([]);
  });

  it("numero em texto e aceito, lixo e descartado", () => {
    expect(lerReferencias(["7", "oito", 9])).toEqual([7, 9]);
  });
});

describe("remapearReferencias", () => {
  it("traduz para os ids da turma nova", () => {
    expect(remapearReferencias([1, 2], { 1: 10, 2: 20 })).toEqual([10, 20]);
  });

  it("DESCARTA id que nao esta no mapa, em vez de manter o antigo", () => {
    // O bug: `mapa[n] || n` mantinha o 99 e a trilha copiada passava a
    // apontar para um topico da turma ORIGINAL.
    expect(remapearReferencias([1, 99], { 1: 10 })).toEqual([10]);
  });

  it("preserva a ordem declarada", () => {
    expect(remapearReferencias([3, 1, 2], { 1: 10, 2: 20, 3: 30 })).toEqual([30, 10, 20]);
  });

  it("nao repete destino", () => {
    expect(remapearReferencias([1, 1, 2], { 1: 10, 2: 20 })).toEqual([10, 20]);
  });

  it("mapa vazio zera as arestas", () => {
    expect(remapearReferencias([1, 2], {})).toEqual([]);
  });

  it("id 0 no mapa e respeitado (nao e tratado como ausente)", () => {
    // `mapa[n] || n` tambem errava aqui: destino 0 e' falsy.
    expect(remapearReferencias([1], { 1: 0 })).toEqual([0]);
  });
});
