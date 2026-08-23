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

/**
 * Deriva a lista de imagens a usar no markdown/audio de um topico: imagem
 * do professor sempre vence quando existe; sem nenhuma, cai pra imagem
 * gerada por IA que o BrainHexPDF devolveu (generatedImagesBySubtopic da
 * resposta de render-and-store) - ver docs/superpowers/specs/
 * 2026-08-24-imagem-gerada-fallback-markdown-audio-design.md. Sem imagem
 * nenhuma dos dois lados, retorna array vazio (comportamento pre-D2).
 */
export function deriveImagesForMedia(
  imageAttachments: MarkdownImage[],
  generatedImagesBySubtopic: Record<string, string> | undefined | null,
): MarkdownImage[] {
  if (imageAttachments.length > 0) return imageAttachments;
  if (!generatedImagesBySubtopic) return [];
  return Object.values(generatedImagesBySubtopic).map((url) => ({ url }));
}
