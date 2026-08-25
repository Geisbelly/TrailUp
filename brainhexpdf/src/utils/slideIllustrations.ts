import type { SlideData } from '../types';
import { ImageGenerationUnavailableError } from './imageGenerationErrors';
import { canSendAsGeminiInlineData } from './geminiInlineImageMimes';

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

const PROFILE_PALETTES: Record<string, { bg: string; stroke: string; accent: string; node: string; name: string; env: string }> = {
  achiever: { bg: '#1c1508', stroke: '#d97706', accent: '#f59e0b', node: '#fbbf24', name: 'Alvorada Dourada', env: 'Câmara Real & Tronos de Ouro' },
  seeker: { bg: '#081c15', stroke: '#059669', accent: '#10b981', node: '#34d399', name: 'Observatório Místico', env: 'Santuário Cósmico & Astrolábio' },
  mastermind: { bg: '#150824', stroke: '#7c3aed', accent: '#8b5cf6', node: '#a78bfa', name: 'Torre Arcana', env: 'Laboratório Alquímico & Runas Celestiais' },
  conqueror: { bg: '#240808', stroke: '#dc2626', accent: '#ef4444', node: '#f87171', name: 'Fortaleza Imperial', env: 'Sala de Guerra & Estandartes de Aço' },
  socializer: { bg: '#081c24', stroke: '#0284c7', accent: '#0ea5e9', node: '#38bdf8', name: 'Guilda da Távola', env: 'Távola Redonda & Salão dos Bardos' },
  daredevil: { bg: '#241008', stroke: '#ea580c', accent: '#f97316', node: '#fb923c', name: 'Forja do Dragão', env: 'Fornalha Vulcânica & Lâminas Flamejantes' },
  survivor: { bg: '#18181b', stroke: '#71717a', accent: '#a1a1aa', node: '#e4e4e7', name: 'Baluarte de Ferro', env: 'Bastilha Inexpugnável & Escudos de Pedra' },
};

