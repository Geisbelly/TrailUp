import { test } from "node:test";
import assert from "node:assert/strict";
import { addWavHeader, WAV_HEADER_BYTES } from "./wav";

function readUint32LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24);
}
function readUint16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}
function readAscii(buf: Uint8Array, offset: number, len: number): string {
  return String.fromCharCode(...Array.from(buf.subarray(offset, offset + len)));
}

test("header tem exatamente 44 bytes antes do PCM", () => {
  const pcm = new Uint8Array(100);
  const out = addWavHeader(pcm, 24000);
  assert.equal(out.length, 44 + 100);
  assert.equal(WAV_HEADER_BYTES, 44);
});

test("magic bytes RIFF/WAVE/fmt/data nos offsets corretos", () => {
  const out = addWavHeader(new Uint8Array(10), 24000);
  assert.equal(readAscii(out, 0, 4),  "RIFF");
  assert.equal(readAscii(out, 8, 4),  "WAVE");
  assert.equal(readAscii(out, 12, 4), "fmt ");
  assert.equal(readAscii(out, 36, 4), "data");
});

test("campos numericos do header (PCM 16-bit mono 24kHz)", () => {
  const pcm = new Uint8Array(2000);
  const out = addWavHeader(pcm, 24000);
  assert.equal(readUint32LE(out, 4),  36 + pcm.length, "ChunkSize");
  assert.equal(readUint32LE(out, 16), 16,              "SubChunk1Size");
  assert.equal(readUint16LE(out, 20), 1,               "AudioFormat=PCM");
  assert.equal(readUint16LE(out, 22), 1,               "NumChannels=mono");
  assert.equal(readUint32LE(out, 24), 24000,           "SampleRate");
  assert.equal(readUint32LE(out, 28), 24000 * 2,       "ByteRate");
  assert.equal(readUint16LE(out, 32), 2,               "BlockAlign");
  assert.equal(readUint16LE(out, 34), 16,              "BitsPerSample");
  assert.equal(readUint32LE(out, 40), pcm.length,      "SubChunk2Size");
});

test("PCM original é copiado intacto após o header", () => {
  const pcm = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const out = addWavHeader(pcm, 16000);
  for (let i = 0; i < pcm.length; i++) {
    assert.equal(out[44 + i], pcm[i], `byte ${i}`);
  }
});

test("sampleRate diferente atualiza ByteRate proporcionalmente", () => {
  const out = addWavHeader(new Uint8Array(0), 48000);
  assert.equal(readUint32LE(out, 24), 48000);
  assert.equal(readUint32LE(out, 28), 48000 * 2);
});

test("PCM vazio produz arquivo só com header (44 bytes)", () => {
  const out = addWavHeader(new Uint8Array(0), 24000);
  assert.equal(out.length, 44);
  assert.equal(readUint32LE(out, 4),  36);
  assert.equal(readUint32LE(out, 40), 0);
});

test("sampleRate inválido lança erro", () => {
  assert.throws(() => addWavHeader(new Uint8Array(10), 0),      /sampleRate/);
  assert.throws(() => addWavHeader(new Uint8Array(10), -1),     /sampleRate/);
  assert.throws(() => addWavHeader(new Uint8Array(10), 24000.5),/sampleRate/);
  assert.throws(() => addWavHeader(new Uint8Array(10), NaN),    /sampleRate/);
});

test("não muta o buffer PCM de entrada", () => {
  const pcm = new Uint8Array([10, 20, 30]);
  const original = new Uint8Array(pcm);
  addWavHeader(pcm, 24000);
  assert.deepEqual(Array.from(pcm), Array.from(original));
});
