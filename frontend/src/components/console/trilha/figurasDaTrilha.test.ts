import { describe, expect, it, vi } from "vitest";
import { comMemoria, lerRef, refsDoTexto, trocarFiguras, type RefDeFigura } from "./figurasDaTrilha";

const texto = [
  "## Procedures",
  "",
  "{{figura:A1#p3|Sintaxe do CREATE PROCEDURE}}",
  "",
  "Texto.",
  "",
  "{{figura:A2#i1|Diagrama [ER]}}",
  "",
  "{{figura:A1#p3|a mesma de novo}}",
  "",
  "{{figura:lixo}}",
].join("\n");

describe("lerRef", () => {
  it("entende página e imagem e recusa o resto", () => {
    expect(lerRef(" A1#p3 ")).toEqual({ tipo: "pagina", anexo: "A1", pagina: 3, ref: "A1#p3" });
    expect(lerRef("A2#i1")).toEqual({ tipo: "imagem", anexo: "A2", ref: "A2#i1" });
    expect(lerRef("A1#p0")).toBeNull();
    expect(lerRef("aula.pdf#p1")).toBeNull();
  });
});

describe("refsDoTexto", () => {
  it("lista cada referência uma vez", () => {
    expect(refsDoTexto(texto).map((r) => r.ref)).toEqual(["A1#p3", "A2#i1"]);
  });
});

describe("trocarFiguras", () => {
  it("põe a imagem onde houve url e apaga onde não houve", async () => {
    const urlDe = vi.fn(async (ref: RefDeFigura) => (ref.tipo === "pagina" ? "https://cdn/x/A1-p3.png" : null));
    const r = await trocarFiguras(texto, urlDe);
    expect(urlDe).toHaveBeenCalledTimes(2);
    expect(r.match(/!\[Sintaxe do CREATE PROCEDURE\]\(https:\/\/cdn\/x\/A1-p3\.png\)/g)).toHaveLength(1);
    expect(r).toContain("![a mesma de novo](https://cdn/x/A1-p3.png)");
    expect(r).not.toContain("{{figura");
    expect(r).not.toContain("Diagrama");
    expect(r).not.toMatch(/\n{3,}/);
  });

  it("falha ao gerar a figura não derruba o texto", async () => {
    const r = await trocarFiguras("a\n\n{{figura:A1#p1|x}}\n\nb", async () => {
      throw new Error("canvas");
    });
    expect(r).toBe("a\n\nb");
  });

  it("texto sem marcador volta igual", async () => {
    const urlDe = vi.fn();
    expect(await trocarFiguras("sem figura", urlDe)).toBe("sem figura");
    expect(urlDe).not.toHaveBeenCalled();
  });
});

describe("comMemoria", () => {
  it("gera cada figura uma vez entre conteúdos", async () => {
    const gerar = vi.fn(async () => "u");
    const urlDe = comMemoria(gerar);
    await trocarFiguras("{{figura:A1#p1|a}}", urlDe);
    await trocarFiguras("{{figura:A1#p1|b}}", urlDe);
    expect(gerar).toHaveBeenCalledTimes(1);
  });
});
