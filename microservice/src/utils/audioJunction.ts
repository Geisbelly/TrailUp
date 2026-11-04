import type { BrainHexProfile } from "../constants/brainHex";

// Junção de blocos do áudio (#652): o que vai para o TTS sai daqui, não da
// divisão do markdown.
//
// Antes, cada parte de áudio era a fatia do roteiro que cabia na parte de
// markdown correspondente. Duas coisas davam errado, medidas em produção
// (turmas 66 e 68):
// - quando um título "## …" do roteiro não batia com o do markdown, o roteiro
//   inteiro era cortado por proporção de caracteres, no meio da palavra e até
//   no meio da tag ("…[Tom" numa parte e ": Alerta] …" na outra). Foi assim
//   em 7 de 15 materiais. No diálogo, sobrava linha sem o "Nome: " de quem fala;
// - as partes de áudio seguiam o tamanho do TEXTO (4.500 caracteres de
//   markdown), e o roteiro de cada uma ficava com 1.000 a 2.800 caracteres:
//   7 ou 8 chamadas de TTS por perfil, cada uma um ponto de falha e um gasto
//   da cota free.
//
// Aqui o roteiro de cada capítulo (um por bloco pedagógico, gerado junto com o
// markdown dele) é limpo e as seções são juntadas, em ordem, em partes do
// tamanho que o TTS aguenta. Corte só acontece entre seções, parágrafos ou
// frases, nunca no meio de palavra. O app e o console tratam as partes de
// áudio como lista própria (título e "Parte X de N"), sem amarrar à parte de
// markdown, então elas não precisam ter a mesma contagem.
//
// Junção por BLOCO, não por tamanho (03/11). A versão acima empacotava as
// seções em ordem até ~3.600 caracteres, sem saber de que bloco cada uma
// vinha: o número de áudios era só o comprimento do roteiro dividido pelo
// alvo. Medido no conteúdo 282 (turma 68): socializer e survivor com 8 blocos
// de texto e 2 áudios; daredevil 7 e 7, por acaso. Os títulos "## …" que o
// modelo escreve também não servem para agrupar — o survivor repetiu "O que é
// uma fração" nas 12 seções.
//
// Agora o ponto de partida é uma parte por bloco pedagógico do perfil. Bloco
// só se junta ao vizinho quando é curto demais para ficar sozinho E é
// continuação dele (mesmo bloco ou mesmo tópico do enriquecimento), sem passar
// do teto. Bloco longo nunca absorve o seguinte só porque cabe. O tamanho
// muda por perfil (AUDIO_JUNCTION_CONFIG_POR_PERFIL).
//
// Custo: o TTS cobra por caractere, e juntar não muda a soma de caracteres.
// Juntar economiza CHAMADAS, que é o limite do free tier (pedidos por dia).
// Por isso a junção só junta o que é curto, e não tudo o que cabe.

export interface AudioJunctionSegment {
  /** Título da seção (o "## …" do roteiro). Vai para a minutagem de imagem. */
  titulo: string;
  audioScript: string;
  /** Bloco pedagógico de onde a seção veio. Seções do mesmo bloco são uma
   * unidade só; sem ele, cada seção é um bloco. */
  blockId?: string;
  /** Título do bloco (o do texto), para o "Parte X de N: título" do app. */
  blockTitulo?: string;
  /** Tópico e tema do bloco no enriquecimento: dizem se um bloco é
   * continuação do anterior. */
  topico?: string;
  tema?: string;
}

export interface AudioJunctionPart {
  ordem: number;
  titulo: string;
  audioScript: string;
  /** Onde cada seção começa e termina dentro de audioScript — base da
   * minutagem de imagem (computeImageCues). */
  sectionBoundaries: Array<{ globalIndex: number; title: string; charStart: number; charEnd: number }>;
}

export interface AudioJunctionConfig {
  /** Tamanho de cada pedaço quando um bloco maior que o teto é dividido. */
  targetChars: number;
  /** Teto duro de uma parte (uma chamada de TTS). */
  maxChars: number;
  /** Bloco menor que isto é curto demais para ser um áudio sozinho: junta-se
   * ao vizinho, se for continuação dele e couber no teto. */
  minChars: number;
}

