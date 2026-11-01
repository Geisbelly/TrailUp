import { describe, expect, it } from "vitest";
import { valorDoDesempenho } from "./desempenho";

describe("valorDoDesempenho", () => {
  it("nota de 0 a 10 sem '%', e zero é zero", () => {
    expect(valorDoDesempenho("nota_media", 7.25)).toBe("7.3");
    expect(valorDoDesempenho("nota_media", 0)).toBe("0.0");
  });

  it("sem nota é '—', não 0 nem quebra", () => {
    expect(valorDoDesempenho("nota_media", null)).toBe("—");
    expect(valorDoDesempenho("media_acertos", undefined)).toBe("—");
  });

  it("acertos e conclusão continuam em %", () => {
    expect(valorDoDesempenho("percentual_concluido", 50)).toBe("50.0%");
  });
});
