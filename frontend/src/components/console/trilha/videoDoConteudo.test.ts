import { describe, expect, it } from "vitest";
import { idDoYouTube, videoDoConteudo } from "./videoDoConteudo";

const EMBED = "https://www.youtube.com/embed/NpG1Xt8LB_c?playsinline=1&rel=0&modestbranding=1";

describe("videoDoConteudo", () => {
  it.each([
    "https://www.youtube.com/watch?v=NpG1Xt8LB_c",
    "https://www.youtube.com/watch?list=PL1&v=NpG1Xt8LB_c&t=30",
    "https://youtu.be/NpG1Xt8LB_c?si=abc",
    "https://www.youtube.com/shorts/NpG1Xt8LB_c",
    "https://www.youtube.com/embed/NpG1Xt8LB_c",
    "https://www.youtube-nocookie.com/embed/NpG1Xt8LB_c",
    "  https://www.youtube.com/watch?v=NpG1Xt8LB_c  ",
  ])("toca o YouTube a partir de %s", (valor) => {
    expect(videoDoConteudo(valor)).toEqual({ tipo: "youtube", id: "NpG1Xt8LB_c", embedUrl: EMBED });
  });

  it("lê o src do iframe colado em vez de injetar o HTML", () => {
    const html = '<iframe width="560" height="315" src="https://www.youtube.com/embed/NpG1Xt8LB_c" frameborder="0" allowfullscreen></iframe>';
    expect(videoDoConteudo(html)).toEqual({ tipo: "youtube", id: "NpG1Xt8LB_c", embedUrl: EMBED });
  });

  it("aceita iframe com aspas simples, sem aspas e src protocol-relative", () => {
    expect(videoDoConteudo("<iframe src='https://player.vimeo.com/video/123456789'></iframe>")?.tipo).toBe("vimeo");
    expect(videoDoConteudo("<iframe src=https://example.com/v/1></iframe>")).toEqual({ tipo: "iframe", embedUrl: "https://example.com/v/1" });
    expect(videoDoConteudo('<iframe src="//example.com/player?a=1&amp;b=2"></iframe>')).toEqual({ tipo: "iframe", embedUrl: "https://example.com/player?a=1&b=2" });
  });

  it("toca o Vimeo", () => {
    expect(videoDoConteudo("https://vimeo.com/123456789")).toEqual({ tipo: "vimeo", id: "123456789", embedUrl: "https://player.vimeo.com/video/123456789" });
  });

  it("toca arquivo de vídeo direto ou caminho do bucket", () => {
    expect(videoDoConteudo("https://cdn.exemplo.com/aula.mp4?token=1")).toEqual({ tipo: "arquivo", url: "https://cdn.exemplo.com/aula.mp4?token=1" });
    expect(videoDoConteudo("uuid/12/1700_aula.webm")).toEqual({ tipo: "arquivo", url: "uuid/12/1700_aula.webm" });
  });

  it("recusa o que não é vídeo nem endereço seguro", () => {
    expect(videoDoConteudo("")).toBeNull();
    expect(videoDoConteudo(null)).toBeNull();
    expect(videoDoConteudo("https://example.com/pagina")).toBeNull();
    expect(videoDoConteudo('<iframe src="javascript:alert(1)"></iframe>')).toBeNull();
    expect(videoDoConteudo('<iframe src="http://example.com/v"></iframe>')).toBeNull();
    expect(videoDoConteudo("<script>alert(1)</script>")).toBeNull();
    expect(videoDoConteudo("Assistir a aula sobre normalização.mp4 depois")).toBeNull();
  });

  it("idDoYouTube não inventa id", () => {
    expect(idDoYouTube("https://www.youtube.com/channel/UC123")).toBeNull();
  });
});
