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

const fence = { cicloId: "ciclo-1", sourceHash: "hash-abc", generationKey: "ciclo-1:hash-abc" };
const versionMetadata = { engine: "e", schema: "s", design_system: "d", media_pipeline_version: "m" };

test("retorna failure render quando BRAINHEXPDF_API_URL nao configurado", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: undefined }, async () => {
    const result = await renderAndUploadPresentationViaBrainHexPdf({
      markdown: "## Aula\nConteudo",
      topic: "Aula 1",
      profile: "mastermind",
      bucket: "conteudo_aluno",
      presentationPath: "brainhex/mastermind/topico/apresentacao/material-1.html",
      personalizacaoId: 42,
      fence,
      versionMetadata,
      ordem: 1,
      totalPartes: 1,
      titulo: "Aula 1",
    });
    assert.equal(result.presentationUrl, null);
    assert.equal(result.failure?.stage, "render");
    assert.equal(result.dbWritten, false);
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
        personalizacaoId: 42,
        fence,
        versionMetadata,
        ordem: 1,
        totalPartes: 1,
        titulo: "Aula 1",
      },
      { fetchImpl },
    );

    assert.equal(result.presentationUrl, "https://storage/x.html");
    assert.equal(result.failure, null);
    assert.equal(result.dbWritten, false); // fake response nao inclui dbWritten:true
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
        personalizacaoId: 42,
        fence,
        versionMetadata,
        ordem: 1,
        totalPartes: 1,
        titulo: "Aula 1",
      },
      { fetchImpl },
    );

    assert.equal(result.presentationUrl, null);
    assert.equal(result.failure?.stage, "upload");
    assert.match(result.failure?.error ?? "", /bucket cheio/);
    assert.equal(result.dbWritten, false);
  });
});

test("manda personalizacaoId/fence/versionMetadata/ordem/totalPartes no corpo e le dbWritten da resposta", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: "http://localhost:3002" }, async () => {
    let capturedBody: any = null;
    const fetchImpl = (async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          url: "https://storage/x.html",
          storage_path: "a/b.html",
          bucket: "conteudo_aluno",
          slide_count: 8,
          dbWritten: true,
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
        personalizacaoId: 42,
        fence,
        versionMetadata: { engine: "brainhexpdf-v1", schema: "v2", design_system: "v3", media_pipeline_version: "2026-08-16.1" },
        ordem: 1,
        totalPartes: 1,
        titulo: "Aula 1",
      },
      { fetchImpl },
    );

    assert.equal(result.dbWritten, true);
    assert.equal(capturedBody.personalizacaoId, 42);
    assert.equal(capturedBody.cicloId, "ciclo-1");
    assert.equal(capturedBody.sourceHash, "hash-abc");
    assert.equal(capturedBody.ordem, 1);
    assert.equal(capturedBody.totalPartes, 1);
    assert.deepEqual(capturedBody.presentationVersionMetadata, {
      engine: "brainhexpdf-v1", schema: "v2", design_system: "v3", media_pipeline_version: "2026-08-16.1",
    });
  });
});

test("dbWritten fica false quando a chamada falha por timeout/rede", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: undefined }, async () => {
    const result = await renderAndUploadPresentationViaBrainHexPdf({
      markdown: "## Aula",
      topic: "Aula 1",
      profile: "mastermind",
      bucket: "conteudo_aluno",
      presentationPath: "x.html",
      personalizacaoId: 42,
      fence,
      versionMetadata,
      ordem: 1,
      totalPartes: 1,
      titulo: "Aula 1",
    });
    assert.equal(result.dbWritten, false);
  });
});
