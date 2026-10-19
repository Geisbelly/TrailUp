import { describe, it, expect, vi } from "vitest";
import {
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  isChunkLoadError,
  loadWithReload,
  reloadOnceForStaleChunk,
} from "./chunkReload";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("isChunkLoadError", () => {
  it("reconhece o erro de chunk antigo do Chrome, Firefox e Safari", () => {
    expect(
      isChunkLoadError(
        new TypeError("Failed to fetch dynamically imported module: https://trailup.vercel.app/assets/CadastroAluno-WmwpOGPN.js"),
      ),
    ).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
  });

  it("ignora erros que não são de chunk", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("reloadOnceForStaleChunk", () => {
  it("recarrega na primeira falha e grava a trava", () => {
    const storage = memoryStorage();
    const reload = vi.fn();

    expect(reloadOnceForStaleChunk({ storage, reload, now: () => 1_000_000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe("1000000");
  });

  it("não recarrega de novo dentro da janela (evita loop)", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    reloadOnceForStaleChunk({ storage, reload, now: () => 1_000_000 });

    expect(reloadOnceForStaleChunk({ storage, reload, now: () => 1_000_000 + CHUNK_RELOAD_WINDOW_MS - 1 })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("volta a permitir depois da janela (deploy novo mais tarde)", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    reloadOnceForStaleChunk({ storage, reload, now: () => 1_000_000 });

    expect(reloadOnceForStaleChunk({ storage, reload, now: () => 1_000_000 + CHUNK_RELOAD_WINDOW_MS })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("sem sessionStorage não recarrega", () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleChunk({ storage: null, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("loadWithReload", () => {
  it("devolve o módulo quando o import funciona", async () => {
    const mod = { default: "ok" };
    await expect(loadWithReload(() => Promise.resolve(mod), { storage: memoryStorage(), reload: vi.fn() })).resolves.toBe(mod);
  });

  it("recarrega uma vez quando o chunk é de um deploy antigo", async () => {
    const reload = vi.fn();
    const pending = loadWithReload(
      () => Promise.reject(new TypeError("Failed to fetch dynamically imported module: /assets/x.js")),
      { storage: memoryStorage(), reload, now: () => 1 },
    );
    const settled = await Promise.race([pending.then(() => "settled", () => "settled"), new Promise((r) => setTimeout(() => r("pending"), 20))]);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(settled).toBe("pending");
  });

  it("propaga o erro se a trava já foi usada", async () => {
    const storage = memoryStorage();
    storage.setItem(CHUNK_RELOAD_KEY, "1");
    const reload = vi.fn();
    const error = new TypeError("Failed to fetch dynamically imported module: /assets/x.js");

    await expect(loadWithReload(() => Promise.reject(error), { storage, reload, now: () => 2 })).rejects.toBe(error);
    expect(reload).not.toHaveBeenCalled();
  });

  it("propaga erros que não são de chunk sem recarregar", async () => {
    const reload = vi.fn();
    const error = new Error("boom");

    await expect(loadWithReload(() => Promise.reject(error), { storage: memoryStorage(), reload })).rejects.toBe(error);
    expect(reload).not.toHaveBeenCalled();
  });
});
