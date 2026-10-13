import { describe, expect, it } from "vitest";
import { ehMissao, ehTipoDeAtividade, ROTULO_DO_TIPO, TIPOS_DE_ATIVIDADE } from "./tiposDeAtividade";

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

  it("ehMissao só aceita o tipo exato", () => {
    expect(ehMissao("missao")).toBe(true);
    expect(ehMissao("quiz")).toBe(false);
    expect(ehMissao(null)).toBe(false);
  });
});
