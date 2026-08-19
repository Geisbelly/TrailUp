import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reconstructMarkdownPartsFromMaterials,
  retryApresentacaoOnly,
} from "../server";
import type { MaterialEntry, GenerationFence } from "./services/supabaseService";
import type { PresentationDesignPlan } from "./constants/presentationThemes";

if (!process.env.OPENAI_API_KEY?.trim()) {
  process.env.OPENAI_API_KEY = "test-openai-key";
}

const fence: GenerationFence = {
  cicloId: "ciclo-1",
  sourceHash: "hash-1",
  generationKey: "ciclo-1:hash-1",
};

// ─── reconstructMarkdownPartsFromMaterials ────────────────────────────────

test("reconstructMarkdownPartsFromMaterials retorna null sem markdownEntry", async () => {
  const result = await reconstructMarkdownPartsFromMaterials(null);
  assert.equal(result, null);
});

test("reconstructMarkdownPartsFromMaterials retorna null sem partes", async () => {
  const markdownEntry = {
    bucket: "meu-bucket",
    payload: { markdown: "conteudo" },
    metadata: { status: "completed", media_kind: "markdown", updated_at: "x" },
    arquivo_url: "https://cdn/x",
    storage_path: "x",
  } as unknown as MaterialEntry;

  const result = await reconstructMarkdownPartsFromMaterials(markdownEntry);
  assert.equal(result, null);
});

test("reconstructMarkdownPartsFromMaterials usa o markdown inline da parte 1 sem baixar", async () => {
  const markdownEntry = {
    bucket: "meu-bucket",
    payload: { markdown: "## Parte 1\n\nConteudo da parte 1." },
    metadata: { status: "completed", media_kind: "markdown", updated_at: "x" },
    arquivo_url: "https://cdn/parte-01.md",
    storage_path: "topico/markdown/material-x.md",
    partes: [
      { ordem: 1, titulo: "Parte 1", arquivo_url: "https://cdn/parte-01.md", storage_path: "topico/markdown/material-x.md" },
    ],
  } as unknown as MaterialEntry;

  let downloadCalls = 0;
  const parts = await reconstructMarkdownPartsFromMaterials(markdownEntry, {
    downloadText: async () => {
      downloadCalls += 1;
      return "nunca deveria chamar";
    },
  });

  assert.equal(downloadCalls, 0);
  assert.deepEqual(parts, [
    { ordem: 1, titulo: "Parte 1", markdown: "## Parte 1\n\nConteudo da parte 1." },
  ]);
});

test("reconstructMarkdownPartsFromMaterials baixa partes 2+ via downloadText injetado", async () => {
  const markdownEntry = {
    bucket: "meu-bucket",
    payload: { markdown: "Conteudo parte 1." },
    metadata: { status: "completed", media_kind: "markdown", updated_at: "x" },
    arquivo_url: "https://cdn/parte-01.md",
    storage_path: "topico/markdown/material-x-parte-01.md",
    partes: [
      { ordem: 1, titulo: "Parte 1", arquivo_url: "https://cdn/parte-01.md", storage_path: "topico/markdown/material-x-parte-01.md" },
      { ordem: 2, titulo: "Parte 2", arquivo_url: "https://cdn/parte-02.md", storage_path: "topico/markdown/material-x-parte-02.md" },
    ],
  } as unknown as MaterialEntry;

  const downloaded: Array<{ bucket: string; path: string }> = [];
  const parts = await reconstructMarkdownPartsFromMaterials(markdownEntry, {
    downloadText: async (bucket: string, path: string) => {
      downloaded.push({ bucket, path });
      return "Conteudo parte 2.";
    },
  });

  assert.equal(downloaded.length, 1);
  assert.equal(downloaded[0].bucket, "meu-bucket");
  assert.equal(downloaded[0].path, "topico/markdown/material-x-parte-02.md");
  assert.deepEqual(parts, [
    { ordem: 1, titulo: "Parte 1", markdown: "Conteudo parte 1." },
    { ordem: 2, titulo: "Parte 2", markdown: "Conteudo parte 2." },
  ]);
});

test("reconstructMarkdownPartsFromMaterials retorna null se algum download falhar (regenera tudo)", async () => {
  const markdownEntry = {
    bucket: "meu-bucket",
    payload: { markdown: "Conteudo parte 1." },
    metadata: { status: "completed", media_kind: "markdown", updated_at: "x" },
    arquivo_url: "https://cdn/parte-01.md",
    storage_path: "topico/markdown/material-x-parte-01.md",
    partes: [
      { ordem: 1, titulo: "Parte 1", arquivo_url: "https://cdn/parte-01.md", storage_path: "topico/markdown/material-x-parte-01.md" },
      { ordem: 2, titulo: "Parte 2", arquivo_url: "https://cdn/parte-02.md", storage_path: "topico/markdown/material-x-parte-02.md" },
    ],
  } as unknown as MaterialEntry;

  const parts = await reconstructMarkdownPartsFromMaterials(markdownEntry, {
    downloadText: async () => null,
  });

  assert.equal(parts, null);
});

// ─── retryApresentacaoOnly ─────────────────────────────────────────────────

const presentationTheme = {} as PresentationDesignPlan;

