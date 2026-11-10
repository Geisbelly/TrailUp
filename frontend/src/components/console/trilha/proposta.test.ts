import { describe, expect, it } from "vitest";
import { contagemDaProposta, conteudoDaMidia, removerDaProposta, semAtividades, substituirNaProposta, type AiTopico } from "./proposta";

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

describe("conteudoDaMidia", () => {
  const midia = (extra: Partial<Parameters<typeof conteudoDaMidia>[0]> = {}) => ({
    tipo: "pdf" as const,
    titulo: "Resumo",
    descricao: "Discutir arquiteturas primário-secundário e estratégias de alta disponibilidade.",
    ...extra,
  });

  it("só texto vira conteúdo de texto, nunca arquivo com a frase no lugar do caminho", () => {
    const r = conteudoDaMidia(midia({ roteiro: "1. Abrir com uma pergunta" }), null);
    expect(r?.tipo).toBe("texto");
    expect(r?.conteudo).toBe(
      "**PDF sugerido**\n\nDiscutir arquiteturas primário-secundário e estratégias de alta disponibilidade.\n\n### Roteiro\n\n1. Abrir com uma pergunta",
    );
  });

  it("arquivo enviado pelo professor fica como arquivo, com o caminho", () => {
    expect(conteudoDaMidia(midia(), "uuid/classes/1/materials/1_a.pdf")).toEqual({
      tipo: "arquivo",
      conteudo: "uuid/classes/1/materials/1_a.pdf",
    });
  });

  it("link de verdade vira vídeo ou link; URL que não é link vira texto", () => {
    expect(conteudoDaMidia(midia({ tipo: "video", url: "https://youtu.be/abcdefghijk" }), null)).toEqual({
      tipo: "video",
      conteudo: "https://youtu.be/abcdefghijk",
    });
    expect(conteudoDaMidia(midia({ url: "https://exemplo.invalid/a.pdf" }), null)?.tipo).toBe("link");
    expect(conteudoDaMidia(midia({ descricao: "", url: "aula.pdf" }), null)).toEqual({
      tipo: "texto",
      conteudo: "**PDF sugerido**\n\naula.pdf",
    });
  });

  it("sem nada para mostrar, não grava; roteiro igual à descrição não repete", () => {
    expect(conteudoDaMidia(midia({ descricao: "  " }), null)).toBeNull();
    const r = conteudoDaMidia(midia({ tipo: "audio", descricao: "x", roteiro: "x" }), null);
    expect(r?.conteudo).toBe("**Áudio sugerido**\n\nx");
  });
});
