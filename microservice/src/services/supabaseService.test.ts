import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMaterialEntries } from "./supabaseService";

const baseParams = {
  markdown:    "# Título\nConteúdo",
  audioScript: "roteiro de áudio",
  audioMp3Url: null as string | null,
  markdownUrl: null as string | null,
  apresentacao: null as null | { url: string; storagePath: string; bucket: string; slideCount: number },
  audioMime:   "audio/mpeg",
  audioPath:   "brainhex/seeker/classe-1/audio/material-1.mp3",
  mdPath:      "brainhex/seeker/classe-1/markdown/material-1.md",
  bucket:      "conteudo_aluno",
};

// ── apresentacao ────────────────────────────────────────────────────────────

test("apresentacao: null -> entry failed, sem bucket/mime_type no topo", () => {
  const entries = buildMaterialEntries({ ...baseParams, apresentacao: null });
  const entry = entries.apresentacao;

  assert.equal(entry.metadata.status, "failed");
  assert.equal(entry.arquivo_url, null);
  assert.equal(entry.storage_path, null);
  assert.equal(entry.payload, null);
  assert.equal("bucket" in entry, false);
  assert.equal("mime_type" in entry, false);
  assert.equal("bucket" in entry.metadata, false);
});

test("apresentacao: populado -> entry completed com url/storage_path/bucket/mime_type", () => {
  const apresentacao = {
    url:         "https://supabase.local/storage/v1/object/public/conteudo_aluno/x.html",
    storagePath: "brainhex/seeker/classe-1/apresentacao/material-1.html",
    bucket:      "conteudo_aluno",
    slideCount:  9,
  };
  const entries = buildMaterialEntries({ ...baseParams, apresentacao });
  const entry = entries.apresentacao;

  assert.equal(entry.metadata.status, "completed");
  assert.equal(entry.arquivo_url, apresentacao.url);
  assert.equal(entry.storage_path, apresentacao.storagePath);
  assert.equal(entry.bucket, apresentacao.bucket);
  assert.equal(entry.mime_type, "text/html; charset=utf-8");
  assert.deepEqual(entry.payload, { url: apresentacao.url, slide_count: apresentacao.slideCount });
  assert.equal(entry.metadata.bucket, apresentacao.bucket);
});

// ── audio ────────────────────────────────────────────────────────────────────

test("audio: audioMp3Url null -> entry failed", () => {
  const entries = buildMaterialEntries({ ...baseParams, audioMp3Url: null });
  const entry = entries.audio;

  assert.equal(entry.metadata.status, "failed");
  assert.equal(entry.arquivo_url, null);
  assert.equal(entry.storage_path, null);
  assert.equal("bucket" in entry.metadata, false);
  // bucket/mime_type no topo são sempre presentes (contrato atual do entry)
  assert.equal(entry.bucket, baseParams.bucket);
  assert.equal(entry.mime_type, baseParams.audioMime);
});

test("audio: audioMp3Url populado -> entry completed com url/storage_path/bucket", () => {
  const audioMp3Url = "https://supabase.local/storage/v1/object/public/conteudo_aluno/audio.mp3";
  const entries = buildMaterialEntries({ ...baseParams, audioMp3Url });
  const entry = entries.audio;

  assert.equal(entry.metadata.status, "completed");
  assert.equal(entry.arquivo_url, audioMp3Url);
  assert.equal(entry.storage_path, baseParams.audioPath);
  assert.equal(entry.bucket, baseParams.bucket);
  assert.equal(entry.mime_type, baseParams.audioMime);
  assert.equal(entry.metadata.bucket, baseParams.bucket);
  assert.deepEqual(entry.payload, { roteiro: baseParams.audioScript, texto: baseParams.audioScript });
});

// ── markdown ─────────────────────────────────────────────────────────────────

test("markdown: markdownUrl null -> entry failed", () => {
  const entries = buildMaterialEntries({ ...baseParams, markdownUrl: null });
  const entry = entries.markdown;

  assert.equal(entry.metadata.status, "failed");
  assert.equal(entry.arquivo_url, null);
  assert.equal(entry.storage_path, null);
  assert.equal("bucket" in entry.metadata, false);
});

test("markdown: markdownUrl populado -> entry completed com url/storage_path/bucket", () => {
  const markdownUrl = "https://supabase.local/storage/v1/object/public/conteudo_aluno/md.md";
  const entries = buildMaterialEntries({ ...baseParams, markdownUrl });
  const entry = entries.markdown;

  assert.equal(entry.metadata.status, "completed");
  assert.equal(entry.arquivo_url, markdownUrl);
  assert.equal(entry.storage_path, baseParams.mdPath);
  assert.equal(entry.bucket, baseParams.bucket);
  assert.equal(entry.mime_type, "text/markdown; charset=utf-8");
  assert.equal(entry.metadata.bucket, baseParams.bucket);
  assert.deepEqual(entry.payload, { texto: baseParams.markdown, markdown: baseParams.markdown });
});
