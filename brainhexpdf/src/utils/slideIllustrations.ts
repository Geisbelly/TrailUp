import type { SlideData } from '../types';
import { ImageGenerationUnavailableError } from './imageGenerationErrors';
import { canSendAsGeminiInlineData } from './geminiInlineImageMimes';
import { PROFILE_SIGNATURES, buildDeckColorTokens, profileKeyOf } from './deckTheme';

// generateInteractiveHtml (deckExportUtils.ts) nunca inclui referenceImageHtml
// no bodyHtml desses tipos (layout centralizado, sem coluna de imagem) -
// atribuir uma imagem adicional a eles seria dado morto, nunca renderizado.
const NON_IMAGE_SLIDE_TYPES = new Set(['cover', 'epic_conclusion', 'reward_certificate']);

export interface ImageAttachment {
  mimeType: string;
  dataBase64: string;
  name?: string;
}

export interface GeneratedImage {
  mimeType: string;
  dataBase64: string;
}

export type ImageGenerator = (params: {
  prompt: string;
  referenceImage?: { mimeType: string; data: string };
}) => Promise<GeneratedImage | null>;

function dataUri(mimeType: string, dataBase64: string): string {
  return `data:${mimeType};base64,${dataBase64}`;
}

function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// So o nome e o ambiente do arquetipo. A cor NAO mora aqui: vem de
// deckTheme.ts (PROFILE_SIGNATURES, espelho de microservice/src/constants/brainHex.ts).
// Esta tabela tinha cores proprias, e o Socializer era pedido "em tons de
// #0ea5e9" (azul) num deck coral.
const PROFILE_PALETTES: Record<string, { name: string; env: string }> = {
  achiever: { name: 'Alvorada Dourada', env: 'Câmara Real & Tronos de Ouro' },
  seeker: { name: 'Observatório Místico', env: 'Santuário Cósmico & Astrolábio' },
  mastermind: { name: 'Torre Arcana', env: 'Laboratório Alquímico & Runas Celestiais' },
  conqueror: { name: 'Fortaleza Imperial', env: 'Sala de Guerra & Estandartes de Aço' },
  socializer: { name: 'Guilda da Távola', env: 'Távola Redonda & Salão dos Bardos' },
  daredevil: { name: 'Forja do Dragão', env: 'Fornalha Vulcânica & Lâminas Flamejantes' },
  survivor: { name: 'Baluarte de Ferro', env: 'Bastilha Inexpugnável & Escudos de Pedra' },
};

/** Marca do SVG de reserva: o export do deck o reconhece e desenha inline. */
export const FALLBACK_ILLUSTRATION_MARKER = 'data-trailup-exemplo-didatico';

/**
 * Quebra o texto em ate `maxLines` linhas de ate `maxChars` caracteres, sem
 * cortar palavra; a ultima linha ganha reticencias se sobrar texto. Antes o
 * titulo era `slice(0, 16)` - "A Essência da Di".
 */
export function wrapSvgText(text: string, maxChars: number, maxLines: number): string[] {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  let i = 0;
  for (; i < words.length; i += 1) {
    const word = words[i];
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (lines.length === maxLines) break;
    current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
  }
  if (lines.length < maxLines && current) {
    lines.push(current);
    i = words.length;
  }
  if (i < words.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
  }
  return lines;
}

function tspans(lines: string[], x: number, lineHeight: number): string {
  return lines
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
}

/**
 * SVG de reserva do "Exemplo visual didático" (quando nao ha imagem do
 * professor nem ilustracao gerada).
 *
 * As cores sao as do deck (deckTheme.ts), nao uma paleta propria: esta funcao
 * tinha a sua, e o Socializer saia azul-ceu (#0ea5e9) num deck coral
 * (#f4623a), com caixas escuras fixas mesmo no modo claro. Cada cor e'
 * `var(--token, <valor do modo escuro>)`: inline no deck, as variaveis do
 * tema valem e o desenho segue o perfil e o claro/escuro; como <img> (editor,
 * PDF), o valor de reserva e' o token do modo escuro do mesmo perfil.
 */
