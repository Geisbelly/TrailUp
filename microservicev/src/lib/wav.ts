// Adiciona header RIFF/WAVE de 44 bytes em frente a um buffer PCM cru.
// Necessário porque o Gemini TTS retorna PCM 16-bit mono sem header,
// e <audio> no browser exige o container WAV.
//
// Formato (PCM 16-bit, mono):
//   00..03 "RIFF"
//   04..07 ChunkSize = 36 + dataLen
//   08..11 "WAVE"
//   12..15 "fmt "
//   16..19 SubChunk1Size = 16
//   20..21 AudioFormat = 1 (PCM)
//   22..23 NumChannels = 1
//   24..27 SampleRate
//   28..31 ByteRate = SampleRate * 2
//   32..33 BlockAlign = 2
//   34..35 BitsPerSample = 16
//   36..39 "data"
//   40..43 SubChunk2Size = dataLen
//   44..   PCM data

export const WAV_HEADER_BYTES = 44;

export function addWavHeader(pcmData: Uint8Array, sampleRate: number): Uint8Array {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error(`sampleRate inválido: ${sampleRate}`);
  }

  const header = new ArrayBuffer(WAV_HEADER_BYTES);
  const d = new DataView(header);

  // "RIFF"
  d.setUint8(0, 0x52); d.setUint8(1, 0x49); d.setUint8(2, 0x46); d.setUint8(3, 0x46);
  d.setUint32(4, 36 + pcmData.length, true);
  // "WAVE"
  d.setUint8(8, 0x57); d.setUint8(9, 0x41); d.setUint8(10, 0x56); d.setUint8(11, 0x45);
  // "fmt "
  d.setUint8(12, 0x66); d.setUint8(13, 0x6d); d.setUint8(14, 0x74); d.setUint8(15, 0x20);
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true);              // PCM
  d.setUint16(22, 1, true);              // Mono
  d.setUint32(24, sampleRate, true);
  d.setUint32(28, sampleRate * 2, true); // ByteRate (1 ch * 2 B/sample * sampleRate)
  d.setUint16(32, 2, true);              // BlockAlign
  d.setUint16(34, 16, true);             // BitsPerSample
  // "data"
  d.setUint8(36, 0x64); d.setUint8(37, 0x61); d.setUint8(38, 0x74); d.setUint8(39, 0x61);
  d.setUint32(40, pcmData.length, true);

  const result = new Uint8Array(WAV_HEADER_BYTES + pcmData.length);
  result.set(new Uint8Array(header), 0);
  result.set(pcmData, WAV_HEADER_BYTES);
  return result;
}
