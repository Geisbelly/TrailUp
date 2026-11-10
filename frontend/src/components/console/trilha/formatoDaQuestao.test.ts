import { describe, expect, it } from "vitest";
import { ehFormatoNoServidor, formatoDaQuestao, tipoDaQuestaoDoFormato } from "./formatoDaQuestao";

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
    ["code", "code"],
    ["codigo", "code"],
    ["numeric", "numeric"],
    ["numerica", "numeric"],
    ["expression", "expression"],
    ["expressao", "expression"],
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
    ["code", "codigo"],
    ["numeric", "numerica"],
    ["expression", "expressao"],
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

describe("tipos corrigidos no servidor (spec B)", () => {
  it("ida e volta: atividades.tipo → questoes.tipo → atividades.tipo", () => {
    for (const formato of ["code", "numeric", "expression"] as const) {
      expect(formatoDaQuestao(tipoDaQuestaoDoFormato(formato))).toBe(formato);
    }
  });

  it("só os três novos têm o gabarito fora de questoes", () => {
    expect(["quiz", "true_false", "fill_blank", "essay", "code", "numeric", "expression"].filter(ehFormatoNoServidor)).toEqual([
      "code",
      "numeric",
      "expression",
    ]);
  });

  it("apelido parecido não vira tipo novo: o padrão continua dissertação", () => {
    expect(formatoDaQuestao("código")).toBe("essay");
    expect(formatoDaQuestao("numero")).toBe("essay");
  });
});
