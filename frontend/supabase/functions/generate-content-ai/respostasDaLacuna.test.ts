import { describe, expect, it } from "vitest";
import { respostasDaLacuna } from "./respostasDaLacuna";

describe("respostasDaLacuna", () => {
  it("tira a forma que só muda caixa, acento ou pontuação", () => {
    expect(respostasDaLacuna("CONCAT | concat")).toBe("CONCAT");
    expect(respostasDaLacuna("DROP FUNCTION | drop function")).toBe("DROP FUNCTION");
    expect(respostasDaLacuna("normalização | normalizacao | Normalização.")).toBe("normalização");
  });

  it("mantém sinônimo de verdade", () => {
    expect(respostasDaLacuna("inserção | inclusão")).toBe("inserção | inclusão");
    expect(respostasDaLacuna("redundância | redundâncias")).toBe("redundância | redundâncias");
  });

  it("aceita os separadores da correção e devolve com |", () => {
    expect(respostasDaLacuna("Quarter; qq\nquarter")).toBe("Quarter | qq");
  });

  it("deixa resposta única como está e descarta pedaço vazio", () => {
    expect(respostasDaLacuna("1972")).toBe("1972");
    expect(respostasDaLacuna(" | relação | ")).toBe("relação");
  });
});
