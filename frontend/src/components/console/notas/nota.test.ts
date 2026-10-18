import { describe, expect, it } from "vitest";
import { formatar, iniciais, mensagemDeImpacto, validarNota } from "./nota";

describe("validarNota", () => {
  it("aceita de 0 até o máximo, com vírgula e até duas casas", () => {
    expect(validarNota("8", 10)).toEqual({ ok: true, valor: 8, erro: null });
    expect(validarNota(" 7,5 ", 10)).toEqual({ ok: true, valor: 7.5, erro: null });
    expect(validarNota("0", 10).ok).toBe(true);
    expect(validarNota("10", 10).ok).toBe(true);
    expect(validarNota("9.25", 10).valor).toBe(9.25);
  });

  it("recusa vazio, texto, negativo, mais de duas casas e acima do máximo", () => {
    for (const t of ["", "  ", "abc", "-1", "1,234", "1e3", "1,2,3"]) expect(validarNota(t, 10).ok).toBe(false);
    expect(validarNota("10,5", 10).erro).toBe("A nota vai de 0 a 10.");
  });

  it("sem pontuação máxima não há como validar", () => {
    expect(validarNota("5", null).erro).toContain("pontuação máxima");
    expect(validarNota("5", 0).ok).toBe(false);
  });
});

describe("mensagemDeImpacto", () => {
  const l = { alunoNome: "Caio", avaliadoEm: null, pontuacaoObtida: null };

  it("primeira correção: soma pontos no desempenho do aluno", () => {
    expect(mensagemDeImpacto(l, 8)).toBe("Isso soma 8 pontos ao desempenho de Caio na turma.");
    expect(mensagemDeImpacto(l, 1)).toBe("Isso soma 1 ponto ao desempenho de Caio na turma.");
    expect(mensagemDeImpacto(l, 7.5)).toContain("7,5");
  });

  it("nova correção: avisa que troca a nota anterior, não soma de novo", () => {
    const m = mensagemDeImpacto({ ...l, avaliadoEm: "2026-10-01", pontuacaoObtida: 6 }, 9);
    expect(m).toBe("Isso troca a sua nota anterior (6) por 9 no desempenho de Caio na turma.");
  });

  it("sem nota ainda, pede para digitar", () => {
    expect(mensagemDeImpacto(l, null)).toContain("Digite a nota");
  });
});

describe("formatar e iniciais", () => {
  it("inteiro sem casas, decimal em português", () => {
    expect(formatar(10)).toBe("10");
    expect(formatar(2.5)).toBe("2,5");
  });
  it("iniciais do primeiro e do último nome", () => {
    expect(iniciais("Caio Bertoldo")).toBe("CB");
    expect(iniciais("Marina")).toBe("M");
    expect(iniciais("  ")).toBe("?");
  });
});