// 4.500 caracteres é o teto de uma chamada só: com a voz mais pausada
// (Mastermind, ~11 caracteres/s) dá ~7 min de áudio, abaixo do limite de
// saída do modelo de TTS. Medido em produção: um tópico de 16 mil caracteres
// de roteiro saía em 8 partes e passa a sair em 4 ou 5.
export const DEFAULT_AUDIO_JUNCTION_CONFIG: AudioJunctionConfig = {
  targetChars: 3_600,
  maxChars: 4_500,
  minChars: 1_200,
};

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

// Tamanho por perfil, pelo ritmo de cada assinatura editorial: Daredevil e
// Achiever são diretos e de ritmo rápido — áudio curto, um objetivo por vez;
// Mastermind e Seeker aceitam explicação mais longa e encadeada. Socializer é
// diálogo de duas vozes e fica no padrão. O teto nunca passa de 4.500 (limite
// de saída do TTS com a voz mais pausada, ver acima).
export const AUDIO_JUNCTION_CONFIG_POR_PERFIL: Record<BrainHexProfile, AudioJunctionConfig> = {
  daredevil: { targetChars: 2_600, maxChars: 3_600, minChars: 800 },
  achiever: { targetChars: 2_800, maxChars: 3_800, minChars: 900 },
  conqueror: { targetChars: 3_200, maxChars: 4_200, minChars: 1_000 },
  survivor: { targetChars: 3_200, maxChars: 4_200, minChars: 1_000 },
  socializer: { targetChars: 3_600, maxChars: 4_500, minChars: 1_200 },
  seeker: { targetChars: 3_800, maxChars: 4_500, minChars: 1_400 },
  mastermind: { targetChars: 4_000, maxChars: 4_500, minChars: 1_400 },
};

/**
 * Config da junção para um perfil. `AUDIO_JUNCTION_MAX_CHARS` e
 * `AUDIO_JUNCTION_TARGET_CHARS` continuam valendo como override global, por
 * cima do valor do perfil.
 */
export function resolveAudioJunctionConfig(
  environment: Record<string, string | undefined> = process.env,
  profile?: BrainHexProfile,
): AudioJunctionConfig {
  const base = (profile && AUDIO_JUNCTION_CONFIG_POR_PERFIL[profile]) || DEFAULT_AUDIO_JUNCTION_CONFIG;
  const maxChars = boundedInteger(environment.AUDIO_JUNCTION_MAX_CHARS, base.maxChars, 1_000, 6_000);
  const targetChars = Math.min(
    maxChars,
    boundedInteger(environment.AUDIO_JUNCTION_TARGET_CHARS, base.targetChars, 500, 6_000),
  );
  return {
    targetChars,
    maxChars,
    minChars: Math.min(targetChars, base.minChars),
  };
}

export interface AudioScriptStyle {
  /** Diálogo de dois Guardiões (Socializer): cada linha começa com "Nome: ". */
  speakers?: string[];
}

const HEADING_LINE_RE = /^#{1,6}[ \t]+(.+?)[ \t#]*$/;
const TAG_RE = /\[[^\]\n]{1,80}\]/g;
const TAG_ONLY_LINE_RE = /^(?:\s*\[[^\]\n]{1,80}\]\s*)+$/;
// Só o marcador visual sai; "1." de passo numerado é fala ("primeiro...").
const BULLET_RE = /^\s*[-*•]\s+/;

function speakerPrefixRe(speakers: string[]): RegExp {
  const names = speakers.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`^(?:${names})\\s*:`, "i");
}

/** Último trecho de tag de tom de um texto, para retomar o tom quando a parte
 * começa no meio de uma seção. */
function lastTag(text: string): string | null {
  const tags = text.match(TAG_RE);
  return tags ? tags[tags.length - 1] : null;
}

/**
 * Limpa o roteiro de uma seção para o TTS:
 * - tira linhas de título ("## …"), que são marcador de corte e não fala;
 * - tira ênfase e marcador de lista do markdown (o TTS lê "asterisco");
 * - junta a tag de tom que veio sozinha na linha com a fala seguinte e tira
 *   tag que sobrou no fim, sem fala depois (a seção acabaria numa instrução);
 * - no diálogo, tira as tags (o prompt do diálogo não as usa) e cola a linha
 *   sem "Nome: " na fala anterior — senão o TTS de duas vozes não sabe quem
 *   fala.
 */
