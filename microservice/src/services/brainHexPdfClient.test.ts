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
