import { describe, expect, it } from "vitest";
import { AMOSTRA_MINIMA, formatarMs, lerSaudeDosClientes, lerVital } from "./saudeDosClientes";

describe("lerSaudeDosClientes", () => {
  it("recusa o que não é objeto", () => {
    expect(lerSaudeDosClientes(null)).toBeNull();
    expect(lerSaudeDosClientes([])).toBeNull();
  });

  it("não inventa número onde o banco devolveu nulo", () => {
    const lido = lerSaudeDosClientes({ superficies: [{ superficie: "app", inicio_p75_ms: null, vitais: [{ formato: "celular", lcp_p75_ms: null }] }] });
    expect(lido?.superficies[0].inicio_p75_ms).toBeNull();
    expect(lido?.superficies[0].vitais[0].lcp_p75_ms).toBeNull();
    expect(lido?.erros).toEqual([]);
    expect(lido?.console.serie_30d).toEqual([]);
  });
});

describe("lerVital", () => {
  it("sem dado não vira meta batida", () => {
    expect(lerVital(null, 0, 2500)).toBe("sem_dado");
  });

  it("amostra pequena não julga, mesmo com valor ruim", () => {
    expect(lerVital(9000, AMOSTRA_MINIMA - 1, 2500)).toBe("amostra_pequena");
  });

  it("com amostra, compara com a meta", () => {
    expect(lerVital(2500, AMOSTRA_MINIMA, 2500)).toBe("bom");
    expect(lerVital(2501, AMOSTRA_MINIMA, 2500)).toBe("acima");
  });
});

it("formata milissegundo e segundo", () => {
  expect(formatarMs(null)).toBe("—");
  expect(formatarMs(180)).toBe("180 ms");
  expect(formatarMs(2500)).toBe("2,5 s");
});
