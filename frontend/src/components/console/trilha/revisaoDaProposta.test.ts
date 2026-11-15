import { describe, expect, it } from "vitest";
import type { AiTopico } from "./proposta";
import { conteudosParaRevisao, ehAlternativaCorreta, nomeDoTipoDaAtividade, textoParaRevisao } from "./revisaoDaProposta";

const card = (titulo: string, conteudo_ref?: string) => ({ titulo, descricao: `sobre ${titulo}`, conteudo_ref });
const atividade = (enunciado: string, conteudo_ref?: string) => ({
  titulo: enunciado,
  enunciado,
  tipo: "quiz",
  alternativas: ["a", "b"],
  resposta_correta: "a",
  conteudo_ref,
});

const topico = (parcial: Partial<AiTopico>): AiTopico => ({
  nome: "T",
  descricao: "",
  ordem: 1,
  depende: [],
  next: [],
  conteudos: [],
  ...parcial,
});

describe("conteudosParaRevisao", () => {
  it("põe card e atividade no conteúdo do conteudo_ref, como a aplicação grava", () => {
    const t = topico({
      conteudos: [
        { ref: "content:1", titulo: "Um", tipo: "texto", conteudo: "# Um", cards: [card("c1"), card("vai pro 2", "content:2")], atividades: [atividade("q1")] },
        { ref: "content:2", titulo: "Dois", tipo: "texto", conteudo: "Dois", atividades: [atividade("vai pro 1", "content:1")] },
      ],
    });
    const [um, dois] = conteudosParaRevisao(t);
    expect(um.cards.map((c) => c.titulo)).toEqual(["c1"]);
    expect(dois.cards.map((c) => c.titulo)).toEqual(["vai pro 2"]);
    expect(um.atividades.map((a) => a.enunciado)).toEqual(["q1", "vai pro 1"]);
    expect(dois.atividades).toEqual([]);
  });

  it("ref sem conteúdo cai no conteúdo de onde veio", () => {
    const t = topico({ conteudos: [{ ref: "content:1", titulo: "Um", tipo: "texto", conteudo: "", cards: [card("x", "content:9")] }] });
    expect(conteudosParaRevisao(t)[0].cards.map((c) => c.titulo)).toEqual(["x"]);
  });

  it("listas do tópico só valem quando nenhum conteúdo trouxe a sua", () => {
    const semNada = topico({
      conteudos: [
        { titulo: "Um", tipo: "texto", conteudo: "" },
        { titulo: "Dois", tipo: "texto", conteudo: "" },
      ],
      cards: [card("do tópico")],
      atividades: [atividade("do tópico, no 2", "content:2")],
    });
    const [um, dois] = conteudosParaRevisao(semNada);
    expect(um.cards.map((c) => c.titulo)).toEqual(["do tópico"]);
    expect(dois.atividades.map((a) => a.enunciado)).toEqual(["do tópico, no 2"]);

    const comCard = topico({ conteudos: [{ titulo: "Um", tipo: "texto", conteudo: "", cards: [card("dele")] }], cards: [card("do tópico")] });
    expect(conteudosParaRevisao(comCard)[0].cards.map((c) => c.titulo)).toEqual(["dele"]);
  });

  it("tópico sem conteúdo não tem o que revisar", () => {
    expect(conteudosParaRevisao(topico({ cards: [card("solto")] }))).toEqual([]);
  });
});

describe("textoParaRevisao", () => {
  it("troca o marcador de figura por uma indicação legível", () => {
    expect(textoParaRevisao("Antes\n{{figura:A1#p3|Diagrama ER}}\nDepois {{figura:A2#i1}}")).toBe(
      "Antes\n*(Figura do material: Diagrama ER)*\nDepois *(Figura do material)*",
    );
  });
});

describe("atividades", () => {
  it("nome do tipo como vai ser gravado", () => {
    expect(nomeDoTipoDaAtividade("quiz")).toBe("Múltipla escolha");
    expect(nomeDoTipoDaAtividade("dissertativa")).toBe("Dissertativa");
  });

  it("alternativa certa sem caixa nem espaço", () => {
    expect(ehAlternativaCorreta(" 3FN ", "3fn")).toBe(true);
    expect(ehAlternativaCorreta("2FN", "3FN")).toBe(false);
    expect(ehAlternativaCorreta("x", "")).toBe(false);
  });
});
