import { describe, expect, it } from "vitest";
import { contagemDaProposta, removerDaProposta, semAtividades, substituirNaProposta, type AiTopico } from "./proposta";

const ativ = { titulo: "a", enunciado: "e", tipo: "multipla", alternativas: null, resposta_correta: "A" };
const topico = (ordem: number, extra: Partial<AiTopico> = {}): AiTopico => ({
  nome: `T${ordem}`,
  descricao: "",
  ordem,
  depende: [],
  next: [],
  conteudos: [{ titulo: "c", tipo: "texto", conteudo: "x", cards: [{ titulo: "k", descricao: "d" }], atividades: [ativ] }],
  ...extra,
});

describe("contagemDaProposta", () => {
  it("soma conteúdos, cards e atividades dos conteúdos", () => {
    expect(contagemDaProposta([topico(1), topico(2)])).toEqual({ topicos: 2, conteudos: 2, atividades: 2, cards: 2 });
  });
  it("cai nas atividades/cards do tópico quando os conteúdos não têm", () => {
    const t = topico(1, { conteudos: [{ titulo: "c", tipo: "texto", conteudo: "x" }], cards: [{ titulo: "k", descricao: "d" }], atividades: [ativ, ativ] });
    expect(contagemDaProposta([t])).toMatchObject({ atividades: 2, cards: 1 });
  });
});

describe("semAtividades", () => {
  it("zera as atividades e preserva o resto", () => {
    const r = semAtividades([topico(1, { atividades: [ativ] })]);
    expect(contagemDaProposta(r).atividades).toBe(0);
    expect(contagemDaProposta(r).cards).toBe(1);
  });
});

describe("removerDaProposta", () => {
  it("renumera e remapeia as ligações, descartando as que apontavam para o removido", () => {
    const base = [topico(1, { next: [2] }), topico(2, { next: [3], depende: [1] }), topico(3, { depende: [2, 1] })];
    const r = removerDaProposta(base, 2);
    expect(r.map((t) => t.ordem)).toEqual([1, 2]);
    expect(r[0].next).toEqual([]);
    expect(r[1].depende).toEqual([1]);
  });
});

describe("substituirNaProposta", () => {
  it("troca o conteúdo mas mantém o lugar no grafo", () => {
    const base = [topico(1, { next: [2] }), topico(2, { depende: [1] })];
    const novo = topico(9, { nome: "Novo", next: [5], depende: [7] });
    const r = substituirNaProposta(base, 2, novo);
    expect(r[1]).toMatchObject({ nome: "Novo", ordem: 2, next: [], depende: [1] });
    expect(r[0].nome).toBe("T1");
  });
});
