import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PDF_DA_CARTILHA,
  VIDEOS_DA_PESQUISA,
  VIDEO_DO_ARTIGO,
  caminhoDoVideo,
  caminhoDoVideoNoSite,
  linkPublico,
  videoPorSlug,
} from "./videosDaPesquisa";

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
    for (const video of VIDEOS_DA_PESQUISA) expect(caminhoDoVideoNoSite(video)).toBe(`/videos/${video.slug}`);
    expect(videoPorSlug("nao-existe")).toBeNull();
    expect(videoPorSlug(undefined)).toBeNull();
  });

  it("os cinco papéis, com o passo a passo da pesquisa primeiro", () => {
    expect(VIDEOS_DA_PESQUISA.map(v => v.papel)).toEqual([
      "Para quem vai avaliar",
      "Apresentação",
      "Para o professor",
      "A rotina do professor",
      "Para o aluno",
    ]);
  });

  it("capa com nome próprio, para não brigar com o cache da capa antiga", () => {
    for (const video of VIDEOS_DA_PESQUISA) expect(video.poster).toMatch(/-capa\.jpg$/);
  });
});

describe("vídeo de cada artigo do Diário", () => {
  const BLOG_POST = readFileSync(fileURLToPath(new URL("../../pages/BlogPost.tsx", import.meta.url)), "utf-8");

  it("a lista do Diário e os artigos têm os mesmos ids", () => {
    const BLOG = readFileSync(fileURLToPath(new URL("../../pages/Blog.tsx", import.meta.url)), "utf-8");
    const naLista = [...BLOG.matchAll(/\{ id: "([^"]+)"/g)].map(m => m[1]).sort();
    const artigos = [...BLOG_POST.matchAll(/\n {2}"?([a-z-]+)"?: \{\n {4}title:/g)].map(m => m[1]).sort();
    expect(naLista).toEqual(artigos);
    expect(naLista.length).toBeGreaterThan(9);
  });

  it("cada vídeo vai para um artigo só", () => {
    const slugs = Object.values(VIDEO_DO_ARTIGO);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("aponta para vídeo que existe e para artigo que existe", () => {
    for (const [artigo, slug] of Object.entries(VIDEO_DO_ARTIGO)) {
      expect(videoPorSlug(slug), slug).not.toBeNull();
      expect(BLOG_POST, artigo).toMatch(new RegExp(`\\n  "?${artigo}"?: \\{`));
    }
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
