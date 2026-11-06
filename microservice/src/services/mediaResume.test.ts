import { test } from "node:test";
import assert from "node:assert/strict";
import {
  audioFailedOnlyForQuota,
  audioPlanFromJunction,
  buildAudioCheckpointEntry,
  buildAudioMaterialEntry,
  buildMarkdownMaterialEntry,
  imageUrlsFromMarkdown,
  planMediaResume,
  reusablePresentationPartes,
  ROTEIRO_GENERATION_KEY,
  storedAudioPlan,
} from "./mediaResume";
import { TtsNoAudioError } from "./ttsRecovery";

const KEY = "ciclo-1:hash-1";
const PATH = "brainhex/achiever/classe-68/topico-9/generation-hash-1";
const VERSIONS = { engine: "puppeteer-html-v2", media_pipeline_version: "v9", design_system: "ds-3" };

const parte = (ordem: number, tipo: string, ext: string, extra: Record<string, unknown> = {}) => ({
  ordem,
  titulo: `Parte ${ordem}`,
  arquivo_url: `https://gw/${tipo}-${ordem}`,
  storage_path: `${PATH}/${tipo}/material-1-parte-0${ordem}.${ext}`,
  ...extra,
});

const markdownPronto = {
  payload: { markdown: "## Parte 1" },
  metadata: { status: "completed", media_kind: "markdown", generation_key: KEY, updated_at: "x" },
  arquivo_url: "https://gw/markdown-1",
  storage_path: `${PATH}/markdown/material-1-parte-01.md`,
  partes: [parte(1, "markdown", "md"), parte(2, "markdown", "md")],
};

// Turma 68, Achiever: 7 de 8 partes com voz, o material inteiro saiu failed.
const audioComUmaFalha = {
  payload: { roteiro: "r1", capaUrl: "https://img/capa" },
  metadata: { status: "pending", media_kind: "audio", generation_key: KEY, [ROTEIRO_GENERATION_KEY]: KEY, updated_at: "x" },
  arquivo_url: "https://gw/audio-1",
  storage_path: `${PATH}/audio/material-1-parte-01.mp3`,
  partes: [
    parte(1, "audio", "mp3", { roteiro: "Roteiro da parte 1.", secoes: [] }),
    { ordem: 2, titulo: "Parte 2", arquivo_url: null, storage_path: null, failed: true, roteiro: "Roteiro da parte 2.", secoes: [] },
  ],
};

test("nova tentativa com o texto pronto e 1 parte de áudio sem voz: reaproveita texto e parte 1, sintetiza só a parte 2", () => {
  const plan = planMediaResume(
    { markdown: markdownPronto, audio: audioComUmaFalha },
    { storagePath: PATH, generationKey: KEY, versions: VERSIONS },
  );
  assert.equal(plan.markdownDone, true);
  assert.equal(plan.audioDone, false);
  assert.deepEqual(plan.markdownPartes?.map((p) => p.ordem), [1, 2]);
  assert.deepEqual(plan.storedAudio?.map((p) => [p.ordem, p.pronta !== null]), [[1, true], [2, false]]);
  assert.equal(plan.storedAudio?.[1].roteiro, "Roteiro da parte 2.");
});

test("arquivo de outra geração não é reaproveitado, nem com a generation_key reescrita pelo claim da API", () => {
  const outraGeracao = {
    ...markdownPronto,
    partes: [
      { ...parte(1, "markdown", "md"), storage_path: "brainhex/achiever/classe-68/topico-9/generation-velho/markdown/m.md" },
      parte(2, "markdown", "md"),
    ],
  };
  const plan = planMediaResume({ markdown: outraGeracao }, { storagePath: PATH, generationKey: KEY, versions: VERSIONS });
  assert.equal(plan.markdownPartes, null);
  assert.equal(plan.storedAudio, null);
});

test("roteiro de outra geração (marca própria diferente) não vale: o roteiro é refeito", () => {
  const audio = { ...audioComUmaFalha, metadata: { ...audioComUmaFalha.metadata, [ROTEIRO_GENERATION_KEY]: "outro:hash" } };
  assert.equal(storedAudioPlan(audio as never, KEY, PATH), null);
  const semRoteiro = { ...audioComUmaFalha, partes: [{ ...audioComUmaFalha.partes[0], roteiro: undefined }] };
  assert.equal(storedAudioPlan(semRoteiro as never, KEY, PATH), null);
});

test("roteiro guardado sem o texto dele não serve (misturaria rodadas)", () => {
  const plan = planMediaResume({ audio: audioComUmaFalha }, { storagePath: PATH, generationKey: KEY, versions: VERSIONS });
  assert.equal(plan.markdownPartes, null);
  assert.equal(plan.storedAudio, null);
});

