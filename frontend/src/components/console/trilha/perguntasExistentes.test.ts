import { describe, expect, it } from "vitest";


import type { AiTopico } from "./proposta";
import {
  existentesParaOPedido,
  juntarExistentes,
  perguntasDaProposta,
  semRepetidasNoTopico,
} from "./perguntasExistentes";

const topico = (ordem: number, perguntas: Array<{ card: string; questao: string }>): AiTopico => {
  const conteudos = perguntas.map((p, i) => ({
    ref: `content:${i + 1}`,
    titulo: `Conteúdo ${i + 1}`,
    tipo: "texto",
    conteudo: "texto",
    cards: [{ titulo: p.card, descricao: "r", conteudo_ref: `content:${i + 1}` }],
    atividades: [
      { titulo: "A", enunciado: p.questao, tipo: "quiz", alternativas: null, resposta_correta: "x", conteudo_ref: `content:${i + 1}` },
    ],
  }));
  return {
    nome: `T${ordem}`,
    descricao: "",
    ordem,
    depende: [],
    next: [],
    conteudos,
    cards: conteudos.flatMap((c) => c.cards),
    atividades: conteudos.flatMap((c) => c.atividades),
  };
};

describe("juntarExistentes", () => {
  it("junta, tira texto rico, vazio e repetida", () => {
    expect(
      juntarExistentes(
        { questoes: ["<p>O que é <b>SQL</b>?</p>", "o que e sql"], cards: [""] },
        null,
        { cards: ["Para que serve o **JOIN**?"] },
      ),
    ).toEqual({ questoes: ["O que é SQL ?"], cards: ["Para que serve o JOIN ?"] });
  });

  it("não manda o campo quando não há nada", () => {
    expect(existentesParaOPedido({ questoes: [], cards: [] })).toEqual({});
    expect(existentesParaOPedido({ questoes: ["Q?"], cards: [] })).toEqual({ existentes: { questoes: ["Q?"], cards: [] } });
  });
});

describe("perguntasDaProposta", () => {
  it("pega as dos outros tópicos, não as do próprio", () => {
    const proposta = [
      topico(1, [{ card: "O que é uma tabela?", questao: "Defina tabela relacional." }]),
      topico(2, [{ card: "O que é um índice?", questao: "Para que serve um índice?" }]),
    ];
    expect(perguntasDaProposta(proposta, 1)).toEqual({
      questoes: ["Defina tabela relacional."],
      cards: ["O que é uma tabela?"],
    });
  });

  it("tópico só do esqueleto não conta", () => {
    expect(perguntasDaProposta([{ ...topico(1, []), conteudos: [] }], 5)).toEqual({ questoes: [], cards: [] });
  });
});

describe("semRepetidasNoTopico", () => {
  it("tira a pergunta que repete outro tópico, nos conteúdos e nas listas do tópico", () => {
    const novo = topico(2, [
      { card: "O que é uma tabela?", questao: "Para que serve um índice?" },
      { card: "O que é chave estrangeira?", questao: "Defina tabela relacional" },
    ]);
    // O conteúdo 1 tem um card repetido e outro conteúdo no tópico; o 2 tem uma questão repetida.
    novo.conteudos[0].cards!.push({ titulo: "Quando criar um índice?", descricao: "r", conteudo_ref: "content:1" });
    novo.cards = novo.conteudos.flatMap((c) => c.cards ?? []);
    novo.conteudos[1].atividades!.push({
      titulo: "B",
      enunciado: "Qual a diferença entre chave primária e estrangeira?",
      tipo: "quiz",
      alternativas: null,
      resposta_correta: "x",
      conteudo_ref: "content:2",
    });
    novo.atividades = novo.conteudos.flatMap((c) => c.atividades ?? []);

    const limpo = semRepetidasNoTopico(novo, { questoes: ["Defina tabela relacional."], cards: ["O que é uma tabela?"] });
    expect(limpo.conteudos[0].cards!.map((c) => c.titulo)).toEqual(["Quando criar um índice?"]);
    expect(limpo.conteudos[1].atividades!.map((a) => a.enunciado)).toEqual([
      "Qual a diferença entre chave primária e estrangeira?",
    ]);
    expect(limpo.cards!.map((c) => c.titulo)).toEqual(["Quando criar um índice?", "O que é chave estrangeira?"]);
    expect(limpo.atividades!.map((a) => a.enunciado)).toEqual([
      "Para que serve um índice?",
      "Qual a diferença entre chave primária e estrangeira?",
    ]);
  });

  it("conteúdo cuja única pergunta repete fica sem ela, mas continua na proposta", () => {
    const novo = topico(2, [{ card: "O que é uma tabela?", questao: "Defina tabela relacional" }]);
    const limpo = semRepetidasNoTopico(novo, { questoes: ["Defina tabela relacional."], cards: ["O que é uma tabela?"] });
    expect(limpo.conteudos).toHaveLength(1);
    expect(limpo.conteudos[0].conteudo).toBe("texto");
    expect(limpo.conteudos[0].cards).toEqual([]);
    expect(limpo.conteudos[0].atividades).toEqual([]);
    expect(limpo.cards).toEqual([]);
    expect(limpo.atividades).toEqual([]);
  });

  it("repete dentro do próprio tópico também sai", () => {
    const novo = topico(2, [
      { card: "O que é normalização de dados?", questao: "Q1 sobre formas normais?" },
      { card: "O que é a normalização dos dados?", questao: "Q2 sobre dependências funcionais?" },
    ]);
    novo.conteudos[1].cards!.push({ titulo: "O que é 1FN?", descricao: "r", conteudo_ref: "content:2" });
    const limpo = semRepetidasNoTopico(novo, { questoes: [], cards: [] });
    expect(limpo.conteudos[1].cards!.map((c) => c.titulo)).toEqual(["O que é 1FN?"]);
  });
});
