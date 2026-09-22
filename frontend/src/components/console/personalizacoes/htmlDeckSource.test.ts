import { describe, expect, it, vi } from "vitest";
import { comProxyDoGateway, fetchHtmlDeckSource } from "./htmlDeckSource";

const GATEWAY = "https://proj.supabase.co/functions/v1/storage-redirect?path=brainhex/deck.html";

describe("comProxyDoGateway", () => {
  it("marca a URL do gateway para devolver o corpo em vez de redirecionar", () => {
    expect(comProxyDoGateway(GATEWAY)).toBe(`${GATEWAY}&proxy=1`);
  });

  it("usa '?' quando a URL ainda nao tem query", () => {
    expect(comProxyDoGateway("https://proj.supabase.co/arquivo.html")).toBe(
      "https://proj.supabase.co/arquivo.html?proxy=1",
    );
  });

  it("nao duplica o parametro em URL que ja pede proxy", () => {
    expect(comProxyDoGateway(`${GATEWAY}&proxy=1`)).toBe(`${GATEWAY}&proxy=1`);
  });

  it("preserva o fragmento no fim, onde ele precisa ficar", () => {
    expect(comProxyDoGateway(`${GATEWAY}#slide-3`)).toBe(`${GATEWAY}&proxy=1#slide-3`);
  });

  it("nao mexe em blob:/data:, que nao passam por gateway nenhum", () => {
    expect(comProxyDoGateway("blob:https://app/abc")).toBe("blob:https://app/abc");
    expect(comProxyDoGateway("data:text/html,<p>oi</p>")).toBe("data:text/html,<p>oi</p>");
  });
});

describe("fetchHtmlDeckSource", () => {
  it("busca pelo gateway em modo proxy e devolve o texto HTML", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe(`${GATEWAY}&proxy=1`);
      return new Response("<!DOCTYPE html><html><body>Deck</body></html>", { status: 200 });
    });

    const result = await fetchHtmlDeckSource(GATEWAY, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ html: "<!DOCTYPE html><html><body>Deck</body></html>" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("devolve o status quando a origem responde erro, sem lancar excecao", async () => {
    const fetchImpl = vi.fn(async () => new Response("nao encontrado", { status: 404 }));

    const result = await fetchHtmlDeckSource(GATEWAY, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ error: "HTTP 404" });
  });

  it("devolve erro de rede em vez de estourar (CORS/offline caem aqui)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const result = await fetchHtmlDeckSource(GATEWAY, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ error: "Failed to fetch" });
  });

  it("trata corpo vazio como erro, e nao como deck em branco", async () => {
    const fetchImpl = vi.fn(async () => new Response("   ", { status: 200 }));

    const result = await fetchHtmlDeckSource(GATEWAY, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ error: "Download vazio." });
  });
});

describe("createHtmlBlobUrl", () => {
  it("cria uma blob URL com o mime type text/html, ignorando o content-type original", async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:mock-url";
    }) as typeof URL.createObjectURL;

    try {
      const { createHtmlBlobUrl } = await import("./htmlDeckSource");
      const url = createHtmlBlobUrl("<html></html>");

      expect(url).toBe("blob:mock-url");
      expect(created[0].type).toBe("text/html");
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
  });
});
