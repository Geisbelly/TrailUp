import assert from "node:assert/strict";
import test from "node:test";

import { estimateAudioDurationSec } from "./audioDuration";

test("MP3 (CBR 128kbps mono 24kHz): duracao = bytes / 16000", () => {
  const bytes = Buffer.alloc(160_000); // 10 segundos exatos a 16000 bytes/s
  const mp3Base64 = bytes.toString("base64");
  assert.equal(estimateAudioDurationSec(mp3Base64, null), 10);
});

test("WAV (PCM 24kHz/16-bit/mono, header de 44 bytes): desconta o header antes de dividir por 48000", () => {
  const pcmBytes = Buffer.alloc(480_000); // 10 segundos exatos a 48000 bytes/s
  const wavBytes = Buffer.concat([Buffer.alloc(44), pcmBytes]);
  const wavBase64 = wavBytes.toString("base64");
  assert.equal(estimateAudioDurationSec(null, wavBase64), 10);
});

test("prefere mp3Base64 quando os dois estao presentes (mesma prioridade ja usada no resto do pipeline)", () => {
  const mp3Bytes = Buffer.alloc(16_000); // 1 segundo em MP3
  const wavBytes = Buffer.concat([Buffer.alloc(44), Buffer.alloc(480_000)]); // 10s em WAV
  assert.equal(estimateAudioDurationSec(mp3Bytes.toString("base64"), wavBytes.toString("base64")), 1);
});

test("sem mp3Base64 nem wavBase64: retorna null", () => {
  assert.equal(estimateAudioDurationSec(null, null), null);
});
