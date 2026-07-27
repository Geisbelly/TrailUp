// Enriquece slides retornados pelo Gemini com:
//  - titulo normalizado (prefere `title`, cai em `titulo`, default "")
//  - imagem_referencia como data URL (apenas se houver imagem para o índice)
//  - icones como array de data URLs (cena de fundo é OpenAI, ícones são Gemini —
//    ver generateSlideAssets em server.ts; aqui só empacota o que já foi gerado)

export interface SlideLike {
  title?:               string;
  titulo?:              string;
  imagem_referencia?:   string;
}

export function enrichSlidesWithImages<T extends SlideLike>(
  slides: T[],
  images: string[],
  iconImagesPerSlide: string[][] = []
): (T & { titulo: string; imagem_referencia?: string; icones: string[] })[] {
  return slides.map((s, i) => {
    const img = i < images.length ? images[i] : "";
    const icons = (i < iconImagesPerSlide.length ? iconImagesPerSlide[i] : [])
      .filter((icon) => icon)
      .map((icon) => `data:image/png;base64,${icon}`);
    return {
      ...s,
      titulo: s.title ?? s.titulo ?? "",
      ...(img ? { imagem_referencia: `data:image/png;base64,${img}` } : {}),
      icones: icons,
    };
  });
}
