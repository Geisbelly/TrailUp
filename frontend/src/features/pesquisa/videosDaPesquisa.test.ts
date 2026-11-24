import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PDF_DA_CARTILHA, VIDEOS_DA_PESQUISA, caminhoDoVideo, linkPublico, videoPorSlug } from "./videosDaPesquisa";

const SCRIPT = readFileSync(
  fileURLToPath(new URL("../../../../scripts/pesquisa-videos/subir-para-o-r2.mjs", import.meta.url)),
  "utf-8",
);

describe("vídeos da pesquisa", () => {
  it("o script sobe exatamente os arquivos que a página lê", () => {
    const doScript = [...SCRIPT.matchAll(/"(publico\/[^"]+)"/g)].map(m => m[1]).sort();
    const daPagina = [PDF_DA_CARTILHA, ...VIDEOS_DA_PESQUISA.flatMap(v => [v.arquivo, v.poster])].sort();
    expect(doScript).toEqual(daPagina);
  });

  it("slugs únicos, e cada um abre a própria página", () => {
    const slugs = VIDEOS_DA_PESQUISA.map(v => v.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const video of VIDEOS_DA_PESQUISA) {
      expect(videoPorSlug(video.slug)).toBe(video);
      expect(caminhoDoVideo(video)).toBe(`/pesquisa/professores/videos/${video.slug}`);
    }
    expect(videoPorSlug("nao-existe")).toBeNull();
    expect(videoPorSlug(undefined)).toBeNull();
  });

  it("os três papéis: apresentação, professor e guia", () => {
    expect(VIDEOS_DA_PESQUISA.map(v => v.papel)).toEqual(["Apresentação", "Para o professor", "Guia"]);
  });
});

describe("linkPublico", () => {
  const caminho = VIDEOS_DA_PESQUISA[0].arquivo;

  it("monta o link do gateway do projeto, sem sessão", () => {
    expect(linkPublico("https://abc.supabase.co/", caminho)).toBe(
      `https://abc.supabase.co/functions/v1/storage-redirect?path=${encodeURIComponent(caminho)}`,
    );
  });

  it("nada fora de publico/, e nada sem projeto válido", () => {
    expect(linkPublico("https://abc.supabase.co", "pesquisa/arquivo/x.json")).toBeNull();
    expect(linkPublico("", caminho)).toBeNull();
    expect(linkPublico(undefined, caminho)).toBeNull();
    expect(linkPublico("nao e url", caminho)).toBeNull();
    expect(linkPublico("http://abc.supabase.co", caminho)).toBeNull();
    expect(linkPublico("http://localhost:54321", caminho)).toContain("http://localhost:54321/functions/v1/");
  });
});