export function buildFallbackIllustrationSvgMarkup(slide: SlideData, profile?: string, idSuffix = '0'): string {
  const key = profileKeyOf(profile);
  const t = buildDeckColorTokens(key, 'dark');
  const v = (name: string, fallback: string) => `var(--${name}, ${fallback})`;
  const accent = v('accent', t.accent);
  const ink = v('ink', t.ink);
  const muted = v('ink-muted', t.inkMuted);
  const surface = v('surface', t.surface);
  const surface2 = v('surface-2', t.surface2);
  const surfaceAccent = v('surface-accent', t.surfaceAccent);
  const border = v('border', t.border);
  const borderStrong = v('border-strong', t.borderStrong);
  const id = String(idSuffix).replace(/[^a-zA-Z0-9_-]/g, '');
  const titleText = slide.subtopic || slide.title || 'Exemplo Visual Didático';
  const objectiveText = slide.pedagogicalObjective || slide.writtenExample?.title || 'Estudo Aplicado & Conceito';
  const profileLabel = (profile || key).toUpperCase();
  const font = 'font-family="system-ui, -apple-system, Segoe UI, sans-serif"';

  return `<svg xmlns="http://www.w3.org/2000/svg" ${FALLBACK_ILLUSTRATION_MARKER}="1" viewBox="0 0 600 400" width="100%" height="100%" role="img" aria-label="${escapeXml(titleText)}">
    <defs>
      <linearGradient id="exemplo-linha-${id}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:${accent};stop-opacity:0.15" />
        <stop offset="50%" style="stop-color:${accent};stop-opacity:0.9" />
        <stop offset="100%" style="stop-color:${accent};stop-opacity:0.15" />
      </linearGradient>
    </defs>
    <rect width="600" height="400" rx="16" style="fill:${surface};stroke:${borderStrong};stroke-width:1.8" />
    <g style="opacity:0.18">
      <line x1="40" y1="80" x2="560" y2="80" style="stroke:${accent}" stroke-dasharray="4 4" />
      <line x1="40" y1="180" x2="560" y2="180" style="stroke:${accent}" stroke-dasharray="4 4" />
      <line x1="160" y1="40" x2="160" y2="230" style="stroke:${accent}" stroke-dasharray="4 4" />
      <line x1="440" y1="40" x2="440" y2="230" style="stroke:${accent}" stroke-dasharray="4 4" />
    </g>

    <rect x="30" y="24" width="200" height="24" rx="6" style="fill:${surfaceAccent};stroke:${border}" />
    <text x="40" y="40" ${font} font-size="10" font-weight="bold" style="fill:${accent}">✦ EXEMPLO VISUAL DIDÁTICO</text>

    <g transform="translate(30, 75)">
      <rect x="10" y="30" width="135" height="75" rx="10" style="fill:${surface2};stroke:${border};stroke-width:1.5" />
      <text x="22" y="46" ${font} font-size="10" font-weight="bold" style="fill:${accent}">1. FUNDAMENTO</text>
      <text x="22" y="70" ${font} font-size="11" font-weight="bold" style="fill:${ink}">Premissa</text>
      <text x="22" y="88" ${font} font-size="9.5" style="fill:${muted}">Dados de Entrada</text>

      <path d="M 150 67 L 185 67 M 180 62 L 188 67 L 180 72" style="stroke:${accent};stroke-width:2;fill:none" />

      <rect x="190" y="10" width="160" height="115" rx="12" style="fill:${surfaceAccent};stroke:${accent};stroke-width:2" />
      <text x="202" y="28" ${font} font-size="10" font-weight="bold" style="fill:${accent}">2. MECANISMO CHAVE</text>
      <text x="202" y="50" ${font} font-size="11.5" font-weight="bold" style="fill:${ink}">${tspans(wrapSvgText(titleText, 22, 3), 202, 15)}</text>
      <text x="202" y="112" ${font} font-size="9.5" style="fill:${muted}">Processamento Central</text>

      <path d="M 355 67 L 390 67 M 385 62 L 393 67 L 385 72" style="stroke:${accent};stroke-width:2;fill:none" />

      <rect x="395" y="30" width="135" height="75" rx="10" style="fill:${surface2};stroke:${border};stroke-width:1.5" />
      <text x="407" y="46" ${font} font-size="10" font-weight="bold" style="fill:${accent}">3. RESULTADO</text>
      <text x="407" y="70" ${font} font-size="11" font-weight="bold" style="fill:${ink}">Aplicação</text>
      <text x="407" y="88" ${font} font-size="9.5" style="fill:${muted}">Impacto Prático</text>
    </g>

    <rect x="30" y="235" width="540" height="140" rx="12" style="fill:${surface2};stroke:${border};stroke-width:1.2" />
    <path d="M 42 235 L 558 235" style="stroke:url(#exemplo-linha-${id});stroke-width:1.5" />
    <circle cx="55" cy="263" r="12" style="fill:${surfaceAccent};stroke:${border}" />
    <text x="50" y="267" ${font} font-size="12" font-weight="bold" style="fill:${accent}">✦</text>
    <text x="78" y="267" ${font} font-size="12.5" font-weight="bold" style="fill:${ink}">${tspans(wrapSvgText(titleText, 70, 2), 78, 16)}</text>
    <text x="78" y="310" ${font} font-size="10.5" style="fill:${ink}">${tspans(wrapSvgText(objectiveText, 88, 2), 78, 14)}</text>
    <text x="78" y="358" ${font} font-size="9" font-weight="bold" style="fill:${accent}">Guia de Estudo Visual • Arquétipo ${escapeXml(PROFILE_PALETTES[key]?.name || '')} (${escapeXml(profileLabel)})</text>
  </svg>`;
}

