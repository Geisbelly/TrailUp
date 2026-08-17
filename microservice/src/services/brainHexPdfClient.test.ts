import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAndUploadPresentationViaBrainHexPdf } from "./brainHexPdfClient";

async function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test("retorna failure render quando BRAINHEXPDF_API_URL nao configurado", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: undefined }, async () => {
    const result = await renderAndUploadPresentationViaBrainHexPdf({
      markdown: "## Aula\nConteudo",
      topic: "Aula 1",
      profile: "mastermind",
      bucket: "conteudo_aluno",
      presentationPath: "brainhex/mastermind/topico/apresentacao/material-1.html",
    });
    assert.equal(result.presentationUrl, null);
    assert.equal(result.failure?.stage, "render");
  });
});

test("retorna presentationUrl quando o BrainHexPDF responde com sucesso", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: "http://localhost:3002", BRAINHEXPDF_API_SECRET: "segredo" }, async () => {
    let capturedUrl = "";
    let capturedSecret: string | undefined;
    const fetchImpl = (async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedSecret = init?.headers?.["x-api-secret"];
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          url: "https://storage/x.html",
          storage_path: "a/b.html",
          bucket: "conteudo_aluno",
          slide_count: 8,
        }),
      } as any;
    }) as typeof fetch;

    const result = await renderAndUploadPresentationViaBrainHexPdf(
      {
        markdown: "## Aula\nConteudo",
        topic: "Aula 1",
        profile: "mastermind",
        bucket: "conteudo_aluno",
        presentationPath: "brainhex/mastermind/topico/apresentacao/material-1.html",
      },
      { fetchImpl },
    );

    assert.equal(result.presentationUrl, "https://storage/x.html");
    assert.equal(result.failure, null);
    assert.equal(capturedUrl, "http://localhost:3002/api/v1/render-and-store");
    assert.equal(capturedSecret, "segredo");
  });
});

test("retorna failure upload quando o BrainHexPDF responde com stage upload", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: "http://localhost:3002" }, async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 502,
      json: async () => ({ success: false, stage: "upload", error: "bucket cheio" }),
    })) as unknown as typeof fetch;

    const result = await renderAndUploadPresentationViaBrainHexPdf(
      {
        markdown: "## Aula",
        topic: "Aula 1",
        profile: "seeker",
        bucket: "conteudo_aluno",
        presentationPath: "x.html",
      },
      { fetchImpl },
    );

    assert.equal(result.presentationUrl, null);
    assert.equal(result.failure?.stage, "upload");
    assert.match(result.failure?.error ?? "", /bucket cheio/);
  });
});

// Achado do code review: qualquer stage que nao fosse exatamente "upload"
// virava "render", mesmo quando o BrainHexPDF reporta "validate" ou
// "generate" (ver server.ts do BrainHexPDF: stages reais sao validate,
// generate, render, upload, unknown). Perder essa granularidade confunde o
// diagnostico - um targetProfile invalido (validate) parecia uma falha de
// renderizacao de HTML.
test("propaga o stage 'validate' reportado pelo BrainHexPDF (nao colapsa pra render)", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: "http://localhost:3002" }, async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 400,
      json: async () => ({ success: false, stage: "validate", error: "targetProfile inválido" }),
    })) as unknown as typeof fetch;

    const result = await renderAndUploadPresentationViaBrainHexPdf(
      {
        markdown: "## Aula",
        topic: "Aula 1",
        profile: "seeker",
        bucket: "conteudo_aluno",
        presentationPath: "x.html",
      },
      { fetchImpl },
    );

    assert.equal(result.failure?.stage, "validate");
  });
});

test("propaga o stage 'generate' reportado pelo BrainHexPDF (nao colapsa pra render)", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: "http://localhost:3002" }, async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 502,
      json: async () => ({ success: false, stage: "generate", error: "Gemini indisponível" }),
    })) as unknown as typeof fetch;

    const result = await renderAndUploadPresentationViaBrainHexPdf(
      {
        markdown: "## Aula",
        topic: "Aula 1",
        profile: "seeker",
        bucket: "conteudo_aluno",
        presentationPath: "x.html",
      },
      { fetchImpl },
    );

    assert.equal(result.failure?.stage, "generate");
  });
});

test("stage desconhecido reportado pelo BrainHexPDF vira 'unknown', nao 'render'", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: "http://localhost:3002" }, async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 500,
      json: async () => ({ success: false, stage: "algo-novo-nao-mapeado", error: "erro inesperado" }),
    })) as unknown as typeof fetch;

    const result = await renderAndUploadPresentationViaBrainHexPdf(
      {
        markdown: "## Aula",
        topic: "Aula 1",
        profile: "seeker",
        bucket: "conteudo_aluno",
        presentationPath: "x.html",
      },
      { fetchImpl },
    );

    assert.equal(result.failure?.stage, "unknown");
  });
});

// Timeout/AbortError real: antes so tinha cobertura via erro de rede
// generico. Aqui simula o comportamento real do fetch nativo, que rejeita
// com um AbortError quando o AbortSignal dispara.
test("timeout (AbortSignal) vira failure com stage 'network', distinto de upload/render", async () => {
  await withEnv({
    BRAINHEXPDF_API_URL: "http://localhost:3002",
    BRAINHEXPDF_TIMEOUT_MS: "20",
  }, async () => {
    const fetchImpl = ((_url: any, init: any) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const abortError = new Error("This operation was aborted");
        abortError.name = "AbortError";
        reject(abortError);
      });
    })) as unknown as typeof fetch;

    const result = await renderAndUploadPresentationViaBrainHexPdf(
      {
        markdown: "## Aula",
        topic: "Aula 1",
        profile: "seeker",
        bucket: "conteudo_aluno",
        presentationPath: "x.html",
      },
      { fetchImpl },
    );

    assert.equal(result.presentationUrl, null);
    assert.equal(result.failure?.stage, "network");
    assert.match(result.failure?.error ?? "", /aborted/i);
  });
});
