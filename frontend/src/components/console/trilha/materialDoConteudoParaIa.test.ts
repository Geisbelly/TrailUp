import { describe, expect, it, vi } from "vitest";
import { arquivosParaAnexar, enderecosDoConteudo, MAX_ARQUIVOS_POR_CONTEUDO } from "./materialDoConteudoParaIa";

describe("enderecosDoConteudo", () => {
  it("manda o vídeo do YouTube canônico, também a partir do iframe", () => {
    expect(enderecosDoConteudo("video", "https://youtu.be/NpG1Xt8LB_c")).toEqual({ videoUrl: "https://www.youtube.com/watch?v=NpG1Xt8LB_c" });
    expect(enderecosDoConteudo("video", '<iframe src="https://www.youtube.com/embed/NpG1Xt8LB_c"></iframe>')).toEqual({
      videoUrl: "https://www.youtube.com/watch?v=NpG1Xt8LB_c",
    });
  });

  it("não manda vídeo que o Gemini não abre", () => {
    expect(enderecosDoConteudo("video", "https://vimeo.com/123456789")).toEqual({});
    expect(enderecosDoConteudo("video", "uuid/1/aula.mp4")).toEqual({});
  });

  it("manda o link externo só quando é um endereço", () => {
    expect(enderecosDoConteudo("link", " https://pt.wikipedia.org/wiki/X ")).toEqual({ linkUrl: "https://pt.wikipedia.org/wiki/X" });
    expect(enderecosDoConteudo("link", "leia o capítulo 3")).toEqual({});
    expect(enderecosDoConteudo("texto", "https://exemplo.com")).toEqual({});
  });
});

describe("arquivosParaAnexar", () => {
  const blob = (tipo: string) => new Blob(["x"], { type: tipo });

  it("baixa PDF/PPTX/DOCX salvos e junta os pendentes", async () => {
    const baixar = vi.fn(async () => blob("application/pdf"));
    const pendente = new File(["y"], "slides.pptx");
    const arquivos = await arquivosParaAnexar(
      [
        { path: "u/1/aula.pdf", name: "aula.pdf", size: 1 },
        { path: "u/1/notas.md", name: "notas.md", size: 1 },
        { path: "u/1/foto.png", name: "foto.png", size: 1 },
      ],
      [pendente, new File(["z"], "leia.txt")],
      baixar,
    );
    expect(arquivos.map((a) => a.name)).toEqual(["slides.pptx", "aula.pdf"]);
    expect(baixar).toHaveBeenCalledTimes(1);
    expect(baixar).toHaveBeenCalledWith("u/1/aula.pdf");
  });

  it("segue sem o arquivo que não baixa", async () => {
    const arquivos = await arquivosParaAnexar(
      [
        { path: "u/1/a.pdf", name: "a.pdf", size: 1 },
        { path: "u/1/b.docx", name: "b.docx", size: 1 },
      ],
      [],
      async (caminho) => {
        if (caminho.endsWith("a.pdf")) throw new Error("403");
        return blob("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      },
    );
    expect(arquivos.map((a) => a.name)).toEqual(["b.docx"]);
  });

  it("para no limite de arquivos", async () => {
    const salvos = Array.from({ length: 9 }, (_, i) => ({ path: `u/1/${i}.pdf`, name: `${i}.pdf`, size: 1 }));
    const baixar = vi.fn(async () => blob("application/pdf"));
    const arquivos = await arquivosParaAnexar(salvos, [], baixar);
    expect(arquivos).toHaveLength(MAX_ARQUIVOS_POR_CONTEUDO);
    expect(baixar).toHaveBeenCalledTimes(MAX_ARQUIVOS_POR_CONTEUDO);
  });
});