function createFallbackIllustrationSvg(slide: SlideData, profile?: string): string {
  const svg = buildFallbackIllustrationSvgMarkup(slide, profile);
  const base64 = typeof Buffer !== 'undefined'
    ? Buffer.from(svg, 'utf-8').toString('base64')
    : btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}

/** O data URI e' o SVG de reserva gerado aqui (e nao uma imagem do professor)? */
export function isFallbackIllustrationUri(uri: unknown): boolean {
  if (typeof uri !== 'string' || !uri.startsWith('data:image/svg+xml;base64,')) return false;
  try {
    const b64 = uri.slice('data:image/svg+xml;base64,'.length);
    const head = typeof Buffer !== 'undefined'
      ? Buffer.from(b64.slice(0, 400), 'base64').toString('utf-8')
      : atob(b64.slice(0, 400));
    return head.includes(`${FALLBACK_ILLUSTRATION_MARKER}="1"`);
  } catch {
    return false;
  }
}

function buildRestylePrompt(slide: SlideData, profile?: string): string {
  const key = profileKeyOf(profile);
  const c = PROFILE_PALETTES[key];
  const cor = PROFILE_SIGNATURES[key];
  return (
    `Reestilize esta imagem técnica/educativa de referência adaptando a iluminação, atmosfera e estética visual para o perfil BrainHex "${profile || 'Mastermind'}" (${c.env}), mantendo o foco em tons da cor ${cor} e contrastes nítidos. ` +
    `Mantenha rigorosamente o conceito pedagógico, os elementos do diagrama, o fluxo ou o exemplo técnico que ela ilustra para o tema "${slide.subtopic || slide.title}". ` +
    'Gere uma imagem nítida, de alta resolução, limpa e educativa, sem ruído visual.'
  );
}

