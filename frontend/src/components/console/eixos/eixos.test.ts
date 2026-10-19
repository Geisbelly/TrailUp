import { describe, expect, it } from "vitest";
import {
  consequenciaValida,
  dificuldadeValida,
  resumoDosEixos,
  rotuloDaConsequencia,
  rotuloDaDificuldade,
  rotuloDaRegra,
  rotuloDoFormato,
} from "./eixos";

describe("eixos", () => {
  it("defaults preservam ranqueada e normal", () => {
    expect(consequenciaValida(undefined)).toBe("ranqueada");
    expect(consequenciaValida("xyz")).toBe("ranqueada");
    expect(dificuldadeValida(undefined)).toBe("normal");
    expect(dificuldadeValida("dificil")).toBe("dificil");
  });

  it("rótulos cobrem os quatro eixos e as regras legadas", () => {
    expect(rotuloDoFormato("turma")).toBe("Turma");
    expect(rotuloDaRegra("velocidade")).toBe("Velocidade");
    expect(rotuloDaRegra("duelo")).toBe("Duelo");
    expect(rotuloDaDificuldade("dificil")).toBe("Difícil");
    expect(rotuloDaConsequencia("treino")).toBe("Treino");
  });

  it("resumo junta os quatro sem inventar valor", () => {
    expect(
      resumoDosEixos({ formato: "guilda", modo: "precisao", dificuldade: "dificil", consequencia: "treino" }),
    ).toBe("Guilda · Precisão · Difícil · Treino");
  });
});