export function cleanAudioScript(text: string, style: AudioScriptStyle = {}): string {
  const dialogue = Boolean(style.speakers && style.speakers.length > 0);
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\*\*|__|`/g, "").replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,;:!?])/g, "$1$2"))
    .filter((line) => !HEADING_LINE_RE.test(line.trim()));

  if (dialogue) {
    const speakerRe = speakerPrefixRe(style.speakers ?? []);
    const turns: string[] = [];
    for (const raw of lines) {
      const line = raw.replace(TAG_RE, "").replace(BULLET_RE, "").replace(/[ \t]+/g, " ").trim();
      if (!line) continue;
      if (speakerRe.test(line) || turns.length === 0) {
        turns.push(speakerRe.test(line) ? line : `${style.speakers?.[0]}: ${line}`);
      } else {
        turns[turns.length - 1] = `${turns[turns.length - 1]} ${line}`;
      }
    }
    return turns.join("\n");
  }

  const paragraphs: string[] = [];
  let current: string[] = [];
  let pendingTag = "";
  const flush = () => {
    if (current.length > 0) paragraphs.push(current.join(" "));
    current = [];
  };
  for (const raw of lines) {
    const line = raw.replace(BULLET_RE, "").replace(/[ \t]+/g, " ").trim();
    if (!line) {
      flush();
      continue;
    }
    if (TAG_ONLY_LINE_RE.test(line)) {
      // A tag vale para a fala seguinte: guarda e cola nela.
      flush();
      pendingTag = (line.match(TAG_RE) ?? []).pop() ?? "";
      continue;
    }
    if (pendingTag && current.length === 0) {
      current.push(`${pendingTag} ${line}`);
      pendingTag = "";
    } else {
      current.push(line);
    }
  }
  flush();
  // Tag no fim de um parágrafo (sem fala depois dela) também sai.
  return paragraphs
    .map((paragraph) => paragraph.replace(/(?:\s*\[[^\]\n]{1,80}\])+\s*$/, "").trim())
    .filter((paragraph) => paragraph.replace(TAG_RE, "").trim().length > 0)
    .join("\n\n");
}

/**
 * Divide um texto que não cabe numa parte, do corte mais natural ao menos:
 * parágrafo (fala, no diálogo), frase e, por último, espaço. Nunca no meio de
 * palavra.
 */
function splitOversized(text: string, maxChars: number, dialogue: boolean): string[] {
  if (text.length <= maxChars) return [text];
  const separator = dialogue ? "\n" : "\n\n";
  const units = text.split(separator);
  if (units.length > 1) {
    return packUnits(units.flatMap((unit) => splitOversized(unit, maxChars, dialogue)), maxChars, separator);
  }
  const sentences = text.split(/(?<=[.!?…])\s+/);
  if (sentences.length > 1) {
    return packUnits(sentences.flatMap((sentence) => splitOversized(sentence, maxChars, dialogue)), maxChars, " ");
  }
  const words = text.split(/\s+/);
  return packUnits(words, maxChars, " ");
}

function packUnits(units: string[], maxChars: number, separator: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const unit of units) {
    if (!unit) continue;
    const next = current ? `${current}${separator}${unit}` : unit;
    if (current && next.length > maxChars) {
      out.push(current);
      current = unit;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}

interface Piece {
  segmentIndex: number;
  titulo: string;
  text: string;
}

/** Um bloco pedagógico (ou um pedaço dele, quando passa do teto). */
interface Unit {
  key: string;
  titulo: string;
  topico: string;
  tema: string;
  pieces: Piece[];
  chars: number;
}

function normalizedKey(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function piecesChars(pieces: Piece[], separator: string): number {
  if (pieces.length === 0) return 0;
  return pieces.reduce((sum, piece) => sum + piece.text.length, 0) + separator.length * (pieces.length - 1);
}

/**
 * Divide um bloco maior que o teto em pedaços de tamanho parecido (perto de
 * `targetChars`), sem cortar seção a não ser que ela sozinha passe do teto.
 */
function splitUnit(unit: Unit, config: AudioJunctionConfig, separator: string): Unit[] {
  if (unit.chars <= config.maxChars) return [unit];
  const count = Math.max(2, Math.ceil(unit.chars / config.targetChars));
  const goal = unit.chars / count;
  const chunks: Piece[][] = [];
  let current: Piece[] = [];
  let currentChars = 0;
  for (const piece of unit.pieces) {
    const added = current.length === 0 ? piece.text.length : currentChars + separator.length + piece.text.length;
    if (current.length > 0 && (added > config.maxChars || currentChars >= goal)) {
      chunks.push(current);
      current = [];
    }
    currentChars = current.length === 0 ? piece.text.length : currentChars + separator.length + piece.text.length;
    current.push(piece);
  }
  if (current.length > 0) chunks.push(current);
  return chunks.map((pieces) => ({ ...unit, pieces, chars: piecesChars(pieces, separator) }));
}

/**
 * B continua A quando é o mesmo bloco (pedaço de um bloco dividido) ou o
 * mesmo tópico do enriquecimento. O tema só decide quando nenhum dos dois tem
 * tópico. Sem nada disso, não é continuação: na dúvida, cada bloco é um áudio.
 */
function isContinuation(a: Unit, b: Unit): boolean {
  if (a.key === b.key) return true;
  if (a.topico || b.topico) return Boolean(a.topico) && a.topico === b.topico;
  return Boolean(a.tema) && a.tema === b.tema;
}

/**
 * Junta as seções em partes de áudio. Recebe as seções já na ordem
 * pedagógica; devolve partes com no máximo `maxChars` caracteres cada.
 *
 * Uma parte por bloco. Um bloco junta-se ao vizinho só quando um dos dois é
 * curto demais (`minChars`), um continua o outro e a soma cabe no teto:
 * - o grupo ainda curto absorve o bloco seguinte;
 * - um bloco curto prefere ir com o PRÓXIMO; só volta para o anterior quando
 *   não tem com quem ir adiante (é o último, ou o seguinte não o continua).
 */
export function joinAudioBlocks(
  segments: AudioJunctionSegment[],
  config: AudioJunctionConfig = DEFAULT_AUDIO_JUNCTION_CONFIG,
  style: AudioScriptStyle = {},
): AudioJunctionPart[] {
  const dialogue = Boolean(style.speakers && style.speakers.length > 0);
  const separator = dialogue ? "\n" : "\n\n";

  const blocks: Unit[] = [];
  segments.forEach((segment, segmentIndex) => {
    const cleaned = cleanAudioScript(segment.audioScript, style);
    if (!cleaned) return;
    const key = String(segment.blockId ?? "").trim() || `#secao-${segmentIndex}`;
    let block = blocks[blocks.length - 1];
    if (!block || block.key !== key) {
      block = {
        key,
        titulo: String(segment.blockTitulo ?? "").trim() || segment.titulo,
        topico: normalizedKey(segment.topico),
        tema: normalizedKey(segment.tema),
        pieces: [],
        chars: 0,
      };
      blocks.push(block);
    }
    let activeTag: string | null = null;
    for (const chunk of splitOversized(cleaned, config.maxChars, dialogue)) {
      // Pedaço que começa no meio da seção herda o tom que estava valendo.
      const text = !dialogue && activeTag && !/^\s*\[/.test(chunk) && `${activeTag} ${chunk}`.length <= config.maxChars
        ? `${activeTag} ${chunk}`
        : chunk;
      block.pieces.push({ segmentIndex, titulo: segment.titulo, text });
      activeTag = lastTag(chunk) ?? activeTag;
    }
    block.chars = piecesChars(block.pieces, separator);
  });

  const units = blocks.flatMap((block) => splitUnit(block, config, separator));

  const groups: Unit[][] = [];
  const groupChars = (group: Unit[]) => piecesChars(group.flatMap((unit) => unit.pieces), separator);
  units.forEach((unit, index) => {
    const group = groups[groups.length - 1];
    if (group && shouldJoin(group, unit, units[index + 1])) {
      group.push(unit);
    } else {
      groups.push([unit]);
    }
  });

  function shouldJoin(group: Unit[], next: Unit, afterNext: Unit | undefined): boolean {
    const last = group[group.length - 1];
    if (!isContinuation(last, next)) return false;
    const chars = groupChars(group);
    if (chars + separator.length + next.chars > config.maxChars) return false;
    if (chars < config.minChars) return true;
    if (next.chars >= config.minChars) return false;
    const pairsForward = Boolean(afterNext)
      && isContinuation(next, afterNext as Unit)
      && next.chars + separator.length + (afterNext as Unit).chars <= config.maxChars;
    return !pairsForward;
  }

  return groups.map((group, index) => {
    const boundaries: AudioJunctionPart["sectionBoundaries"] = [];
    let audioScript = "";
    for (const piece of group.flatMap((unit) => unit.pieces)) {
      const start = audioScript ? audioScript.length + separator.length : 0;
      audioScript = audioScript ? `${audioScript}${separator}${piece.text}` : piece.text;
      const previous = boundaries[boundaries.length - 1];
      if (previous && previous.globalIndex === piece.segmentIndex) {
        previous.charEnd = audioScript.length;
      } else {
        boundaries.push({ globalIndex: piece.segmentIndex, title: piece.titulo, charStart: start, charEnd: audioScript.length });
      }
    }
    return {
      ordem: index + 1,
      titulo: group[0].titulo,
      audioScript,
      sectionBoundaries: boundaries,
    };
  });
}

