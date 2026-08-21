import { describe, expect, it, vi } from "vitest";
import { fetchHtmlDeckSource } from "./htmlDeckSource";
import type { SupabaseStorageDownloader } from "./htmlDeckSource";

function fakeStorage(
  download: (bucket: string, path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>,
): SupabaseStorageDownloader {
  return {
    from: (bucket: string) => ({
      download: (path: string) => download(bucket, path),
    }),
  };
}

describe("fetchHtmlDeckSource", () => {
  it("baixa o objeto do bucket/caminho informados e devolve o texto HTML", async () => {
    const storage = fakeStorage(async (bucket, path) => {
      expect(bucket).toBe("conteudo_aluno");
      expect(path).toBe("brainhex/seeker/apresentacao/material-1.html");
      return {
        data: new Blob(["<!DOCTYPE html><html><body>Deck</body></html>"], { type: "text/plain" }),
        error: null,
      };
    });

    const result = await fetchHtmlDeckSource(storage, "conteudo_aluno", "brainhex/seeker/apresentacao/material-1.html");

    expect(result).toEqual({ html: "<!DOCTYPE html><html><body>Deck</body></html>" });
  });

  it("devolve erro quando o Supabase retorna error, sem lancar excecao", async () => {
    const storage = fakeStorage(async () => ({
      data: null,
      error: { message: "Object not found" },
    }));

    const result = await fetchHtmlDeckSource(storage, "conteudo_aluno", "caminho/inexistente.html");

    expect(result).toEqual({ error: "Object not found" });
  });

  it("devolve erro generico quando nao ha data nem error explicito", async () => {
    const storage = fakeStorage(async () => ({ data: null, error: null }));

    const result = await fetchHtmlDeckSource(storage, "conteudo_aluno", "caminho.html");

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
