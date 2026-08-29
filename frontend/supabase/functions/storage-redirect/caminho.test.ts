import { describe, expect, it } from "vitest";
import { normalizarStoragePath } from "./caminho";

const VALIDO = "brainhex/seeker/classe-54/topico-131/apresentacao/material-1.html";

describe("normalizarStoragePath", () => {
  it("aceita um caminho real de material e devolve intacto", () => {
    expect(normalizarStoragePath(VALIDO)).toBe(VALIDO);
  });

  it("apara espaco e quebra de linha em VOLTA (nao e caractere de controle no meio)", () => {
    expect(normalizarStoragePath(`  ${VALIDO}  `)).toBe(VALIDO);
    expect(normalizarStoragePath(VALIDO + String.fromCharCode(10))).toBe(VALIDO);
  });

  it.each([
    ["vazio", ""],
    ["so espaco", "   "],
    ["nulo", null],
    ["indefinido", undefined],
    ["barra inicial", "/brainhex/x.html"],
    ["segmento vazio", "brainhex//x.html"],
    ["ponto", "brainhex/./x.html"],
    ["ponto-ponto", "brainhex/../outro/x.html"],
    ["ponto-ponto no fim", "brainhex/.."],
    ["barra invertida", "brainhex" + String.fromCharCode(92) + "x.html"],
    ["quebra de linha no meio", "brainhex/x" + String.fromCharCode(10) + "y.html"],
    ["nulo embutido", "brainhex/" + String.fromCharCode(0) + "x.html"],
  ])("recusa %s", (_nome, entrada) => {
    expect(normalizarStoragePath(entrada as string | null | undefined)).toBeNull();
  });

  it("recusa caminho absurdamente longo", () => {
    expect(normalizarStoragePath("a/".repeat(600) + "x.html")).toBeNull();
  });

  it("nao tenta consertar: caminho torto vira null, nao versao limpa", () => {
    // Consertar produziria 404 confuso; recusar produz 400 claro.
    expect(normalizarStoragePath("brainhex/../brainhex/x.html")).toBeNull();
  });
});
