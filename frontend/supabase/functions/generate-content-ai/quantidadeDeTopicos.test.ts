import { describe, expect, it } from "vitest";
import { limitesDoEsqueleto, MAX_TOPICOS, quantidadeDeTopicos, regrasDaQuantidade } from "./quantidadeDeTopicos";

describe("quantidadeDeTopicos", () => {
  it("o número do professor vale, mesmo com arquivos (não é mais um tópico por arquivo)", () => {
    // A assinatura nem recebe os arquivos: eles não podem trocar o número pedido.
    expect(quantidadeDeTopicos(8, [])).toBe(8);
    expect(quantidadeDeTopicos(1, ["A", "B", "C"])).toBe(1);
  });

  it("número vindo como texto também vale, arredondado e no teto", () => {
    expect(quantidadeDeTopicos("7", [])).toBe(7);
    expect(quantidadeDeTopicos(4.6, [])).toBe(5);
    expect(quantidadeDeTopicos(50, [])).toBe(MAX_TOPICOS);
  });

  it("automático com nomes listados: um tópico por nome", () => {
    expect(quantidadeDeTopicos(undefined, ["Cinemática", " ", "Dinâmica"])).toBe(2);
    expect(quantidadeDeTopicos(null, Array.from({ length: 30 }, (_, i) => `T${i}`))).toBe(MAX_TOPICOS);
  });

  it("automático sem nomes: a IA escolhe", () => {
    expect(quantidadeDeTopicos(undefined, [])).toBeNull();
    expect(quantidadeDeTopicos(0, [])).toBeNull();
    expect(quantidadeDeTopicos("auto", [])).toBeNull();
  });
});

describe("regrasDaQuantidade", () => {
  it("com número, pede exatamente ele e manda adaptar o material", () => {
    const regras = regrasDaQuantidade(6, 0).join("\n");
    expect(regras).toContain("EXATAMENTE 6 topicos");
    expect(regras).toContain("agrupe");
    expect(regras).toContain("divida");
    expect(regras).not.toContain("arquivo");
  });

  it("arquivos em quantidade diferente: desamarra arquivo de tópico", () => {
    expect(regrasDaQuantidade(8, 2).join("\n")).toContain("Ha 2 arquivos para 8 topicos");
    expect(regrasDaQuantidade(3, 3).join("\n")).not.toContain("Nao amarre");
  });

  it("automático: o modelo escolhe, com teto", () => {
    const regras = regrasDaQuantidade(null, 4).join("\n");
    expect(regras).toContain("Escolha a quantidade");
    expect(regras).toContain(`nunca mais de ${MAX_TOPICOS}`);
  });
});

describe("limitesDoEsqueleto", () => {
  it("com número, o esquema trava o tamanho do array", () => {
    expect(limitesDoEsqueleto(5)).toEqual({ minItems: 5, maxItems: 5 });
  });

  it("automático: de 1 ao teto", () => {
    expect(limitesDoEsqueleto(null)).toEqual({ minItems: 1, maxItems: MAX_TOPICOS });
  });
});