function buildIllustrationPrompt(slide: SlideData, profile?: string, topic?: string): string {
  const key = profileKeyOf(profile);
  const c = PROFILE_PALETTES[key];
  const cor = PROFILE_SIGNATURES[key];
  const firstParagraph = (slide.contentParagraphs || [])[0] || '';
  const writtenEx = slide.writtenExample?.explanation || '';
  return (
    `Infográfico conceitual, diagrama de arquitetura ou ilustração educativa clara e didática representando o conceito técnico: "${slide.subtopic || slide.title}" (${topic || 'Material Educacional'}). ` +
    `Contexto de estudo: ${firstParagraph.slice(0, 220)}. ${writtenEx ? `Aplicação: ${writtenEx.slice(0, 150)}.` : ''} ` +
    `Estilo visual: Arte conceitual técnica e nítida, atmosfera imersiva de ${c.env}, iluminação volumétrica com acentos na cor ${cor} (cor-assinatura do perfil), sem trocar por outra matiz. ` +
    'Composição limpa, alto valor para orientar os estudos do aluno, sem poluição visual nem textos ilegíveis.'
  );
}

/**
 * Resolve o referenceImageIndex escolhido pelo Gemini (reaproveita como
 * está, ou reilustra com base na imagem original quando
 * restyleReferenceImage=true) e, para todos os demais subtópicos que ainda
 * não possuem imagem, gera uma ilustração temática personalizada no estilo do perfil,
 * garantindo que cada slide possua um exemplo visual didático.
 */
