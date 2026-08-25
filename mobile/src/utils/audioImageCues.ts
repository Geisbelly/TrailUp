/**
 * Cue de imagem por minutagem estimada do audio (ver computeImageCues em
 * microservice/src/utils/audioImageCues.ts - minutagem ESTIMADA por
 * proporcao de texto, nao um corte real no audio).
 */
export interface ImageCue {
  startSec: number;
  imageUrl: string;
}

export function parseImageCues(raw: unknown): ImageCue[] | null {
  if (!Array.isArray(raw)) return null;

  const cues: ImageCue[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const obj = item as Record<string, unknown>;
    if (typeof obj.startSec !== "number" || !Number.isFinite(obj.startSec)) return null;
    if (typeof obj.imageUrl !== "string" || !obj.imageUrl.trim()) return null;
    cues.push({ startSec: obj.startSec, imageUrl: obj.imageUrl });
  }

  return cues.sort((a, b) => a.startSec - b.startSec);
}
