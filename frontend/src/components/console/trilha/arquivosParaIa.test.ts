import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import {
  anexosDoPedido,
  bytesDoBase64,
  dimensoesDaImagem,
  lerDocx,
  lerPptx,
  paraBase64,
  PDF_INTEIRO_ATE_BYTES,
  pareceIcone,
  prepararAnexos,
  type AnexoParaIa,
} from "./arquivosParaIa";

const imagem = (bytes: number) => new Uint8Array(bytes).fill(9);

async function pptx(): Promise<Uint8Array> {
  const zip = new JSZip();
  const slide = (texto: string[], embeds: string[] = []) =>
    `<p:sld><p:cSld><p:spTree>${texto.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}` +
    `${embeds.map((e) => `<p:pic><a:blip r:embed="${e}"/></p:pic>`).join("")}</p:spTree></p:cSld></p:sld>`;
  // slide10 antes de slide2 na ordem do zip: a leitura ordena pelo número.
  zip.file("ppt/slides/slide10.xml", slide(["Conclusão"]));
  zip.file("ppt/slides/slide1.xml", slide(["Procedures", "CREATE PROCEDURE &lt;nome&gt;"], ["rId2"]));
  zip.file("ppt/slides/slide2.xml", slide(["Parâmetros IN e OUT"], ["rId5", "rId6"]));
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<Relationships><Relationship Id="rId2" Target="../media/image1.png"/></Relationships>`,
  );
  zip.file(
    "ppt/slides/_rels/slide2.xml.rels",
    `<Relationships><Relationship Id="rId5" Target="../media/image1.png"/><Relationship Id="rId6" Target="../media/logo.png"/></Relationships>`,
  );
  zip.file("ppt/media/image1.png", imagem(10_000));
  zip.file("ppt/media/logo.png", imagem(500)); // pequeno demais: é logo
  return zip.generateAsync({ type: "uint8array" });
}

async function docx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document><w:body>` +
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Normalização</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t xml:space="preserve">A 1FN exige </w:t></w:r><w:r><w:t>atributos atômicos.</w:t></w:r></w:p>` +
      `<w:p><w:r><w:drawing><a:blip r:embed="rId9"/></w:drawing></w:r></w:p>` +
      `</w:body></w:document>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<Relationships><Relationship Id="rId9" Target="media/diagrama.jpeg"/><Relationship Id="rId1" Target="https://x" TargetMode="External"/></Relationships>`,
  );
  zip.file("word/media/diagrama.jpeg", imagem(20_000));
  return zip.generateAsync({ type: "uint8array" });
}

describe("lerPptx", () => {
  it("lê os slides em ordem, decodifica o texto e liga a imagem ao slide", async () => {
    const { texto, imagens } = await lerPptx(await pptx(), "A2");
    expect(texto.indexOf("Procedures")).toBeLessThan(texto.indexOf("Parâmetros"));
    expect(texto.indexOf("Parâmetros")).toBeLessThan(texto.indexOf("Conclusão"));
    expect(texto).toContain("CREATE PROCEDURE <nome>");
    expect(texto).toContain("[Slide 1]");
    // A mesma imagem em dois slides é uma imagem só; o logo pequeno fica de fora.
    expect(imagens.map((i) => i.id)).toEqual(["A2#i1"]);
    expect(imagens[0].mimeType).toBe("image/png");
    expect(texto.match(/\[imagem A2#i1\]/g)).toHaveLength(2);
  });
});

/** PNG de `largura`×`altura` com só o cabeçalho certo, preenchido até `bytes`. */
function png(largura: number, altura: number, bytes = 10_000): Uint8Array {
  const b = new Uint8Array(bytes).fill(9);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, largura);
  new DataView(b.buffer).setUint32(20, altura);
  return b;
}

/** JPEG com um APP0 antes do SOF0, como os de câmera e de print. */
function jpeg(largura: number, altura: number): Uint8Array {
  const b = new Uint8Array(10_000).fill(9);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]);
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08, altura >> 8, altura & 255, largura >> 8, largura & 255], 8);
  return b;
}

describe("dimensoesDaImagem", () => {
  it("lê PNG, JPEG e GIF pelo cabeçalho", () => {
    expect(dimensoesDaImagem(png(850, 510))).toEqual({ largura: 850, altura: 510 });
    expect(dimensoesDaImagem(jpeg(1280, 720))).toEqual({ largura: 1280, altura: 720 });
    const gif = new Uint8Array(20);
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x2c, 0x01, 0xc8, 0x00]);
    expect(dimensoesDaImagem(gif)).toEqual({ largura: 300, altura: 200 });
  });
  it("formato que não reconhece devolve null", () => {
    expect(dimensoesDaImagem(imagem(10_000))).toBeNull();
  });
});

// Medidas reais da aula de NoSQL da turma 70: os ícones dos 5Vs (384×384) e o
// logo do Redis (308×260) viraram figura; o print de código (363×142) e o
// diagrama (850×510) são o que vale mostrar.
describe("pareceIcone", () => {
  it("quase quadrada e pequena é ícone", () => {
    expect(pareceIcone({ largura: 384, altura: 384 })).toBe(true);
    expect(pareceIcone({ largura: 308, altura: 260 })).toBe(true);
  });
  it("print de código estreito e diagrama grande não são", () => {
    expect(pareceIcone({ largura: 363, altura: 142 })).toBe(false);
    expect(pareceIcone({ largura: 850, altura: 510 })).toBe(false);
    expect(pareceIcone({ largura: 485, altura: 525 })).toBe(false);
  });
});

describe("lerPptx descarta ícones", () => {
  it("o ícone 384×384 sai e o print de código fica", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", `<p:sld><a:t>5Vs</a:t><a:blip r:embed="rId1"/><a:blip r:embed="rId2"/></p:sld>`);
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      `<Relationships><Relationship Id="rId1" Target="../media/icone.png"/><Relationship Id="rId2" Target="../media/codigo.png"/></Relationships>`,
    );
    zip.file("ppt/media/icone.png", png(384, 384, 6_676));
    zip.file("ppt/media/codigo.png", png(363, 142, 7_189));
    const { imagens } = await lerPptx(await zip.generateAsync({ type: "uint8array" }), "A1");
    expect(imagens).toHaveLength(1);
    expect(imagens[0].base64).toBe(paraBase64(png(363, 142, 7_189)));
  });
});

describe("lerDocx", () => {
  it("lê parágrafos, títulos e marca onde a imagem está", async () => {
    const { texto, imagens } = await lerDocx(await docx(), "A3");
    expect(texto.split("\n")).toEqual(["## Normalização", "A 1FN exige atributos atômicos.", "[imagem A3#i1]"]);
    expect(imagens).toHaveLength(1);
    expect(imagens[0].mimeType).toBe("image/jpeg");
    expect(bytesDoBase64(imagens[0].base64)).toBe(20_000);
  });
});

describe("prepararAnexos", () => {
  const arquivo = (nome: string, dados: BlobPart, type = "") => new File([dados], nome, { type });

  it("dá ids pela ordem, manda o PDF inteiro com o texto e ignora o que não lê", async () => {
    const lerPdf = vi.fn(async () => ({ texto: "[Pagina 1]\nModelo relacional", paginas: 3 }));
    const anexos = await prepararAnexos(
      [
        arquivo("aula.pdf", new Uint8Array([37, 80, 68, 70]), "application/pdf"),
        arquivo("slides.pptx", await pptx()),
        arquivo("planilha.xlsx", "x"),
        arquivo("notas.md", "# Notas\nChave primária"),
        arquivo("quebrado.docx", "não é zip"),
      ],
      lerPdf,
    );
    // O .md já vai como texto nas fontes; o id segue a posição na lista.
    expect(anexos.map((a) => [a.id, a.nome])).toEqual([
      ["A1", "aula.pdf"],
      ["A2", "slides.pptx"],
    ]);
    expect(anexos[0]).toMatchObject({ mimeType: "application/pdf", paginas: 3, base64: paraBase64(new Uint8Array([37, 80, 68, 70])) });
    expect(anexos[0].texto).toContain("Modelo relacional");
    expect(anexos[1].imagens?.[0].id).toBe("A2#i1");
  });

  it("PDF grande vai só como texto", async () => {
    const grande = new Uint8Array(PDF_INTEIRO_ATE_BYTES + 1);
    const [anexo] = await prepararAnexos([arquivo("livro.pdf", grande)], async () => ({ texto: "capítulo 1", paginas: 300 }));
    expect(anexo.base64).toBeUndefined();
    expect(anexo.texto).toBe("capítulo 1");
  });
});

describe("anexosDoPedido", () => {
  const b64 = (n: number) => paraBase64(new Uint8Array(n));
  const anexos: AnexoParaIa[] = [
    { id: "A1", nome: "Banco de Dados - Aula 1.pdf", mimeType: "application/pdf", base64: b64(60), texto: "t1" },
    { id: "A2", nome: "BD-aula#03-procedures.pptx", mimeType: "x", texto: "t2", imagens: [{ id: "A2#i1", mimeType: "image/png", base64: b64(30) }] },
    { id: "A3", nome: "outro.pdf", mimeType: "application/pdf", base64: b64(60) },
  ];

  it("filtra pelos arquivos do tópico, ignorando acento e caixa", () => {
    expect(anexosDoPedido(anexos, ["banco de dados - aula 1.PDF"]).map((a) => a.id)).toEqual(["A1"]);
  });

  it("sem nome que case, manda todos", () => {
    expect(anexosDoPedido(anexos, ["inexistente.pdf"]).map((a) => a.id)).toEqual(["A1", "A2", "A3"]);
    expect(anexosDoPedido(anexos, []).map((a) => a.id)).toEqual(["A1", "A2", "A3"]);
  });

  it("corta pelo tamanho: o PDF que não cabe vai sem o arquivo", () => {
    const r = anexosDoPedido(anexos, null, 100);
    expect(r[0].base64).toBeDefined();
    expect(r[1].imagens).toHaveLength(1);
    expect(r[2].base64).toBeUndefined();
    // não mexe na lista original
    expect(anexos[2].base64).toBeDefined();
  });
});
