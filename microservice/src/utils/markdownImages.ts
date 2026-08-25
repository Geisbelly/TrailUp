import {
  assignImagesToSections,
  type RelatableImage,
  type RelatableSection,
} from "./imageTextGraph";

export interface MarkdownImage {
  url: string;
  /** Nome do arquivo de origem - sinal fraco de assunto, mas util. */
  name?: string;
  /** Texto do slide de onde a imagem veio (.pptx) - o sinal forte. */
  sourceText?: string;
  /** Posicao no material de origem. */
  sourceOrder?: number;
}

// Mesmo padrao de heading de nivel 2 usado em splitMarkdownByLevel2Headings
// (geminiService.ts) para dividir o markdown em partes/blocos - reaproveita
// o mesmo ponto de fronteira, sem acoplar aos dois modulos diretamente.
const LEVEL_2_HEADING_RE = /^##[ \t]+.+?[ \t]*$/gm;

function imagemMarkdown(image: MarkdownImage): string {
  return `![Imagem de referência](${image.url})`;
}

/**
 * Coloca as imagens do professor ao longo do markdown, cada uma na secao que
 * fala do MESMO assunto (ver imageTextGraph.ts).
 *
 * Era rodizio: a lista de imagens era ciclada secao a secao, sem nocao nenhuma
 * de assunto. Com menos imagens que secoes - o caso normal - a mesma imagem
 * reaparecia secao atras de secao, e como o deck recebe as imagens da sua parte
 * do markdown, a repeticao ia junto pros slides. Era a origem do "a mesma
 * imagem em tudo".
 *
 * Agora: nenhuma imagem entra duas vezes, e secao sem afinidade fica sem
 * imagem. O que sobra (mais imagens que secoes, ou imagem que nao casou com
 * nada) vai pro fim do documento em vez de ser descartado - a garantia de que
 * nenhuma imagem do professor se perde continua valendo.
 */
export function insertImagesIntoMarkdown(markdown: string, images: MarkdownImage[]): string {
  if (images.length === 0) return markdown;

  const matches = [...markdown.matchAll(LEVEL_2_HEADING_RE)];

  // Sem heading nenhum nao ha secao a que relacionar: tudo vai pro fim.
  if (matches.length === 0) {
    return `${markdown}\n\n${images.map(imagemMarkdown).join("\n\n")}`;
  }

  const secoes: RelatableSection[] = matches.map((match, i) => {
    const inicio = (match.index ?? 0) + match[0].length;
    const fim = i + 1 < matches.length ? matches[i + 1].index ?? markdown.length : markdown.length;
    return {
      title: match[0].replace(/^##\s*/, "").trim(),
      body: markdown.slice(inicio, fim),
    };
  });

  const relacionaveis: RelatableImage[] = images.map((img) => ({
    url: img.url,
    name: img.name,
    sourceText: img.sourceText,
    sourceOrder: img.sourceOrder,
  }));

  const { bySection, unmatched } = assignImagesToSections(relacionaveis, secoes);

  let rebuilt = "";
  let cursor = 0;
  matches.forEach((match, i) => {
    const headingEnd = (match.index ?? 0) + match[0].length;
    rebuilt += markdown.slice(cursor, headingEnd);
    for (const imageIndex of bySection.get(i) ?? []) {
      rebuilt += `\n\n${imagemMarkdown(images[imageIndex])}`;
    }
    cursor = headingEnd;
  });
  rebuilt += markdown.slice(cursor);

  if (unmatched.length > 0) {
    rebuilt += `\n\n${unmatched.map((i) => imagemMarkdown(images[i])).join("\n\n")}`;
  }

  return rebuilt;
}

// ![alt](data:image/png;base64,XXXX) - so data URI de imagem interessa aqui.
const MARKDOWN_DATA_URI_IMAGE_RE = /!\[[^\]]*\]\((data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+))\)/gi;

/**
 * Reconstroi a lista de imagens do professor a partir de um markdown ja
 * persistido. Serve pro caminho de retentativa da apresentacao
 * (retryApresentacaoOnly), que recebe so as partes de markdown gravadas -
 * sem isso ele rerenderizava o deck com attachments vazio e o material
 * refeito saia sem nenhuma imagem do professor, caindo no fallback de IA/SVG
 * mesmo com as imagens estando ali, embutidas no proprio markdown.
 *
 * So recupera imagem embutida (data URI, caso das imagens extraidas de
 * .pptx/.docx). Imagem referenciada por URL fica de fora de proposito:
 * precisaria de download pra virar base64, e este caminho nao faz rede.
 * Deduplica por URL por seguranca, ainda que a colocacao por afinidade nao
 * repita mais a mesma imagem em secoes diferentes.
 */
export function extractAttachmentsFromMarkdown(
  markdown: string,
): Array<{ data: string; mimeType: string; name: string; url: string }> {
  if (!markdown) return [];

  const vistos = new Set<string>();
  const attachments: Array<{ data: string; mimeType: string; name: string; url: string }> = [];

  for (const match of markdown.matchAll(MARKDOWN_DATA_URI_IMAGE_RE)) {
    const [, url, mimeType, data] = match;
    // SVG no markdown nao vem do professor: e diagrama que o proprio pipeline
    // gerou a partir da arte ASCII (ver flowDiagram.ts). Reaproveitar isso como
    // "imagem de referencia" do professor mandaria o diagrama pro deck como se
    // fosse material base - e a extracao de .pptx/.docx nem aceita svg.
    if (mimeType.toLowerCase() === "image/svg+xml") continue;
    if (vistos.has(url)) continue;
    vistos.add(url);
    attachments.push({
      data,
      mimeType: mimeType.toLowerCase(),
      name: `markdown-imagem-${attachments.length + 1}`,
      url,
    });
  }

  return attachments;
}

/**
 * Recorta a lista de imagens do professor pra uma fatia (parte) do markdown:
 * devolve so as que aparecem naquela fatia. Usado pra dar a cada parte do
 * deck (1 chamada ao BrainHexPDF por parte) as imagens da sua propria secao,
 * em vez de mandar a lista inteira pra todas as partes - o modelo processa
 * cada parte isoladamente, entao com a lista inteira toda parte reencontrava
 * a mesma imagem "obviamente relevante" e ela acabava em todo slide do
 * material, enquanto as demais nao apareciam em nenhum.
 *
 * A fatia e a mesma fronteira que o aluno le: insertImagesIntoMarkdown roda
 * ANTES da divisao em partes, entao a imagem que ilustra a secao no texto e
 * a que ilustra os slides daquela secao. Preserva a ordem da lista original
 * (nao a ordem de aparicao no texto), porque o indice dentro dessa lista e o
 * que o BrainHexPDF usa como referenceImageIndex.
 */
export function selectAttachmentsForMarkdown<T extends { url?: string }>(
  markdown: string,
  attachments: T[],
): T[] {
  if (!markdown || attachments.length === 0) return [];
  return attachments.filter((a) => Boolean(a.url) && markdown.includes(a.url as string));
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
