export interface MarkdownImage {
  url: string;
}

// Mesmo padrao de heading de nivel 2 usado em splitMarkdownByLevel2Headings
// (geminiService.ts) para dividir o markdown em partes/blocos - reaproveita
// o mesmo ponto de fronteira, sem acoplar aos dois modulos diretamente.
const LEVEL_2_HEADING_RE = /^##[ \t]+.+?[ \t]*$/gm;

/**
 * Insere uma imagem logo apos cada heading de nivel 2 (##) do markdown,
 * ciclando (round-robin) entre as imagens disponiveis - sem chamada extra
 * ao Gemini, sem nocao de "relevancia por assunto" (diferente do
 * referenceImageIndex dos slides, que o modelo escolhe). Objetivo e
 * garantir que todas as imagens do professor apareçam em algum lugar do
 * documento, nao deixar nenhuma de fora.
 */
export function insertImagesIntoMarkdown(markdown: string, images: MarkdownImage[]): string {
  if (images.length === 0) return markdown;

  const matches = [...markdown.matchAll(LEVEL_2_HEADING_RE)];
  if (matches.length === 0) return markdown;

  let result = "";
  let cursor = 0;
  matches.forEach((match, i) => {
    const headingEnd = (match.index ?? 0) + match[0].length;
    result += markdown.slice(cursor, headingEnd);
    const image = images[i % images.length];
    result += `\n\n![Imagem de referência](${image.url})`;
    cursor = headingEnd;
  });
  result += markdown.slice(cursor);
  return result;
}
