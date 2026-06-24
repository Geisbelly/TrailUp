// Enriquece slides retornados pelo Gemini com:
//  - titulo normalizado (prefere `title`, cai em `titulo`, default "")
//  - imagem_referencia como data URL (apenas se houver imagem para o índice)

export interface SlideLike {
  title?:               string;
  titulo?:              string;
  imagem_referencia?:   string;
}

export function enrichSlidesWithImages<T extends SlideLike>(
  slides: T[],
  images: string[]
): (T & { titulo: string; imagem_referencia?: string })[] {
  return slides.map((s, i) => {
    const img = i < images.length ? images[i] : "";
    return {
      ...s,
      titulo: s.title ?? s.titulo ?? "",
      ...(img ? { imagem_referencia: `data:image/png;base64,${img}` } : {}),
    };
  });
}
