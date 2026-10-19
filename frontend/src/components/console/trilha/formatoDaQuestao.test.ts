import { describe, expect, it } from "vitest";
import { formatoDaQuestao } from "./formatoDaQuestao";

describe("formatoDaQuestao", () => {
  it.each([
    ["quiz", "quiz"],
    ["multipla", "quiz"],
    ["multipla_escolha", "quiz"],
    ["true_false", "true_false"],
    ["verdadeiro_falso", "true_false"],
    ["vf", "true_false"],
    ["fill_blank", "fill_blank"],
    ["lacuna", "fill_blank"],
    ["completar", "fill_blank"],
    ["essay", "essay"],
    ["dissertativa", "essay"],
    ["questao", "essay"],
    ["texto", "essay"],
  ])("%s → %s", (entrada, esperado) => {
    expect(formatoDaQuestao(entrada)).toBe(esperado);
  });

  it("ignora caixa e espaços", () => {
    expect(formatoDaQuestao("  Multipla ")).toBe("quiz");
  });

  it("vazio, nulo ou desconhecido (inclusive missao) caem em dissertação", () => {
    expect(formatoDaQuestao("")).toBe("essay");
    expect(formatoDaQuestao(null)).toBe("essay");
    expect(formatoDaQuestao(undefined)).toBe("essay");
    expect(formatoDaQuestao("missao")).toBe("essay");
  });
});
