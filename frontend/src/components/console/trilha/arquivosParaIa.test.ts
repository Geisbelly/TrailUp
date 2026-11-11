import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import {
  anexosDoPedido,
  bytesDoBase64,
  lerDocx,
  lerPptx,
  paraBase64,
  PDF_INTEIRO_ATE_BYTES,
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
