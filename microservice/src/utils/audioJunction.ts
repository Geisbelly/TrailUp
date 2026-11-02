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

export interface AudioJunctionSegment {
  /** Título da seção, para o "Parte X de N: título" do app. */
  titulo: string;
  audioScript: string;
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
  /** Tamanho que a junção procura atingir por parte. */
  targetChars: number;
  /** Teto duro de uma parte (uma chamada de TTS). */
  maxChars: number;
  /** Parte final menor que isto é juntada à anterior, se couber no teto. */
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

export function resolveAudioJunctionConfig(
  environment: Record<string, string | undefined> = process.env,
): AudioJunctionConfig {
  const maxChars = boundedInteger(
    environment.AUDIO_JUNCTION_MAX_CHARS,
    DEFAULT_AUDIO_JUNCTION_CONFIG.maxChars,
    1_000,
    6_000,
  );
  const targetChars = Math.min(
    maxChars,
    boundedInteger(environment.AUDIO_JUNCTION_TARGET_CHARS, DEFAULT_AUDIO_JUNCTION_CONFIG.targetChars, 500, 6_000),
  );
  return {
    targetChars,
    maxChars,
    minChars: Math.min(targetChars, DEFAULT_AUDIO_JUNCTION_CONFIG.minChars),
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

/**
 * Junta as seções em partes de áudio. Recebe as seções já na ordem
 * pedagógica; devolve partes com no máximo `maxChars` caracteres cada.
 */
export function joinAudioBlocks(
  segments: AudioJunctionSegment[],
  config: AudioJunctionConfig = DEFAULT_AUDIO_JUNCTION_CONFIG,
  style: AudioScriptStyle = {},
): AudioJunctionPart[] {
  const dialogue = Boolean(style.speakers && style.speakers.length > 0);
  const separator = dialogue ? "\n" : "\n\n";

  const pieces: Piece[] = [];
  segments.forEach((segment, segmentIndex) => {
    const cleaned = cleanAudioScript(segment.audioScript, style);
    if (!cleaned) return;
    let activeTag: string | null = null;
    for (const chunk of splitOversized(cleaned, config.maxChars, dialogue)) {
      // Pedaço que começa no meio da seção herda o tom que estava valendo.
      const text = !dialogue && activeTag && !/^\s*\[/.test(chunk) && `${activeTag} ${chunk}`.length <= config.maxChars
        ? `${activeTag} ${chunk}`
        : chunk;
      pieces.push({ segmentIndex, titulo: segment.titulo, text });
      activeTag = lastTag(chunk) ?? activeTag;
    }
  });

  const groups: Piece[][] = [];
  let current: Piece[] = [];
  let currentChars = 0;
  for (const piece of pieces) {
    const added = current.length === 0 ? piece.text.length : currentChars + separator.length + piece.text.length;
    if (current.length > 0 && added > config.targetChars) {
      groups.push(current);
      current = [];
      currentChars = 0;
    }
    currentChars = current.length === 0 ? piece.text.length : currentChars + separator.length + piece.text.length;
    current.push(piece);
  }
  if (current.length > 0) groups.push(current);

  // Parte final curta demais vira o fim da anterior, se couber no teto: um
  // arquivo de 20 s no fim do tópico é um ponto de falha a mais sem ganho.
  if (groups.length > 1) {
    const last = groups[groups.length - 1];
    const lastChars = last.reduce((sum, piece) => sum + piece.text.length, 0) + separator.length * (last.length - 1);
    const previous = groups[groups.length - 2];
    const previousChars = previous.reduce((sum, piece) => sum + piece.text.length, 0)
      + separator.length * (previous.length - 1);
    if (lastChars < config.minChars && previousChars + separator.length + lastChars <= config.maxChars) {
      groups.splice(groups.length - 2, 2, [...previous, ...last]);
    }
  }

  return groups.map((group, index) => {
    const boundaries: AudioJunctionPart["sectionBoundaries"] = [];
    let audioScript = "";
    for (const piece of group) {
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
 */
export function audioSegmentsFromChapters(
  chapters: Array<{ markdown?: string; audioScript: string }>,
): AudioJunctionSegment[] {
  const segments: AudioJunctionSegment[] = [];
  for (const chapter of chapters) {
    const script = String(chapter.audioScript ?? "").replace(/\r\n?/g, "\n");
    const fallbackTitle = firstHeading(chapter.markdown ?? "") ?? "Conteúdo";
    const markers = [...script.matchAll(/^##[ \t]+(.+?)[ \t#]*$/gm)];
    if (markers.length === 0) {
      if (script.trim()) segments.push({ titulo: fallbackTitle, audioScript: script });
      continue;
    }
    const preamble = script.slice(0, markers[0].index ?? 0);
    markers.forEach((marker, i) => {
      const start = (marker.index ?? 0) + marker[0].length;
      const end = i + 1 < markers.length ? (markers[i + 1].index ?? script.length) : script.length;
      const body = script.slice(start, end);
      const text = i === 0 && preamble.trim() ? `${preamble.trim()}\n\n${body}` : body;
      if (text.trim()) segments.push({ titulo: marker[1].replace(/\s+/g, " ").trim(), audioScript: text });
    });
  }
  return segments;
}

function firstHeading(markdown: string): string | null {
  const match = markdown.match(/^#{1,6}[ \t]+(.+?)[ \t#]*$/m);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}
