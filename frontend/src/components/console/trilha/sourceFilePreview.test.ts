import { describe, it, expect } from "vitest";
import {
  fileExtension,
  officeViewerUrl,
  podePreVisualizar,
  resolveSourcePreviewKind,
} from "./sourceFilePreview";

describe("fileExtension", () => {
  it("le a extensao de um caminho do bucket", () => {
    expect(fileExtension("conteudos/classe-32/SPD-Aula-04.pptx")).toBe("pptx");
  });

  it("ignora query e hash (URL assinada tem token depois do ?)", () => {
    expect(fileExtension("https://x.test/a/SPD-Aula-04.pptx?token=abc&x=1")).toBe("pptx");
    expect(fileExtension("https://x.test/material.pdf#page=2")).toBe("pdf");
  });

  it("devolve null quando nao ha extensao", () => {
    expect(fileExtension("conteudos/arquivo-sem-extensao")).toBeNull();
    expect(fileExtension("https://x.test/pasta/")).toBeNull();
    expect(fileExtension("")).toBeNull();
    expect(fileExtension(null)).toBeNull();
  });

  it("nao confunde ponto de diretorio com extensao de arquivo", () => {
    expect(fileExtension("pasta.v2/arquivo")).toBeNull();
  });
});

describe("resolveSourcePreviewKind", () => {
  it("PowerPoint e Word vao pro visualizador do Office", () => {
    expect(resolveSourcePreviewKind("aula.pptx")).toBe("office");
    expect(resolveSourcePreviewKind("aula.ppt")).toBe("office");
    expect(resolveSourcePreviewKind("apostila.docx")).toBe("office");
  });

  it("PDF o proprio navegador mostra", () => {
    expect(resolveSourcePreviewKind("material.pdf")).toBe("pdf");
  });

  it("imagem, video e audio usam o player nativo", () => {
    expect(resolveSourcePreviewKind("diagrama.png")).toBe("imagem");
    expect(resolveSourcePreviewKind("animacao.gif")).toBe("imagem");
    expect(resolveSourcePreviewKind("aula.mp4")).toBe("video");
    expect(resolveSourcePreviewKind("podcast.mp3")).toBe("audio");
  });

  it("txt e md sao lidos como texto", () => {
    expect(resolveSourcePreviewKind("roteiro.md")).toBe("texto");
    expect(resolveSourcePreviewKind("notas.txt")).toBe("texto");
  });

  it("csv prefere texto ao visualizador do Office (le melhor no navegador)", () => {
    expect(resolveSourcePreviewKind("dados.csv")).toBe("texto");
  });

  it("extensao desconhecida ou ausente nao promete preview", () => {
    expect(resolveSourcePreviewKind("arquivo.zip")).toBe("desconhecido");
    expect(resolveSourcePreviewKind("sem-extensao")).toBe("desconhecido");
    expect(resolveSourcePreviewKind(null)).toBe("desconhecido");
  });

  it("nao depende de caixa alta no nome", () => {
    expect(resolveSourcePreviewKind("AULA.PPTX")).toBe("office");
    expect(resolveSourcePreviewKind("Material.PDF")).toBe("pdf");
  });
});

describe("podePreVisualizar", () => {
  it("responde pelos tipos suportados", () => {
    expect(podePreVisualizar("aula.pptx")).toBe(true);
    expect(podePreVisualizar("aula.zip")).toBe(false);
  });
});

describe("officeViewerUrl", () => {
  it("codifica a URL do arquivo (o token da URL assinada tem & e =)", () => {
    const assinada = "https://x.test/a.pptx?token=abc&expires=1";

    const embed = officeViewerUrl(assinada);

    expect(embed.startsWith("https://view.officeapps.live.com/op/embed.aspx?src=")).toBe(true);
    expect(embed).toContain(encodeURIComponent(assinada));
    // O & do arquivo nao pode virar um parametro do proprio viewer.
    expect(embed.split("?").length).toBe(2);
  });
});
