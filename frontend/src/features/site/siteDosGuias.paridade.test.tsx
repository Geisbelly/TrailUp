import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// As páginas públicas não leem nada do banco ao renderizar, mas importam o cliente e a sessão.
vi.mock("@/integrations/supabase/client", () => {
  const nada: unknown = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { supabase: nada };
});
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, session: null, loading: false, role: null, profile: null }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

import Index from "@/pages/Index";
import Sobre from "@/pages/Sobre";
import Download from "@/pages/Download";
import Contato from "@/pages/Contato";
import PesquisaProfessores from "@/pages/PesquisaProfessores";
import Privacidade from "@/pages/Privacidade";
import Termos from "@/pages/Termos";
import { BLOG_CONTENT, BLOG_POSTS } from "@/features/diario/artigosDoDiario";
import { CAMINHO_DA_CARTILHA } from "@/features/pesquisa/pesquisaProfessores";
import { VIDEO_DO_ARTIGO, VIDEOS_DA_PESQUISA } from "@/features/pesquisa/videosDaPesquisa";
import {
  BASE_DO_SITE,
  htmlParaTexto,
  secoesDaPagina,
  secoesDoDiario,
  secoesDosVideos,
  type SecaoDoSite,
} from "./siteDosGuias";

// O Guia e a Lumi leem o site de uma cópia na API. Para gerá-la de novo:
//   ATUALIZAR_SITE_DOS_GUIAS=1 npx vitest run src/features/site/siteDosGuias.paridade.test.tsx
const COPIA = resolve(__dirname, "../../../../api/app/agent/prompts/site_trailup.json");

const PAGINAS: readonly [string, string, ComponentType][] = [
  ["Início", "/", Index],
  ["Sobre", "/sobre", Sobre],
  ["Baixar o app", "/download", Download],
  ["Contato", "/contato", Contato],
  ["Cartilha da pesquisa com professores", CAMINHO_DA_CARTILHA, PesquisaProfessores],
  ["Privacidade", "/privacidade", Privacidade],
  ["Termos de uso", "/termos", Termos],
];

function renderizar(Pagina: ComponentType): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Pagina />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function montarSite(): { base: string; secoes: SecaoDoSite[] } {
  const secoes = [
    ...PAGINAS.flatMap(([nome, rota, Pagina]) => secoesDaPagina(nome, rota, htmlParaTexto(renderizar(Pagina)))),
    ...secoesDoDiario(BLOG_POSTS, BLOG_CONTENT, VIDEO_DO_ARTIGO),
    ...secoesDosVideos(VIDEOS_DA_PESQUISA, CAMINHO_DA_CARTILHA),
  ];
  return { base: BASE_DO_SITE, secoes };
}

describe("cópia do site na API", () => {
  it("é igual ao site", () => {
    const site = montarSite();
    if (process.env.ATUALIZAR_SITE_DOS_GUIAS === "1") {
      writeFileSync(COPIA, `${JSON.stringify(site, null, 2)}\n`, "utf-8");
    }
    expect(JSON.parse(readFileSync(COPIA, "utf-8"))).toEqual(site);
  });

  it("tem todo artigo do Diário e todo vídeo", () => {
    const ids = new Set(montarSite().secoes.map((s) => s.id));
    for (const artigo of BLOG_POSTS) expect(ids.has(`diario/${artigo.id}`)).toBe(true);
    for (const video of VIDEOS_DA_PESQUISA) expect(ids.has(`video/${video.slug}`)).toBe(true);
    // Artigo listado sem texto viraria seção só com o resumo.
    for (const artigo of BLOG_POSTS) expect(BLOG_CONTENT[artigo.id]?.content.length ?? 0).toBeGreaterThan(200);
  });
});

describe("htmlParaTexto", () => {
  it("tira cabeçalho e rodapé e marca os títulos", () => {
    const html =
      '<header><a href="/">TrailUp</a></header><main><h2 class="x">Quem participa</h2><p>Docentes &amp; pedagogos.</p>' +
      "<ul><li>Um</li><li>Dois</li></ul></main><footer>Termos</footer>";
    expect(htmlParaTexto(html)).toBe("## Quem participa\nDocentes & pedagogos.\n- Um\n- Dois");
  });

  it("divide a página nos títulos de seção", () => {
    const secoes = secoesDaPagina("Sobre", "/sobre", "# Sobre\nIntro\n## Equipe\nTexto");
    expect(secoes.map((s) => [s.id, s.titulo])).toEqual([
      ["pagina/sobre/0", "Sobre"],
      ["pagina/sobre/1", "Sobre: Equipe"],
    ]);
  });
});
