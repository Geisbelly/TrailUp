// De qual slide veio cada imagem do .pptx - e, portanto, qual texto e o
// contexto dela.
//
// Um .pptx guarda as imagens todas juntas em ppt/media/, sem nada no nome que
// diga a que assunto pertencem (image1.png, image2.png...). A ligacao existe,
// mas mora em outro lugar: cada ppt/slides/slideN.xml referencia a imagem por
// um id de relacionamento (<a:blip r:embed="rId3"/>) e
// ppt/slides/_rels/slideN.xml.rels traduz esse id pro arquivo em media/.
//
// Esse par (imagem -> texto do slide onde ela estava) e o vinculo REAL do
// material do professor, e e o que permite depois colocar cada imagem na secao
// que fala do mesmo assunto, em vez de distribuir por rodizio - a causa de "a
// mesma imagem em tudo".
//
// Parsing por regex (nao XML parser completo) pra seguir o mesmo padrao leve ja
// usado no resto do servico (ver pptxSlideOrder.ts).

/** Ids de relacionamento referenciados por um slide (r:embed / r:link). */
export function parseSlideImageRelIds(slideXml: string): string[] {
  const ids: string[] = [];
  const padrao = /r:(?:embed|link)="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = padrao.exec(slideXml)) !== null) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}

/** rId -> caminho do arquivo em ppt/media, so pra relacionamento de imagem. */
export function parseSlideImageRels(relsXml: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const tags = relsXml.match(/<Relationship\b[^>]*\/?>/gi) ?? [];
  for (const tag of tags) {
    const id = tag.match(/\bId="([^"]+)"/i)?.[1];
    const target = tag.match(/\bTarget="([^"]+)"/i)?.[1];
    if (!id || !target) continue;
    // "../media/image3.png" -> "ppt/media/image3.png". Imagem externa (http)
    // fica de fora: nao ha bytes no pacote pra ela.
    const normalizado = target.replace(/^\.\.\//, "").replace(/^\/+/, "");
    if (!/^media\/[^/]+$/i.test(normalizado)) continue;
    mapa.set(id, `ppt/${normalizado}`);
  }
  return mapa;
}

/** Texto visivel de um slide (<a:t>), na ordem em que aparece. */
export function parseSlideText(slideXml: string): string {
  const trechos = slideXml.match(/<a:t>([^<]*)<\/a:t>/g) ?? [];
  return trechos
    .map((t) => t.replace(/<\/?a:t>/g, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ImageSourceContext {
  /** Texto do slide onde a imagem aparecia - o contexto dela no material. */
  sourceText: string;
  /** Posicao do slide na ordem real da apresentacao (1-based). */
  sourceOrder: number;
}

/**
 * Monta o mapa "arquivo de midia -> contexto" a partir dos slides ja na ordem
 * real. Imagem repetida em varios slides (logo do rodape, por exemplo) fica com
 * o texto de todos eles concatenado - o que, alias, e o proprio sinal de que
 * ela NAO pertence a um assunto especifico.
 */
export function buildImageSourceContexts(
  slides: Array<{ slideXml: string; relsXml: string }>,
): Map<string, ImageSourceContext> {
  const contextos = new Map<string, ImageSourceContext>();

  slides.forEach(({ slideXml, relsXml }, indice) => {
    const rels = parseSlideImageRels(relsXml);
    const texto = parseSlideText(slideXml);
    for (const relId of parseSlideImageRelIds(slideXml)) {
      const arquivo = rels.get(relId);
      if (!arquivo) continue;
      const existente = contextos.get(arquivo);
      if (existente) {
        existente.sourceText = `${existente.sourceText} ${texto}`.trim();
        continue;
      }
      contextos.set(arquivo, { sourceText: texto, sourceOrder: indice + 1 });
    }
  });

  return contextos;
}
