import { describe, expect, it } from "vitest";
import { limiteAposCorte, limiteDoDetalhe, TETO_DE_SAIDA, usoDeTokens } from "./limiteDeSaida";

describe("limiteDoDetalhe", () => {
  it("nunca fica nos 4096 que cortavam o detalhe do tópico", () => {
    expect(limiteDoDetalhe(1)).toBeGreaterThan(4096);
  });

  it("cresce com o número de conteúdos pedido", () => {
    const limites = [1, 2, 3, 4].map(limiteDoDetalhe);
    expect(limites).toEqual([...limites].sort((a, b) => a - b));
    expect(new Set(limites).size).toBe(4);
  });

  it("valor estranho vale como um conteúdo e nada passa do teto", () => {
    expect(limiteDoDetalhe(0)).toBe(limiteDoDetalhe(1));
    expect(limiteDoDetalhe(Number.NaN)).toBe(limiteDoDetalhe(1));
    expect(limiteDoDetalhe(1000)).toBe(TETO_DE_SAIDA);
  });
});

describe("limiteAposCorte", () => {
  it("dobra depois de um corte", () => {
    expect(limiteAposCorte(8192)).toBe(16384);
  });

  it("para no teto e, já no teto, não há próxima tentativa", () => {
    expect(limiteAposCorte(TETO_DE_SAIDA - 1)).toBe(TETO_DE_SAIDA);
    expect(limiteAposCorte(TETO_DE_SAIDA)).toBeNull();
  });

  it("o detalhe ganha ao menos uma volta maior antes de desistir", () => {
    for (const n of [1, 2, 3, 4]) expect(limiteAposCorte(limiteDoDetalhe(n))).not.toBeNull();
  });
});

describe("usoDeTokens", () => {
  it("lê o raciocínio e a resposta do usageMetadata", () => {
    const apiData = { usageMetadata: { thoughtsTokenCount: 3000, candidatesTokenCount: 1096, totalTokenCount: 6000 } };
    expect(usoDeTokens(apiData)).toEqual({ raciocinio: 3000, resposta: 1096, total: 6000 });
  });

  it("sem usageMetadata devolve campos vazios, sem lançar", () => {
    expect(usoDeTokens(null)).toEqual({ raciocinio: undefined, resposta: undefined, total: undefined });
    expect(usoDeTokens({ usageMetadata: { thoughtsTokenCount: "x" } }).raciocinio).toBeUndefined();
  });
});