function createFallbackIllustrationSvg(slide: SlideData, profile?: string): string {
  const pKey = (profile || 'mastermind').toLowerCase();
  const c = PROFILE_PALETTES[pKey] || PROFILE_PALETTES.mastermind;
  const title = escapeXml(slide.subtopic || slide.title || 'Exemplo Visual Didático');
  const objective = escapeXml(slide.pedagogicalObjective || slide.writtenExample?.title || 'Estudo Aplicado & Conceito');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
    <defs>
      <radialGradient id="cardGlow" cx="50%" cy="35%" r="70%">
        <stop offset="0%" stop-color="${c.stroke}" stop-opacity="0.35" />
        <stop offset="65%" stop-color="${c.bg}" stop-opacity="0.95" />
        <stop offset="100%" stop-color="#050508" stop-opacity="1" />
      </radialGradient>
      <linearGradient id="gradLine" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${c.stroke}" stop-opacity="0.2" />
        <stop offset="50%" stop-color="${c.accent}" stop-opacity="0.9" />
        <stop offset="100%" stop-color="${c.stroke}" stop-opacity="0.2" />
      </linearGradient>
    </defs>
    <rect width="600" height="400" rx="16" fill="url(#cardGlow)" stroke="${c.stroke}" stroke-width="1.8" />
    
    <!-- Subtle architectural background lines -->
    <g opacity="0.12">
      <line x1="40" y1="80" x2="560" y2="80" stroke="${c.accent}" stroke-width="1" stroke-dasharray="4 4" />
      <line x1="40" y1="180" x2="560" y2="180" stroke="${c.accent}" stroke-width="1" stroke-dasharray="4 4" />
      <line x1="40" y1="280" x2="560" y2="280" stroke="${c.accent}" stroke-width="1" stroke-dasharray="4 4" />
      <line x1="160" y1="40" x2="160" y2="340" stroke="${c.accent}" stroke-width="1" stroke-dasharray="4 4" />
      <line x1="300" y1="40" x2="300" y2="340" stroke="${c.accent}" stroke-width="1" stroke-dasharray="4 4" />
      <line x1="440" y1="40" x2="440" y2="340" stroke="${c.accent}" stroke-width="1" stroke-dasharray="4 4" />
    </g>

    <!-- Top Badge -->
    <rect x="30" y="24" width="190" height="24" rx="6" fill="${c.stroke}" fill-opacity="0.25" stroke="${c.stroke}" stroke-width="1" />
    <text x="40" y="40" fill="${c.node}" font-family="sans-serif" font-size="10" font-weight="bold">✦ EXEMPLO VISUAL DIDÁTICO</text>

    <!-- Central Conceptual Flow Diagram -->
    <g transform="translate(30, 75)">
      <!-- Box 1: Entrada / Conceito -->
      <rect x="10" y="30" width="135" height="75" rx="10" fill="#0d0d12" stroke="${c.stroke}" stroke-width="1.5" />
      <rect x="10" y="30" width="135" height="20" rx="10" fill="${c.stroke}" fill-opacity="0.2" />
      <text x="22" y="44" fill="${c.node}" font-family="sans-serif" font-size="10" font-weight="bold">1. FUNDAMENTO</text>
      <text x="22" y="70" fill="#ffffff" font-family="sans-serif" font-size="11" font-weight="bold">Premissa</text>
      <text x="22" y="88" fill="#a1a1aa" font-family="sans-serif" font-size="9">Dados de Entrada</text>

      <!-- Connector 1 -->
      <path d="M 150 67 L 185 67 M 180 62 L 188 67 L 180 72" stroke="${c.accent}" stroke-width="2" fill="none" />

      <!-- Box 2: Núcleo / Transformação (Highlighted) -->
      <rect x="190" y="15" width="160" height="105" rx="12" fill="${c.stroke}" fill-opacity="0.25" stroke="${c.node}" stroke-width="2" />
      <rect x="190" y="15" width="160" height="22" rx="12" fill="${c.stroke}" fill-opacity="0.4" />
      <text x="202" y="30" fill="${c.node}" font-family="sans-serif" font-size="10" font-weight="bold">2. MECANISMO CHAVE</text>
      <text x="202" y="60" fill="#ffffff" font-family="sans-serif" font-size="12" font-weight="bold">${title.slice(0, 16)}</text>
      <text x="202" y="80" fill="#e4e4e7" font-family="sans-serif" font-size="9.5">Processamento Central</text>
      <circle cx="330" cy="95" r="7" fill="${c.accent}" fill-opacity="0.3" />
      <text x="328" y="98" fill="${c.node}" font-family="sans-serif" font-size="9" font-weight="bold">✦</text>

      <!-- Connector 2 -->
      <path d="M 355 67 L 390 67 M 385 62 L 393 67 L 385 72" stroke="${c.accent}" stroke-width="2" fill="none" />

      <!-- Box 3: Aplicação / Resultado -->
      <rect x="395" y="30" width="135" height="75" rx="10" fill="#0d0d12" stroke="${c.stroke}" stroke-width="1.5" />
      <rect x="395" y="30" width="135" height="20" rx="10" fill="${c.stroke}" fill-opacity="0.2" />
      <text x="407" y="44" fill="${c.node}" font-family="sans-serif" font-size="10" font-weight="bold">3. RESULTADO</text>
      <text x="407" y="70" fill="#ffffff" font-family="sans-serif" font-size="11" font-weight="bold">Aplicação</text>
      <text x="407" y="88" fill="#a1a1aa" font-family="sans-serif" font-size="9">Impacto Prático</text>
    </g>

    <!-- Bottom Study Insight Container -->
    <rect x="30" y="245" width="540" height="120" rx="12" fill="#09090d" fill-opacity="0.95" stroke="${c.stroke}" stroke-width="1.2" stroke-opacity="0.5" />
    <path d="M 30 245 L 570 245" stroke="url(#gradLine)" stroke-width="1.5" />
    
    <circle cx="55" cy="275" r="12" fill="${c.stroke}" fill-opacity="0.4" />
    <text x="50" y="279" fill="${c.node}" font-family="sans-serif" font-size="12" font-weight="bold">✦</text>
    <text x="78" y="278" fill="#ffffff" font-family="sans-serif" font-size="12.5" font-weight="bold">${title}</text>
    <text x="78" y="304" fill="#d4d4d8" font-family="sans-serif" font-size="10.5">${objective.slice(0, 90)}</text>
    <text x="78" y="332" fill="${c.accent}" font-family="sans-serif" font-size="9" font-weight="bold">Guia de Estudo Visual • Arquétipo ${c.name} (${profile?.toUpperCase() || 'BRAINHEX'})</text>
  </svg>`;

  const base64 = typeof Buffer !== 'undefined'
    ? Buffer.from(svg, 'utf-8').toString('base64')
    : btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}

function buildRestylePrompt(slide: SlideData, profile?: string): string {
  const pKey = (profile || 'mastermind').toLowerCase();
  const c = PROFILE_PALETTES[pKey] || PROFILE_PALETTES.mastermind;
  return (
    `Reestilize esta imagem técnica/educativa de referência adaptando a iluminação, atmosfera e estética visual para o perfil BrainHex "${profile || 'Mastermind'}" (${c.env}), mantendo o foco em tons de ${c.accent} e contrastes nítidos. ` +
    `Mantenha rigorosamente o conceito pedagógico, os elementos do diagrama, o fluxo ou o exemplo técnico que ela ilustra para o tema "${slide.subtopic || slide.title}". ` +
    'Gere uma imagem nítida, de alta resolução, limpa e educativa, sem ruído visual.'
  );
}

function buildIllustrationPrompt(slide: SlideData, profile?: string, topic?: string): string {
  const pKey = (profile || 'mastermind').toLowerCase();
  const c = PROFILE_PALETTES[pKey] || PROFILE_PALETTES.mastermind;
  const firstParagraph = (slide.contentParagraphs || [])[0] || '';
  const writtenEx = slide.writtenExample?.explanation || '';
  return (
    `Infográfico conceitual, diagrama de arquitetura ou ilustração educativa clara e didática representando o conceito técnico: "${slide.subtopic || slide.title}" (${topic || 'Material Educacional'}). ` +
    `Contexto de estudo: ${firstParagraph.slice(0, 220)}. ${writtenEx ? `Aplicação: ${writtenEx.slice(0, 150)}.` : ''} ` +
    `Estilo visual: Arte conceitual técnica e nítida, atmosfera imersiva de ${c.env}, iluminação volumétrica com acentos em ${c.accent} e ${c.node}. ` +
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

