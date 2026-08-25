export interface SectionBoundary {
  globalIndex: number;
  title: string;
  charStart: number;
  charEnd: number;
}

export interface ImageCue {
  startSec: number;
  imageUrl: string;
}

/**
 * Estima a minutagem de inicio de cada secao proporcionalmente ao tamanho
 * de texto dela dentro do audio (sem nenhum corte real no audio - so
 * matematica sobre a duracao total ja conhecida). Reaproveita o MESMO
 * indice global da secao usado por insertImagesIntoMarkdown (markdownImages.ts)
 * pro round-robin de imagens, garantindo que a imagem exibida no audio pra
 * uma secao seja a mesma ja inserida no markdown daquela secao.
 */
export function computeImageCues(
  sectionBoundaries: SectionBoundary[] | undefined,
  durationSec: number | null,
  images: Array<{ url: string }>,
): ImageCue[] {
  if (!sectionBoundaries || sectionBoundaries.length === 0) return [];
  if (!durationSec || durationSec <= 0) return [];
  if (images.length === 0) return [];

  const totalChars = sectionBoundaries[sectionBoundaries.length - 1].charEnd;
  if (totalChars <= 0) return [];

  return sectionBoundaries.map((boundary) => ({
    startSec: durationSec * (boundary.charStart / totalChars),
    imageUrl: images[boundary.globalIndex % images.length].url,
  }));
}
