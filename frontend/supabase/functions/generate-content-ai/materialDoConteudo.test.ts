import { describe, expect, it, vi } from "vitest";
import { lerPaginaDoLink, linkPublicoSeguro, textoDoHtml, urlDoYouTube } from "./materialDoConteudo";

describe("urlDoYouTube", () => {
  it.each([
    "https://www.youtube.com/watch?v=NpG1Xt8LB_c",
    "https://youtu.be/NpG1Xt8LB_c?si=x",
    "https://www.youtube.com/shorts/NpG1Xt8LB_c",
    '<iframe src="https://www.youtube.com/embed/NpG1Xt8LB_c" allowfullscreen></iframe>',
  ])("canoniza %s", (valor) => {
    expect(urlDoYouTube(valor)).toBe("https://www.youtube.com/watch?v=NpG1Xt8LB_c");
  });

  it("não inventa vídeo", () => {
    expect(urlDoYouTube("https://vimeo.com/123456789")).toBeNull();
    expect(urlDoYouTube(null)).toBeNull();
    expect(urlDoYouTube("https://www.youtube.com/channel/UC1")).toBeNull();
  });
});

describe("linkPublicoSeguro", () => {
  it("aceita página pública", () => {
    expect(linkPublicoSeguro("https://pt.wikipedia.org/wiki/Normaliza%C3%A7%C3%A3o")?.hostname).toBe("pt.wikipedia.org");
    expect(linkPublicoSeguro(" http://exemplo.com.br/a ")?.hostname).toBe("exemplo.com.br");
  });

  it.each([
    "ftp://exemplo.com/a",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://localhost:8000/x",
    "http://api.localhost/x",
    "http://servidor.internal/x",
    "http://127.0.0.1/x",
    "http://10.0.0.5/x",
    "http://172.20.1.1/x",
    "http://192.168.0.1/x",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.0.1/x",
    "http://[::1]/x",
    "http://2130706433/x",
    "http://0x7f000001/x",
    "http://intranet/x",
    "https://usuario:senha@exemplo.com/x",
    "https://exemplo.com:8443/x",
    "não é url",
  ])("recusa %s", (valor) => {
    expect(linkPublicoSeguro(valor)).toBeNull();
  });
});

describe("textoDoHtml", () => {
  it("fica só com o texto legível, com o título", () => {
    const html = `<html><head><title>Normalização</title><style>p{color:red}</style><script>alert(1)</script></head>
      <body><nav>Menu Início</nav><h1>Formas normais</h1><p>A 1FN exige valores &quot;atômicos&quot; &amp; únicos.</p>
      <ul><li>2FN</li><li>3FN</li></ul><footer>Rodapé</footer></body></html>`;
    const texto = textoDoHtml(html);
    expect(texto.startsWith("Normalização\n\n")).toBe(true);
    expect(texto).toContain("Formas normais");
    expect(texto).toContain('A 1FN exige valores "atômicos" & únicos.');
    expect(texto).toContain("2FN");
    expect(texto).not.toMatch(/alert|color:red|Menu Início|Rodapé/);
  });

  it("corta no limite", () => {
    expect(textoDoHtml(`<p>${"a".repeat(500)}</p>`, 100)).toHaveLength(100);
  });

  it("decodifica entidades numéricas", () => {
    expect(textoDoHtml("<p>caf&#233; &#x2014; ok</p>")).toBe("café — ok");
  });
});

describe("lerPaginaDoLink", () => {
  const prazo = () => Date.now() + 120_000;
  const pagina = (corpo: string, tipo = "text/html; charset=utf-8", status = 200, cabecalhos: Record<string, string> = {}) =>
    new Response(corpo, { status, headers: { "content-type": tipo, ...cabecalhos } });
  const longo = `<p>${"Normalizacao organiza tabelas para evitar redundancia. ".repeat(10)}</p>`;

  it("lê o texto da página", async () => {
    const buscar = vi.fn(async () => pagina(`<title>Formas normais</title>${longo}`));
    const texto = await lerPaginaDoLink(new URL("https://exemplo.com/a"), prazo(), buscar as unknown as typeof fetch);
    expect(texto?.startsWith("Formas normais")).toBe(true);
    expect(buscar).toHaveBeenCalledWith("https://exemplo.com/a", expect.objectContaining({ redirect: "manual" }));
  });

  it("segue redirecionamento público e recusa o que leva à rede interna", async () => {
    const publico = vi.fn(async (url: string) =>
      url.endsWith("/a") ? pagina("", "text/html", 301, { location: "/b" }) : pagina(longo),
    );
    expect(await lerPaginaDoLink(new URL("https://exemplo.com/a"), prazo(), publico as unknown as typeof fetch)).toContain("Normalizacao");
    expect(publico).toHaveBeenLastCalledWith("https://exemplo.com/b", expect.anything());

    const interno = vi.fn(async () => pagina("", "text/html", 302, { location: "http://169.254.169.254/latest/meta-data" }));
    expect(await lerPaginaDoLink(new URL("https://exemplo.com/a"), prazo(), interno as unknown as typeof fetch)).toBeNull();
    expect(interno).toHaveBeenCalledTimes(1);
  });

  it("para depois de 3 redirecionamentos", async () => {
    let n = 0;
    const buscar = vi.fn(async () => pagina("", "text/html", 302, { location: `/p${(n += 1)}` }));
    expect(await lerPaginaDoLink(new URL("https://exemplo.com/a"), prazo(), buscar as unknown as typeof fetch)).toBeNull();
    expect(buscar).toHaveBeenCalledTimes(4);
  });

  it("recusa binário, erro, página quase vazia e falha de rede", async () => {
    const casos: Array<() => Promise<Response>> = [
      async () => pagina("%PDF-1.4", "application/pdf"),
      async () => pagina(longo, "text/html", 404),
      async () => pagina("<p>Carregando…</p>"),
      async () => {
        throw new TypeError("network");
      },
    ];
    for (const caso of casos) {
      expect(await lerPaginaDoLink(new URL("https://exemplo.com/a"), prazo(), vi.fn(caso) as unknown as typeof fetch)).toBeNull();
    }
  });

  it("não busca sem tempo de sobra para o modelo", async () => {
    const buscar = vi.fn(async () => pagina(longo));
    expect(await lerPaginaDoLink(new URL("https://exemplo.com/a"), Date.now() + 30_000, buscar as unknown as typeof fetch)).toBeNull();
    expect(buscar).not.toHaveBeenCalled();
  });
});