export async function resolveSlideIllustrations(
  slides: SlideData[],
  attachments: ImageAttachment[] = [],
  generateImage: ImageGenerator,
  options?: {
    targetProfile?: string;
    topic?: string;
  },
): Promise<SlideData[]> {
  if (!Array.isArray(slides)) return slides;

  const targetProfile = options?.targetProfile || 'Mastermind';
  const topic = options?.topic || 'Material Educacional';

  // Uma vez detectado billing/quota estruturalmente esgotado (ver
  // ImageGenerationUnavailableError), para de chamar generateImage pro
  // resto do deck inteiro - repetir a mesma chamada fadada a falhar por
  // subtopico so soma chamadas de API inuteis e ruido de log.
  let generationUnavailable = false;

  const resolved: SlideData[] = [];
  // Rastreia quais indices de attachment ja foram usados no deck inteiro e
  // por qual subtopico, pra evitar que o modelo (que processa cada slide
  // isoladamente) concentre a mesma imagem "obviamente relevante" em varios
  // subtopicos diferentes enquanto outras imagens do professor nunca
  // aparecem em nenhum slide.
  const usedIndices = new Set<number>();
  const usedIndicesBySubtopic = new Map<string, number>();
  for (const slide of slides) {
    let index = (slide as any).referenceImageIndex;
    let restyle = (slide as any).restyleReferenceImage === true;

    const hasValidIndex =
      typeof index === 'number' &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < attachments.length;

    const subtopicKey = typeof slide.subtopic === 'string' ? slide.subtopic.trim() : '';

    if (!hasValidIndex) {
      // Gemini nao escolheu nenhuma imagem pra este slide. Sem imagens do
      // professor pra recorrer, nao ha padrao possivel - segue sem imagem
      // (a etapa seguinte cobre isso via ilustracao tematica/SVG).
      if (attachments.length === 0) {
        resolved.push(slide);
        continue;
      }
      const reuseSameSubtopic = subtopicKey ? usedIndicesBySubtopic.get(subtopicKey) : undefined;
      if (reuseSameSubtopic !== undefined) {
        // Mesmo subtopico que ja recebeu imagem (ex.: "Sockets - Parte 1/2" e
        // "Parte 2/2"): reusa, e o mesmo assunto.
        index = reuseSameSubtopic;
      } else {
        // Subtopico novo: recebe uma imagem SO se ainda houver alguma nunca
        // usada no deck - e cobertura do material do professor. Esgotadas
        // todas, o slide fica SEM imagem em vez de herdar a primeira: cada
        // foto do professor ilustra um contexto especifico, e repeti-la em
        // todo slide restante (o que acontecia com o padrao antigo
        // "index = 0") espalhava a mesma imagem pelo material inteiro,
        // inclusive onde ela nao tem nada a ver com o assunto.
        const nextUnused = attachments.findIndex((_, i) => !usedIndices.has(i));
        if (nextUnused === -1) {
          resolved.push(slide);
          continue;
        }
        index = nextUnused;
      }
      // Atribuicao padrao nunca reestiliza - restyleReferenceImage e uma
      // escolha deliberada do Gemini sobre UMA imagem especifica que ele
      // selecionou, nao se aplica a uma imagem que nem foi escolhida por ele.
      restyle = false;
    } else {
      // Reuso pelo MESMO subtopico (ex.: "DNS parte 1" e "DNS parte 2") e
      // legitimo e nao e alterado. So redireciona quando um subtopico
      // DIFERENTE repete um indice ja usado e ainda sobra alguma imagem
      // nunca usada no deck inteiro - prioriza cobertura de todas as
      // imagens do professor sobre relevancia estrita alem do basico.
      const reuseSameSubtopic = Boolean(subtopicKey) && usedIndicesBySubtopic.get(subtopicKey) === index;
      if (!reuseSameSubtopic && usedIndices.has(index) && usedIndices.size < attachments.length) {
        const nextUnused = attachments.findIndex((_, i) => !usedIndices.has(i));
        if (nextUnused !== -1) index = nextUnused;
      }
    }
    usedIndices.add(index);
    if (subtopicKey) usedIndicesBySubtopic.set(subtopicKey, index);

    const attachment = attachments[index];
    if (!attachment || !attachment.mimeType || !attachment.dataBase64) {
      resolved.push(slide);
      continue;
    }

    // Reestilizar manda a imagem original pro modelo como referencia: em
    // formato que a API nao aceita (gif/bmp), a chamada falharia e cairia no
    // catch pra usar a original de qualquer jeito - melhor nem gastar a
    // chamada.
    if (!restyle || generationUnavailable || !canSendAsGeminiInlineData(attachment.mimeType)) {
      resolved.push({ ...slide, referenceImageDataUri: dataUri(attachment.mimeType, attachment.dataBase64) });
      continue;
    }

    try {
      const styled = await generateImage({
        prompt: buildRestylePrompt(slide, targetProfile),
        referenceImage: { mimeType: attachment.mimeType, data: attachment.dataBase64 },
      });
      resolved.push({
        ...slide,
        referenceImageDataUri: styled
          ? dataUri(styled.mimeType, styled.dataBase64)
          : dataUri(attachment.mimeType, attachment.dataBase64),
      });
    } catch (err) {
      if (err instanceof ImageGenerationUnavailableError) generationUnavailable = true;
      resolved.push({
        ...slide,
        referenceImageDataUri: dataUri(attachment.mimeType, attachment.dataBase64),
      });
    }
  }

  // Mais imagens do professor que slides do deck: o loop acima da 1 imagem
  // PRIMARIA por slide, entao alguns indices de attachment nunca sao
  // escolhidos por nenhum slide - em vez de deixa-los de fora do deck
  // inteiro, distribui os que sobraram como imagens ADICIONAIS (grid) nos
  // slides que ja tem uma primaria, em round-robin. Nunca reestiliza (so
  // usa o attachment original) e nunca vai pra cover/epic_conclusion/
  // reward_certificate (esses tipos nao renderizam nenhuma imagem no HTML
  // exportado - ver generateInteractiveHtml).
  if (attachments.length > 0 && usedIndices.size < attachments.length) {
    const leftoverIndices = attachments.map((_, i) => i).filter((i) => !usedIndices.has(i));
    const eligibleSlides = resolved.filter(
      (slide) => !NON_IMAGE_SLIDE_TYPES.has(slide.type) && Boolean(slide.referenceImageDataUri),
    );

    if (eligibleSlides.length > 0) {
      leftoverIndices.forEach((attachmentIndex, i) => {
        const attachment = attachments[attachmentIndex];
        if (!attachment || !attachment.mimeType || !attachment.dataBase64) return;
        const targetSlide = eligibleSlides[i % eligibleSlides.length] as any;
        const uri = dataUri(attachment.mimeType, attachment.dataBase64);
        targetSlide.additionalReferenceImageDataUris = [...(targetSlide.additionalReferenceImageDataUris || []), uri];
      });
    }
  }

  // Para slides conceituais que ainda não possuem imagem de referência,
  // gera 1 ilustração educativa por subtópico único para guiar o estudo.
  // Só se aplica quando NÃO há attachments do professor (aí só os caminhos
  // 1/2 acima - reaproveitar/reilustrar por referenceImageIndex - valem).
  // Chave de agrupamento: subtopic quando presente, senão title - o schema
  // pede subtopic em todo slide, mas o Gemini as vezes devolve string vazia
  // na pratica; sem esse fallback, TODO slide sem subtopic ficava sem
  // nenhuma imagem (nem IA nem SVG de ultimo recurso) - causa raiz real de
  // decks inteiros saindo sem nenhuma ilustracao.
  const seenGroupKeys = new Set<string>();
  const final: SlideData[] = [];
  for (const slide of resolved) {
    if (slide.referenceImageDataUri) {
      final.push(slide);
      continue;
    }

    const subtopic = typeof slide.subtopic === 'string' ? slide.subtopic.trim() : '';
    const title = typeof slide.title === 'string' ? slide.title.trim() : '';
    const groupKey = subtopic || title;
    if (attachments.length > 0 || !groupKey) {
      final.push(slide);
      continue;
    }

    // Não duplica geração para exatamente o mesmo subtópico/título
    if (seenGroupKeys.has(groupKey)) {
      final.push(slide);
      continue;
    }
    seenGroupKeys.add(groupKey);

    if (generationUnavailable) {
      final.push({
        ...slide,
        referenceImageDataUri: createFallbackIllustrationSvg(slide, targetProfile),
      });
      continue;
    }

    try {
      const generated = await generateImage({
        prompt: buildIllustrationPrompt(slide, targetProfile, topic),
      });
      if (generated && generated.mimeType && generated.dataBase64) {
        final.push({
          ...slide,
          referenceImageDataUri: dataUri(generated.mimeType, generated.dataBase64),
        });
      } else {
        // Fallback visual SVG com as cores e estrutura do perfil
        final.push({
          ...slide,
          referenceImageDataUri: createFallbackIllustrationSvg(slide, targetProfile),
        });
      }
    } catch (err) {
      if (err instanceof ImageGenerationUnavailableError) generationUnavailable = true;
      final.push({
        ...slide,
        referenceImageDataUri: createFallbackIllustrationSvg(slide, targetProfile),
      });
    }
  }
  return final;
}

