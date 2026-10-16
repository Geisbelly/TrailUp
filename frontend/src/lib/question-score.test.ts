import { describe, expect, it } from "vitest";
import { normalizeOptionalPositiveScore, parseOptionalPositiveScore, scoreToInputString } from "./question-score";

describe("parseOptionalPositiveScore", () => {
  it("vazio (null, undefined, texto em branco) é válido e marcado como vazio", () => {
    for (const v of [null, undefined, "", "   "]) {
      expect(parseOptionalPositiveScore(v)).toEqual({ value: null, isValid: true, isEmpty: true });
    }
  });

  it("aceita número positivo e arredonda em duas casas", () => {
    expect(parseOptionalPositiveScore(2)).toEqual({ value: 2, isValid: true, isEmpty: false });
    expect(parseOptionalPositiveScore(1.236)).toMatchObject({ value: 1.24, isValid: true });
  });

  it("aceita texto com vírgula decimal, como o professor digita", () => {
    expect(parseOptionalPositiveScore("1,5")).toMatchObject({ value: 1.5, isValid: true });
    expect(parseOptionalPositiveScore(" 0,25 ")).toMatchObject({ value: 0.25, isValid: true });
  });

  it("recusa zero, negativo, NaN, infinito e texto", () => {
    for (const v of [0, -1, NaN, Infinity, "0", "-3", "abc", "1,2,3"]) {
      expect(parseOptionalPositiveScore(v)).toEqual({ value: null, isValid: false, isEmpty: false });
    }
  });
});

describe("normalizeOptionalPositiveScore", () => {
  it("devolve o valor, ou null para vazio e para inválido", () => {
    expect(normalizeOptionalPositiveScore("2,5")).toBe(2.5);
    expect(normalizeOptionalPositiveScore("")).toBeNull();
    expect(normalizeOptionalPositiveScore("x")).toBeNull();
  });
});

describe("scoreToInputString", () => {
  it("devolve o texto para o campo, ou vazio", () => {
    expect(scoreToInputString(3)).toBe("3");
    expect(scoreToInputString("1,50")).toBe("1.5");
    expect(scoreToInputString(null)).toBe("");
    expect(scoreToInputString(-1)).toBe("");
  });
});
