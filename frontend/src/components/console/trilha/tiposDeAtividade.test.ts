import { describe, expect, it } from "vitest";
import { ehMissao, ehTipoDeAtividade, ROTULO_DO_TIPO, TIPOS_DE_ATIVIDADE, TIPOS_DE_QUESTAO } from "./tiposDeAtividade";

describe("tiposDeAtividade", () => {
  it("todo tipo tem rótulo", () => {
    for (const t of TIPOS_DE_ATIVIDADE) expect(ROTULO_DO_TIPO[t]).toBeTruthy();
  });

  it("reconhece os tipos válidos e recusa typo", () => {
    expect(ehTipoDeAtividade("missao")).toBe(true);
    expect(ehTipoDeAtividade("quiz")).toBe(true);
    expect(ehTipoDeAtividade("missão")).toBe(false);
    expect(ehTipoDeAtividade("Quiz")).toBe(false);
    expect(ehTipoDeAtividade(null)).toBe(false);
    expect(ehTipoDeAtividade(undefined)).toBe(false);
  });

  it("os tipos do spec B, com rótulo, aceitos pelo CHECK de `20261110_02`", () => {
    expect(ROTULO_DO_TIPO.code).toBe("Código");
    expect(ROTULO_DO_TIPO.numeric).toBe("Numérica");
    expect(ROTULO_DO_TIPO.expression).toBe("Expressão");
    for (const t of ["code", "numeric", "expression"]) expect(ehTipoDeAtividade(t)).toBe(true);
  });

  it("os tipos de questão que o editor oferece não incluem missão", () => {
    expect(TIPOS_DE_QUESTAO).not.toContain("missao");
    expect(TIPOS_DE_QUESTAO).toEqual(["quiz", "true_false", "fill_blank", "essay", "code", "numeric", "expression"]);
  });

  it("ehMissao só aceita o tipo exato", () => {
    expect(ehMissao("missao")).toBe(true);
    expect(ehMissao("quiz")).toBe(false);
    expect(ehMissao(null)).toBe(false);
  });
});