const SVG_DATA_URI_PREFIX = 'data:image/svg+xml';

/**
 * Extrai um mapa subtopic -> imagem gerada por IA (1a ocorrencia de cada
 * subtopico), pra devolver na resposta de /api/v1/render-and-store e o
 * microservice (TrailUp) poder usar a mesma imagem como fallback no
 * markdown/audio quando o professor nao anexou nenhuma imagem propria (ver
 * docs/superpowers/specs/2026-08-24-imagem-gerada-fallback-markdown-audio-design.md).
 * So inclui imagens de verdade (geradas via IA) - o SVG generico de ultimo
 * recurso (createFallbackIllustrationSvg) e propositalmente excluido, pois
 * reusa-lo em markdown/audio so espalharia o mesmo problema (imagem
 * desconectada do conteudo) pra mais superficies.
 */
export function extractGeneratedImagesBySubtopic(slides: SlideData[]): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(slides)) return result;

  for (const slide of slides) {
    const subtopic = typeof slide.subtopic === 'string' ? slide.subtopic.trim() : '';
    const uri = (slide as any).referenceImageDataUri;
    if (!subtopic || typeof uri !== 'string' || uri.startsWith(SVG_DATA_URI_PREFIX)) continue;
    if (!result[subtopic]) result[subtopic] = uri;
  }

  return result;
}

