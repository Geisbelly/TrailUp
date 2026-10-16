import { describe, expect, it } from "vitest";
import { aplicarLigacao, avaliarLigacao, removerLigacao } from "./ligacoes";
import type { Topico } from "./types";

const t = (id: number, extra: Partial<Topico> = {}): Topico => ({
  id,
  classe_id: 1,
  nome: `T${id}`,
  descricao: null,
  ordem: id,
  next: [],
  depende: [],
  created_at: null,
  ...extra,
});

describe("avaliarLigacao", () => {
  it("ligar um tópico a ele mesmo ou a um que não existe é ignorado", () => {
    expect(avaliarLigacao([t(1)], 1, 1, "next").resultado).toBe("ignorar");
    expect(avaliarLigacao([t(1)], 1, 9, "next").resultado).toBe("ignorar");
    expect(avaliarLigacao([t(1)], 9, 1, "depende").resultado).toBe("ignorar");
  });

  it("tópicos de turmas diferentes não se ligam", () => {
    const r = avaliarLigacao([t(1), t(2, { classe_id: 2 })], 1, 2, "next");
    expect(r.resultado).toBe("turmas_diferentes");
  });

  it("conflito de pré-requisito: já depende do alvo", () => {
    const r = avaliarLigacao([t(1, { depende: [2] }), t(2)], 1, 2, "depende");
    expect(r).toMatchObject({ resultado: "conflito" });
  });

  it("conflito de sequência: o alvo já tem o atual como próximo", () => {
    const r = avaliarLigacao([t(1), t(2, { next: [1] })], 1, 2, "next");
    expect(r).toMatchObject({ resultado: "conflito" });
  });

  it("sem conflito, está ok", () => {
    expect(avaliarLigacao([t(1), t(2)], 1, 2, "next").resultado).toBe("ok");
    expect(avaliarLigacao([t(1), t(2)], 1, 2, "depende").resultado).toBe("ok");
  });
});

describe("aplicarLigacao", () => {
  it("next: adiciona o alvo à sequência e tira o inverso", () => {
    const r = aplicarLigacao([t(1, { depende: [2] }), t(2, { next: [1] })], 1, 2, "next");
    expect(r[0]).toMatchObject({ next: [2], depende: [] });
    expect(r[1].next).toEqual([]);
  });

  it("depende: o alvo ganha o pré-requisito e perde o next inverso", () => {
    const r = aplicarLigacao([t(1, { next: [2] }), t(2)], 1, 2, "depende");
    expect(r[1].depende).toEqual([1]);
    expect(r[0]).toMatchObject({ next: [2], depende: [] });
  });

  it("depende de quem já depende: tira só o inverso", () => {
    const r = aplicarLigacao([t(1, { depende: [2] }), t(2)], 1, 2, "depende");
    expect(r[0].depende).toEqual([]);
    expect(r[1].depende).toEqual([1]);
  });

  it("não duplica a ligação ao aplicar duas vezes", () => {
    const uma = aplicarLigacao([t(1), t(2)], 1, 2, "next");
    const duas = aplicarLigacao(uma, 1, 2, "next");
    expect(duas[0].next).toEqual([2]);
  });

  it("não altera tópicos que não participam e não muta a entrada", () => {
    const entrada = [t(1), t(2), t(3, { next: [1] })];
    const copia = JSON.parse(JSON.stringify(entrada));
    const r = aplicarLigacao(entrada, 1, 2, "next");
    expect(r[2]).toBe(entrada[2]);
    expect(entrada).toEqual(copia);
  });
});

describe("removerLigacao", () => {
  it("next: tira o alvo da sequência do tópico de origem", () => {
    const r = removerLigacao([t(1, { next: [2, 3] }), t(2)], 1, 2, "next");
    expect(r[0].next).toEqual([3]);
  });

  it("depende: tira a origem do pré-requisito do tópico alvo", () => {
    const r = removerLigacao([t(1), t(2, { depende: [1, 3] })], 1, 2, "depende");
    expect(r[1].depende).toEqual([3]);
  });
});
