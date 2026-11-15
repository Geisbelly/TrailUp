import { describe, expect, it } from "vitest";
import {
  MAX_CHARS_POR_EXISTENTE,
  MAX_EXISTENTES,
  blocoDosExistentes,
  criarFiltroDeRepetidas,
  existentesDoPedido,
  parecidos,
  textosExistentes,
} from "./repetidas";

describe("parecidos", () => {
  it("iguala caixa, acento e pontuação", () => {
    expect(parecidos("O que é Normalização?", "o que e normalizacao")).toBe(true);
  });

  it("pega a mesma pergunta com uma palavra a mais", () => {
    expect(parecidos("O que é normalização de dados?", "O que é a normalização dos dados?")).toBe(true);
  });

  it("deixa passar pergunta diferente sobre o mesmo conceito", () => {
    expect(
      parecidos("Qual a diferença entre INNER JOIN e LEFT JOIN?", "Qual a diferença entre LEFT JOIN e RIGHT JOIN?"),
    ).toBe(false);
    expect(parecidos("Qual a função do comando SELECT?", "Qual a função do comando DELETE?")).toBe(false);
  });

  it("pergunta curta só repete se for igual", () => {
    expect(parecidos("Defina SQL", "Defina SQL.")).toBe(true);
    expect(parecidos("Defina SQL", "Defina DDL")).toBe(false);
  });

  it("texto vazio nunca repete", () => {
    expect(parecidos("", "")).toBe(false);
    expect(parecidos("?!", "Qual?")).toBe(false);
  });
});

describe("textosExistentes", () => {
  it("aceita só lista de texto, sem vazio nem repetido", () => {
    expect(textosExistentes(["  Qual  é  a chave? ", "qual e a chave", 3, null, "", "Outra?"])).toEqual([
      "Qual é a chave?",
      "Outra?",
    ]);
    expect(textosExistentes("Qual?")).toEqual([]);
    expect(textosExistentes(undefined)).toEqual([]);
  });

  it("tem teto de itens e de tamanho", () => {
    const muitos = Array.from({ length: MAX_EXISTENTES + 20 }, (_, i) => `Pergunta número ${i}`);
    expect(textosExistentes(muitos)).toHaveLength(MAX_EXISTENTES);
    expect(textosExistentes(["a".repeat(1000)])[0]).toHaveLength(MAX_CHARS_POR_EXISTENTE);
  });

  it("existentesDoPedido tolera corpo sem o campo", () => {
    expect(existentesDoPedido(undefined)).toEqual({ questoes: [], cards: [] });
    expect(existentesDoPedido({ questoes: ["Q?"], cards: "x" })).toEqual({ questoes: ["Q?"], cards: [] });
  });
});

describe("criarFiltroDeRepetidas", () => {
  it("barra o que já existe e o que a geração repetiu", () => {
    const filtro = criarFiltroDeRepetidas(["O que é normalização de dados?"]);
    expect(filtro.aceitar("O que é a normalização dos dados?")).toBe(false);
    expect(filtro.aceitar("Para que serve a chave estrangeira?")).toBe(true);
    expect(filtro.aceitar("Para que serve a chave estrangeira")).toBe(false);
    expect(filtro.aceitar("   ")).toBe(false);
  });

  it("repetida não registra", () => {
    const filtro = criarFiltroDeRepetidas([]);
    expect(filtro.repetida("Qual?")).toBe(false);
    expect(filtro.repetida("Qual?")).toBe(false);
    filtro.registrar("Qual?");
    expect(filtro.repetida("qual")).toBe(true);
  });
});

describe("blocoDosExistentes", () => {
  it("é vazio sem nada", () => {
    expect(blocoDosExistentes({ questoes: [], cards: [] })).toBe("");
  });

  it("lista questões e cards", () => {
    const bloco = blocoDosExistentes({ questoes: ["Q1?"], cards: ["C1?"] });
    expect(bloco).toContain("Nao as repita");
    expect(bloco).toContain("Questoes que ja existem:\n- Q1?");
    expect(bloco).toContain("Cards que ja existem (pergunta):\n- C1?");
  });
});
