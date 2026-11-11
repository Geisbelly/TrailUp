import { describe, expect, it } from "vitest";
import {
  bytesDoBase64,
  instrucaoDeFiguras,
  lerAnexos,
  limparMarcadoresDeFigura,
  MAX_FIGURAS_POR_CONTEUDO,
  MAX_IMAGENS_POR_PEDIDO,
  montarPartesDosAnexos,
  type AnexoDaTrilha,
} from "./anexosDaTrilha";

const b64 = (bytes: number) => Buffer.alloc(bytes, 7).toString("base64");

describe("lerAnexos", () => {
  it("aceita PDF, PPTX com imagens e descarta o que não serve", () => {
    const anexos = lerAnexos([
      { id: "A1", nome: "aula.pdf", mimeType: "application/pdf", base64: b64(10), paginas: 12 },
      {
        id: "A2",
        nome: "slides.pptx",
        texto: "Slide 1: Procedures",
        imagens: [
          { id: "A2#i1", mimeType: "image/png", base64: b64(5) },
          { id: "A3#i1", mimeType: "image/png", base64: b64(5) }, // de outro arquivo
          { id: "A2#i2", mimeType: "image/svg+xml", base64: b64(5) }, // tipo não aceito
        ],
      },
      { id: "A3", nome: "vazio.docx" }, // nada para ler
      { id: "X9", nome: "id-ruim.pdf", base64: b64(10) },
      { id: "A1", nome: "repetido.pdf", base64: b64(10) },
      "lixo",
    ]);
    expect(anexos.map((a) => a.id)).toEqual(["A1", "A2"]);
    expect(anexos[0].paginas).toBe(12);
    expect(anexos[1].imagens?.map((i) => i.id)).toEqual(["A2#i1"]);
  });

  it("não lança com entrada que não é lista", () => {
    expect(lerAnexos(undefined)).toEqual([]);
    expect(lerAnexos({ id: "A1" })).toEqual([]);
  });
});

describe("bytesDoBase64", () => {
  it("conta os bytes sem o preenchimento", () => {
    for (const n of [0, 1, 2, 3, 10, 1000]) expect(bytesDoBase64(b64(n))).toBe(n);
  });
});

describe("montarPartesDosAnexos", () => {
  const pdf = (id: string, bytes: number, extra: Partial<AnexoDaTrilha> = {}): AnexoDaTrilha => ({
    id,
    nome: `${id}.pdf`,
    mimeType: "application/pdf",
    base64: b64(bytes),
    ...extra,
  });

  it("PDF que cabe vai inteiro, com rótulo antes", () => {
    const r = montarPartesDosAnexos([pdf("A1", 100, { paginas: 4 })]);
    expect(r.partes).toHaveLength(2);
    expect(r.partes[0]).toEqual({ text: expect.stringContaining("Arquivo A1: A1.pdf") });
    expect(r.partes[1]).toEqual({ inlineData: { mimeType: "application/pdf", data: b64(100) } });
    expect(r.figuras.pdfs).toEqual([{ id: "A1", paginas: 4 }]);
  });

  it("PDF que passa do limite cai para o texto e não vira referência de página", () => {
    const r = montarPartesDosAnexos([pdf("A1", 60, { texto: "conteudo do pdf" }), pdf("A2", 60, { texto: "outro" })], 100);
    expect(r.partes.filter((p) => "inlineData" in p)).toHaveLength(1);
    expect(r.partes.at(-1)).toEqual({ text: expect.stringContaining("outro") });
    expect(r.figuras.pdfs.map((p) => p.id)).toEqual(["A1"]);
    expect(r.omitidos).toEqual([]);
  });

  it("PDF grande sem texto é omitido e dito", () => {
    const r = montarPartesDosAnexos([pdf("A1", 200)], 100);
    expect(r.partes).toEqual([]);
    expect(r.omitidos).toEqual(["A1.pdf"]);
  });

  it("imagens respeitam o máximo por pedido", () => {
    const imagens = Array.from({ length: MAX_IMAGENS_POR_PEDIDO + 3 }, (_, i) => ({
      id: `A1#i${i + 1}`,
      mimeType: "image/png",
      base64: b64(4),
    }));
    const r = montarPartesDosAnexos([{ id: "A1", nome: "s.pptx", mimeType: "x", texto: "t", imagens }]);
    expect(r.figuras.imagens).toHaveLength(MAX_IMAGENS_POR_PEDIDO);
    expect(r.partes.filter((p) => "inlineData" in p)).toHaveLength(MAX_IMAGENS_POR_PEDIDO);
  });

  it("texto de arquivo é cortado no limite", () => {
    const r = montarPartesDosAnexos([{ id: "A1", nome: "a.docx", mimeType: "x", texto: "x".repeat(100_000) }]);
    expect((r.partes[0] as { text: string }).text.length).toBeLessThan(61_000);
  });
});

describe("instrucaoDeFiguras", () => {
  it("vazia sem figuras", () => {
    expect(instrucaoDeFiguras({ pdfs: [], imagens: [] })).toBe("");
  });
  it("diz as páginas do PDF e as imagens", () => {
    const t = instrucaoDeFiguras({ pdfs: [{ id: "A1", paginas: 9 }], imagens: ["A2#i1"] });
    expect(t).toContain("A1#pN (N de 1 a 9)");
    expect(t).toContain("A2#i1");
    expect(t).toContain("{{figura:REF|legenda curta}}");
  });
});

describe("limparMarcadoresDeFigura", () => {
  const figuras = { pdfs: [{ id: "A1", paginas: 5 }], imagens: ["A2#i1"] };

  it("mantém os válidos e tira os que não existem", () => {
    const t = [
      "Intro",
      "{{figura:A1#p2|Diagrama ER}}",
      "{{figura:A1#p9|fora do PDF}}",
      "{{figura:A2#i1|print}}",
      "{{figura:A2#i7|imagem que não veio}}",
      "{{figura:A5#p1|arquivo que não veio}}",
      "Fim",
    ].join("\n");
    const limpo = limparMarcadoresDeFigura(t, figuras);
    expect(limpo).toContain("{{figura:A1#p2|Diagrama ER}}");
    expect(limpo).toContain("{{figura:A2#i1|print}}");
    expect(limpo).not.toContain("A1#p9");
    expect(limpo).not.toContain("A2#i7");
    expect(limpo).not.toContain("A5#p1");
  });

  it("corta no máximo por conteúdo", () => {
    const t = Array.from({ length: 6 }, (_, i) => `{{figura:A1#p${(i % 5) + 1}|f${i}}}`).join("\n\n");
    const limpo = limparMarcadoresDeFigura(t, figuras);
    expect(limpo.match(/\{\{figura:/g)).toHaveLength(MAX_FIGURAS_POR_CONTEUDO);
  });

  it("PDF sem contagem de páginas aceita qualquer página positiva", () => {
    const limpo = limparMarcadoresDeFigura("{{figura: A1#p40 |x}}", { pdfs: [{ id: "A1" }], imagens: [] });
    expect(limpo).toBe("{{figura:A1#p40|x}}");
  });
});
