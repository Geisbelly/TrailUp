import { WAV_HEADER_BYTES } from "../lib/wav";

// Formatos fixos do pipeline de audio (Mp3Encoder(1, 24000, 128) e
// addWavHeader(pcmBuffer, 24000) em geminiService.ts/src/lib/wav.ts) - NAO
// alterados por este arquivo, so lidos aqui pra calcular duracao a partir
// do tamanho em bytes do arquivo ja pronto, sem decodificar nem tocar o
// audio.
const MP3_BYTES_PER_SECOND = 128_000 / 8; // 128kbps CBR mono 24kHz
const WAV_BYTES_PER_SECOND = 24_000 * 2;  // 24kHz, 16-bit, mono

/**
 * Estima a duracao (em segundos) do audio final a partir do tamanho em
 * bytes do arquivo ja gerado - nao decodifica nem sintetiza nada, so le um
 * numero que ja existe. Mesma prioridade mp3/wav ja usada no resto do
 * pipeline (mp3Base64 ?? wavBase64).
 */
export function estimateAudioDurationSec(mp3Base64: string | null, wavBase64: string | null): number | null {
  if (mp3Base64) {
    const bytes = Buffer.from(mp3Base64, "base64").length;
    return bytes / MP3_BYTES_PER_SECOND;
  }
  if (wavBase64) {
    const bytes = Buffer.from(wavBase64, "base64").length;
    return Math.max(0, bytes - WAV_HEADER_BYTES) / WAV_BYTES_PER_SECOND;
  }
  return null;
}
