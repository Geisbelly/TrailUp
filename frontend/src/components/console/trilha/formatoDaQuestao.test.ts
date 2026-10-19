import { describe, expect, it } from "vitest";
import { formatoDaQuestao, tipoDaQuestaoDoFormato } from "./formatoDaQuestao";

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

describe("tipoDaQuestaoDoFormato", () => {
  it.each([
    ["quiz", "multipla"],
    ["true_false", "verdadeiro_falso"],
    ["fill_blank", "fill_blank"],
    ["essay", "dissertativa"],
  ] as const)("%s → %s", (formato, esperado) => {
    expect(tipoDaQuestaoDoFormato(formato)).toBe(esperado);
  });

  it("o par de funções leva tipo cru da IA ao vocabulário de cada coluna", () => {
    // Esta é a correção: o `GenerateTrailDialog` gravava o literal cru nas DUAS colunas.
    // `notas_fila()` compara `atividades.tipo = 'essay'` em SQL puro, sem normalizador,
    // então "dissertativa" saía da fila de correção do professor sem erro nenhum.
    const formato = formatoDaQuestao("dissertativa");
    expect(formato).toBe("essay");
    expect(tipoDaQuestaoDoFormato(formato)).toBe("dissertativa");
  });
});