test("retryApresentacaoOnly gera apenas a apresentacao e faz merge so dessa chave", async () => {
  const renderCalls: Array<{ markdown: string; topic: string; presentationPath: string }> = [];
  const mergeCalls: Array<{ personalizacaoId: number; updates: Record<string, unknown>; fence: GenerationFence }> = [];

  const result = await retryApresentacaoOnly(
    {
      profile: "seeker",
      storagePath: "aluno/topico",
      bucket: "meu-bucket",
      refId: "ref-1",
      parts: [{ ordem: 1, titulo: "Tema", markdown: "## Tema\n\nConteudo." }],
      presentationTheme,
      personalizacaoId: 42,
      fence,
    },
    {
      renderAndUpload: async (params: any) => {
        renderCalls.push(params);
        return { presentationUrl: "https://cdn/apresentacao.html", failure: null, dbWritten: false };
      },
      mergeMateriais: async (personalizacaoId: number, updates: any, mergeFence: GenerationFence) => {
        mergeCalls.push({ personalizacaoId, updates, fence: mergeFence });
        return {
          status: "pronto",
          generation_key: mergeFence.generationKey,
          materiais: { apresentacao: updates.apresentacao },
        };
      },
    },
  );

  assert.equal(renderCalls.length, 1);
  assert.equal(renderCalls[0].markdown, "## Tema\n\nConteudo.");
  assert.equal(renderCalls[0].topic, "Tema");
  assert.equal(renderCalls[0].presentationPath, "aluno/topico/apresentacao/material-ref-1.html");

  assert.equal(mergeCalls.length, 1);
  assert.deepEqual(Object.keys(mergeCalls[0].updates), ["apresentacao"]);
  assert.equal(mergeCalls[0].personalizacaoId, 42);

  assert.equal(result.presentationUrl, "https://cdn/apresentacao.html");
  assert.equal(result.persisted?.materiais.apresentacao.metadata.status, "completed");
});

test("retryApresentacaoOnly registra falha quando o render nao completa", async () => {
  const result = await retryApresentacaoOnly(
    {
      profile: "seeker",
      storagePath: "aluno/topico",
      bucket: "meu-bucket",
      refId: "ref-1",
      parts: [{ ordem: 1, titulo: "Tema", markdown: "## Tema\n\nConteudo." }],
      presentationTheme,
      personalizacaoId: 42,
      fence,
    },
    {
      renderAndUpload: async () => ({
        presentationUrl: null,
        failure: { stage: "upload", error: "fetch failed" },
        dbWritten: false,
      }),
      mergeMateriais: async (_id: number, updates: any) => ({
        status: "failed",
        generation_key: fence.generationKey,
        materiais: { apresentacao: updates.apresentacao },
      }),
    },
  );

  assert.equal(result.presentationUrl, null);
  assert.equal(result.persisted?.materiais.apresentacao.metadata.status, "failed");
  assert.equal((result.persisted?.materiais.apresentacao.metadata as any).error, "fetch failed");
});

test("retryApresentacaoOnly usa sufixo -parte-NN quando ha mais de uma parte", async () => {
  const paths: string[] = [];

  await retryApresentacaoOnly(
    {
      profile: "seeker",
      storagePath: "aluno/topico",
      bucket: "meu-bucket",
      refId: "ref-1",
      parts: [
        { ordem: 1, titulo: "Parte 1", markdown: "conteudo 1" },
        { ordem: 2, titulo: "Parte 2", markdown: "conteudo 2" },
      ],
      presentationTheme,
      personalizacaoId: 42,
      fence,
    },
    {
      renderAndUpload: async (params: any) => {
        paths.push(params.presentationPath);
        return { presentationUrl: `https://cdn/${params.presentationPath}`, failure: null, dbWritten: false };
      },
      mergeMateriais: async (_id: number, updates: any) => ({
        status: "pronto",
        generation_key: fence.generationKey,
        materiais: { apresentacao: updates.apresentacao },
      }),
    },
  );

  assert.deepEqual(paths, [
    "aluno/topico/apresentacao/material-ref-1-parte-01.html",
    "aluno/topico/apresentacao/material-ref-1-parte-02.html",
  ]);
});

test("retryApresentacaoOnly nao chama mergeMateriais quando todas as partes gravaram via BrainHexPDF", async () => {
  const mergeMateriaisCalls: any[] = [];
  const fakeMergeMateriais = async (id: number, updates: any, mergeFence: GenerationFence) => {
    mergeMateriaisCalls.push({ id, updates, fence: mergeFence });
    return { status: "pronto", generation_key: mergeFence.generationKey, materiais: { apresentacao: updates.apresentacao } };
  };
  const fakeRenderAndUpload = async (params: any) => ({
    presentationUrl: `https://storage/p${params.ordem}.html`,
    failure: null,
    dbWritten: true,
  });

  const result = await retryApresentacaoOnly(
    {
      profile: "mastermind",
      storagePath: "brainhex/mastermind/122",
      bucket: "conteudo_aluno",
      refId: "abc123",
      parts: [{ ordem: 1, titulo: "Aula 1", markdown: "## Aula\nConteudo" }],
      presentationTheme,
      personalizacaoId: 42,
      fence,
    },
    { renderAndUpload: fakeRenderAndUpload, mergeMateriais: fakeMergeMateriais },
  );

  assert.equal(result.presentationUrl, "https://storage/p1.html");
  assert.equal(result.persisted, null);
  assert.equal(mergeMateriaisCalls.length, 0);
});