/**
 * Seções de áudio a partir do roteiro de cada capítulo (um por bloco). O
 * roteiro traz "## título" antes de cada seção; o que vier antes do primeiro
 * marcador é a abertura do capítulo e fica com a primeira seção — antes ela
 * era jogada fora (o áudio do Socializer da turma 66 começava em "E com essa
 * base…", sem a introdução). Capítulo sem marcador vira uma seção só, com o
 * primeiro título do markdown do capítulo.
 *
 * Toda seção sai marcada com o bloco de origem (`blockId`, ou o índice do
 * capítulo quando ele não vem), o título do bloco e o tópico/tema dele: é o
 * que a junção usa para agrupar.
 */
export function audioSegmentsFromChapters(
  chapters: Array<{ blockId?: string; markdown?: string; audioScript: string; topico?: string; tema?: string }>,
): AudioJunctionSegment[] {
  const segments: AudioJunctionSegment[] = [];
  chapters.forEach((chapter, chapterIndex) => {
    const script = String(chapter.audioScript ?? "").replace(/\r\n?/g, "\n");
    const blockTitulo = firstHeading(chapter.markdown ?? "") ?? undefined;
    const fallbackTitle = blockTitulo ?? "Conteúdo";
    const origem = {
      blockId: String(chapter.blockId ?? "").trim() || `capitulo-${chapterIndex}`,
      ...(blockTitulo ? { blockTitulo } : {}),
      ...(chapter.topico ? { topico: chapter.topico } : {}),
      ...(chapter.tema ? { tema: chapter.tema } : {}),
    };
    const markers = [...script.matchAll(/^##[ \t]+(.+?)[ \t#]*$/gm)];
    if (markers.length === 0) {
      if (script.trim()) segments.push({ titulo: fallbackTitle, audioScript: script, ...origem });
      return;
    }
    const preamble = script.slice(0, markers[0].index ?? 0);
    markers.forEach((marker, i) => {
      const start = (marker.index ?? 0) + marker[0].length;
      const end = i + 1 < markers.length ? (markers[i + 1].index ?? script.length) : script.length;
      const body = script.slice(start, end);
      const text = i === 0 && preamble.trim() ? `${preamble.trim()}\n\n${body}` : body;
      if (text.trim()) segments.push({ titulo: marker[1].replace(/\s+/g, " ").trim(), audioScript: text, ...origem });
    });
  });
  return segments;
}

function firstHeading(markdown: string): string | null {
  const match = markdown.match(/^#{1,6}[ \t]+(.+?)[ \t#]*$/m);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}
