import { describe, expect, it } from "vitest";
import catalogo from "./explicacoes.json";
import { FRASE_DO_SELO, ROTULO_DO_SELO, problemasDoCatalogo } from "./explicacoes";

const BASE = {
  nome: "Exemplo",
  selo: "medido",
  oQueMede: "Algo.",
  comoColeta: "De algum lugar.",
  atualiza: "Sempre.",
  naoSignifica: "Outra coisa.",
  referencia: "arquivo.ts",
};

const comCampo = (campo: string, valor: unknown) => ({ "x.exemplo": { ...BASE, [campo]: valor } });

describe("catálogo de explicações do console", () => {
  it("o catálogo publicado não tem nenhum problema", () => {
    expect(problemasDoCatalogo(catalogo, 360)).toEqual([]);
  });

  it("recusa selo fora dos três", () => {
    expect(problemasDoCatalogo(comCampo("selo", "certeza"), 360).join("\n")).toContain("selo");
  });

  it("recusa 'o que não significa' vazio", () => {
    expect(problemasDoCatalogo(comCampo("naoSignifica", ""), 360).join("\n")).toContain("naoSignifica");
  });

  it("recusa campo acima do limite e diz o tamanho", () => {
    expect(problemasDoCatalogo(comCampo("oQueMede", "a".repeat(361)), 360).join("\n")).toContain("361");
    expect(problemasDoCatalogo(comCampo("oQueMede", "a".repeat(360)), 360)).toEqual([]);
  });

  it("recusa mais de três limites", () => {
    expect(problemasDoCatalogo(comCampo("limites", ["a", "b", "c", "d"]), 360).join("\n")).toContain("limites");
  });

  it("exige a referência da fonte", () => {
    expect(problemasDoCatalogo(comCampo("referencia", undefined), 360).join("\n")).toContain("referencia");
  });

  it("rótulos e frases do selo são os combinados com a autora", () => {
    expect(ROTULO_DO_SELO).toEqual({ medido: "Medido", regra: "Calculado com regra", estimativa: "Estimativa" });
    expect(FRASE_DO_SELO.estimativa).toBe(
      "Estimativa: sai de um modelo ou de uma regra aproximada e ainda não foi validada com alunos.",
    );
    expect(FRASE_DO_SELO.medido).toBe("Medido: contagem ou soma direta do que o sistema registrou.");
    expect(FRASE_DO_SELO.regra).toBe(
      "Calculado com regra: conta fixa sobre dados registrados. O número depende da regra, descrita abaixo.",
    );
  });
});
