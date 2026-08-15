import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAndStore } from "./brainhexPdfClient";

const noopLog = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child(): any { return noopLog; },
};

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  return fn().finally(() => {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
}

test("renderAndStore: BRAINHEXPDF_URL ausente -> null sem chamar fetch", async () => {
  await withEnv({ BRAINHEXPDF_URL: undefined }, async () => {
    let called = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { called = true; throw new Error("não deveria chamar"); }) as any;
    try {
      const result = await renderAndStore({
        profile: "seeker" as any,
        sourceText: "# Título\nConteúdo",
        bucket: "conteudo_aluno",
        storagePath: "brainhex/seeker/classe-1/topico-1/apresentacao/material-1.html",
        log: noopLog as any,
      });
      assert.equal(result, null);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("renderAndStore: sucesso -> mapeia resposta pro shape esperado", async () => {
  await withEnv({ BRAINHEXPDF_URL: "http://brainhexpdf.local", BRAINHEXPDF_SHARED_SECRET: "s3gredo" }, async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeaders: Record<string, string> | undefined;
    globalThis.fetch = (async (_url: string, init: any) => {
      capturedHeaders = init.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          url: "https://supabase.local/storage/v1/object/public/conteudo_aluno/x.html",
          storage_path: "brainhex/seeker/classe-1/topico-1/apresentacao/material-1.html",
          bucket: "conteudo_aluno",
          slide_count: 9,
        }),
      };
    }) as any;
    try {
      const result = await renderAndStore({
        profile: "seeker" as any,
        sourceText: "# Título\nConteúdo",
        bucket: "conteudo_aluno",
        storagePath: "brainhex/seeker/classe-1/topico-1/apresentacao/material-1.html",
        log: noopLog as any,
      });
      assert.deepEqual(result, {
        url: "https://supabase.local/storage/v1/object/public/conteudo_aluno/x.html",
        storagePath: "brainhex/seeker/classe-1/topico-1/apresentacao/material-1.html",
        bucket: "conteudo_aluno",
        slideCount: 9,
      });
      assert.equal(capturedHeaders?.["x-api-secret"], "s3gredo");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("renderAndStore: success:false -> null", async () => {
  await withEnv({ BRAINHEXPDF_URL: "http://brainhexpdf.local" }, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false,
      status: 401,
      json: async () => ({ success: false, stage: "validate", error: "auth obrigatória" }),
    })) as any;
    try {
      const result = await renderAndStore({
        profile: "seeker" as any,
        sourceText: "texto",
        bucket: "conteudo_aluno",
        storagePath: "path.html",
        log: noopLog as any,
      });
      assert.equal(result, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("renderAndStore: erro de rede/timeout -> null", async () => {
  await withEnv({ BRAINHEXPDF_URL: "http://brainhexpdf.local", BRAINHEXPDF_TIMEOUT_MS: "10" }, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((_url: string, init: any) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })) as any;
    try {
      const result = await renderAndStore({
        profile: "seeker" as any,
        sourceText: "texto",
        bucket: "conteudo_aluno",
        storagePath: "path.html",
        log: noopLog as any,
      });
      assert.equal(result, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