test("apresentação: só as partes desta geração, sem falha e com o mesmo motor ficam", () => {
  const apresentacao = {
    metadata: { status: "failed", generation_key: KEY, ...VERSIONS },
    partes: [
      parte(1, "apresentacao", "html"),
      { ordem: 2, titulo: "Parte 2", arquivo_url: null, storage_path: null, failed: true },
      parte(3, "apresentacao", "html"),
      parte(4, "apresentacao", "html"),
    ],
  };
  assert.deepEqual(
    reusablePresentationPartes(apresentacao as never, PATH, VERSIONS, 3).map((p) => p.ordem),
    [1, 3],
  );
  const motorNovo = { ...VERSIONS, engine: "puppeteer-html-v3" };
  assert.deepEqual(reusablePresentationPartes(apresentacao as never, PATH, motorNovo, 3), []);
});

test("checkpoint do áudio grava o roteiro de cada parte, pending, com a marca da geração", () => {
  const plan = audioPlanFromJunction([
    { ordem: 1, titulo: "A", audioScript: "Fala A.", sectionBoundaries: [] },
    { ordem: 2, titulo: "B", audioScript: "Fala B.", sectionBoundaries: [] },
  ]);
  const entry = buildAudioCheckpointEntry({ plan, generationKey: KEY, bucket: "conteudo_aluno" });
  assert.equal(entry.metadata.status, "pending");
  assert.equal((entry.metadata as Record<string, unknown>)[ROTEIRO_GENERATION_KEY], KEY);
  assert.deepEqual(entry.partes?.map((p) => [(p as { roteiro?: string }).roteiro, p.arquivo_url]), [["Fala A.", null], ["Fala B.", null]]);
  assert.equal(entry.payload?.roteiro, "Fala A.");
});

test("entrada final do áudio junta a parte reaproveitada com a sintetizada agora, e falha guarda o motivo por parte", () => {
  const plan = storedAudioPlan(audioComUmaFalha as never, KEY, PATH)!;
  const ok = buildAudioMaterialEntry({
    plan,
    synthesized: new Map([[2, { ordem: 2, titulo: "Parte 2", arquivo_url: "https://gw/audio-2", storage_path: `${PATH}/audio/m-02.mp3` }]]),
    failures: [],
    generationKey: KEY,
    bucket: "conteudo_aluno",
    payloadExtras: { capaUrl: "https://img/capa" },
  });
  assert.equal(ok.metadata.status, "completed");
  assert.deepEqual(ok.partes?.map((p) => p.arquivo_url), ["https://gw/audio-1", "https://gw/audio-2"]);
  assert.equal(ok.mime_type, "audio/mpeg");

  const falhou = buildAudioMaterialEntry({
    plan,
    synthesized: new Map(),
    failures: [{ ordem: 2, motivo: "429 per day" }],
    generationKey: KEY,
    bucket: "conteudo_aluno",
  });
  assert.equal(falhou.metadata.status, "failed");
  assert.match(String((falhou.metadata as Record<string, unknown>).failure_reason), /1\/2.*parte 2: 429 per day/);
  // O roteiro continua salvo: a próxima tentativa sintetiza só a parte 2.
  assert.equal((falhou.partes?.[1] as { roteiro?: string }).roteiro, "Roteiro da parte 2.");
  assert.equal(falhou.partes?.[0].arquivo_url, "https://gw/audio-1");
});

test("texto do checkpoint é pending (a parte 1 ainda pode ganhar a imagem do deck); o final é completed", () => {
  const partes = markdownPronto.partes;
  assert.equal(
    buildMarkdownMaterialEntry({ partes, firstMarkdown: "x", generationKey: KEY, bucket: "b", checkpoint: true }).metadata.status,
    "pending",
  );
  assert.equal(buildMarkdownMaterialEntry({ partes, firstMarkdown: "x", generationKey: KEY, bucket: "b" }).metadata.status, "completed");
  assert.equal(
    buildMarkdownMaterialEntry({ partes: [{ ...partes[0], arquivo_url: null }], firstMarkdown: "x", generationKey: KEY, bucket: "b" }).metadata.status,
    "failed",
  );
});

test("audioFailedOnlyForQuota: cota do dia e 402 sim; cota por minuto, sem áudio ou mistura, não", () => {
  const diaria = new Error('429 RESOURCE_EXHAUSTED quotaId "GenerateRequestsPerDayPerProjectPerModel"');
  const credito = new Error('{"error":{"code":402,"message":"Your prepayment credits are depleted"}}');
  const embrulhado = new Error("falha na parte 2", { cause: diaria });
  assert.equal(audioFailedOnlyForQuota([diaria, credito, embrulhado]), true);
  assert.equal(audioFailedOnlyForQuota([new Error("429 RESOURCE_EXHAUSTED per minute")]), false);
  assert.equal(audioFailedOnlyForQuota([diaria, new TtsNoAudioError("sem voz")]), false);
  assert.equal(audioFailedOnlyForQuota([]), false);
});

test("imageUrlsFromMarkdown: na ordem, sem repetir e sem o SVG de diagrama gerado", () => {
  const md = "![a](https://img/1)\n![b](data:image/svg+xml;base64,AAA)\n![c](https://img/2)\n![d](https://img/1)";
  assert.deepEqual(imageUrlsFromMarkdown(md), ["https://img/1", "https://img/2"]);
});
