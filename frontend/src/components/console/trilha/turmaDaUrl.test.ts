import { describe, expect, it } from "vitest";
import { turmaInicialDaTrilha } from "./turmaDaUrl";

const turmas = [{ id: 54 }, { id: 56 }];

describe("turmaInicialDaTrilha", () => {
  it("começa na turma da URL quando ela é do professor", () => {
    expect(turmaInicialDaTrilha("56", turmas)).toBe("56");
    expect(turmaInicialDaTrilha(" 056 ", turmas)).toBe("56");
  });

  it("turma alheia, inexistente ou inválida cai na primeira turma, como antes", () => {
    expect(turmaInicialDaTrilha("999", turmas)).toBe("54");
    expect(turmaInicialDaTrilha("abc", turmas)).toBe("54");
    expect(turmaInicialDaTrilha("54; drop", turmas)).toBe("54");
    expect(turmaInicialDaTrilha(null, turmas)).toBe("54");
  });

  it("sem turma nenhuma não escolhe nada", () => {
    expect(turmaInicialDaTrilha("54", [])).toBe("");
  });
});
