import { ContentBlock, ContentBlockType } from "@/interfaces/componentes_simples/IContentBlock";
import {
  PersonalizedHeroFormat,
  PersonalizedUiConfig,
} from "@/interfaces/personalizacao/IPersonalizedTopic";
import { buildContentBlocks } from "@/utils/contentBlocks";

export type ModoApresentacao =
  | "atividade_primeiro"
  | "conteudo_primeiro"
  | "atividade_fim"
  | "misto";

type OrderContentBlockOptions = {
  modo: ModoApresentacao;
  heroFormat?: PersonalizedHeroFormat;
  uiConfig?: PersonalizedUiConfig | null;
};

const MODE_BASE_PRIORITY: Record<ModoApresentacao, ContentBlockType[]> = {
  atividade_primeiro: [
    "cards",
    "video",
    "audio",
    "imagem",
    "youtube",
    "apresentacao",
    "embed",
    "pdf",
    "documento",
    "markdown",
    "texto",
  ],
  conteudo_primeiro: [
    "texto",
    "markdown",
    "pdf",
    "documento",
    "apresentacao",
    "imagem",
    "cards",
    "audio",
    "video",
    "youtube",
    "embed",
  ],
  atividade_fim: [
    "texto",
    "markdown",
    "pdf",
    "documento",
    "apresentacao",
    "imagem",
    "audio",
    "video",
    "youtube",
    "cards",
    "embed",
  ],
  misto: [
    "cards",
    "pdf",
    "video",
    "audio",
    "imagem",
    "apresentacao",
    "documento",
    "markdown",
    "texto",
    "youtube",
    "embed",
  ],
};

function normalizeComparisonText(raw?: string | null) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function normalizeBlockType(tipo: ContentBlockType) {
  if (tipo === "youtube") return "video";
  return tipo;
}

function isTextualType(tipo: ContentBlockType) {
  return tipo === "texto" || tipo === "markdown";
}

function isDocumentType(tipo: ContentBlockType) {
  return ["pdf", "documento", "apresentacao"].includes(tipo);
}

function isIntroBlock(block: ContentBlock) {
  const id = String(block.id ?? "");
  return id.startsWith("intro-");
}

function heroMatchesType(tipo: ContentBlockType, heroFormat?: PersonalizedHeroFormat | null) {
  if (!heroFormat) return false;
  const normalizedTipo = normalizeBlockType(tipo);
  if (heroFormat === "texto" && normalizedTipo === "texto") return true;
  return normalizedTipo === heroFormat;
}

function blockPriorityScore(
  block: ContentBlock,
  index: number,
  options: OrderContentBlockOptions
) {
  const priority = MODE_BASE_PRIORITY[options.modo];
  const normalizedTipo = normalizeBlockType(block.tipo);
  const baseIndex = priority.indexOf(normalizedTipo);
  let score = baseIndex === -1 ? 999 : baseIndex * 10;

  if (isIntroBlock(block)) score -= 120;
  if (heroMatchesType(block.tipo, options.heroFormat)) score -= 80;

  if (options.uiConfig?.precisa_texto && isTextualType(block.tipo)) {
    score -= 22;
  }

  if (options.uiConfig?.ritmo_conteudo === "acelerado") {
    if (["audio", "video", "cards", "imagem"].includes(normalizedTipo)) score -= 16;
    if (isTextualType(block.tipo) || isDocumentType(block.tipo)) score += 6;
  }

  if (options.uiConfig?.ritmo_conteudo === "lento") {
    if (isTextualType(block.tipo) || isDocumentType(block.tipo)) score -= 14;
    if (["audio", "video", "cards"].includes(normalizedTipo)) score += 8;
  }

  if (options.uiConfig?.complexidade_visual === "minima") {
    if (normalizedTipo === "cards") score -= 8;
    if (normalizedTipo === "embed") score += 10;
  }

  return score + index / 1000;
}

export function modoFromOrdem(ordem: unknown): ModoApresentacao | null {
  if (!Array.isArray(ordem) || ordem.length === 0) return null;
  const seq = ordem.map((v) => normalizeComparisonText(String(v)));

  if (seq[0]?.includes("pergunta") || seq[0]?.includes("atividade")) {
    return "atividade_primeiro";
  }
  if (seq.at(-1)?.includes("pergunta") || seq.at(-1)?.includes("atividade")) {
    return "atividade_fim";
  }
  if (seq.join("-").includes("mist")) return "misto";

  return "conteudo_primeiro";
}

export function modoFromTexto(raw?: string | null): ModoApresentacao | null {
  const normalized = normalizeComparisonText(raw);
  if (!normalized) return null;

  if (normalized.includes("atividade no fim") || normalized.includes("atividade fim")) {
    return "atividade_fim";
  }
  if (
    normalized.includes("atividade primeiro") ||
    normalized.includes("pergunta primeiro")
  ) {
    return "atividade_primeiro";
  }
  if (normalized.includes("mist") || normalized.includes("altern")) {
    return "misto";
  }
  if (normalized.includes("conteudo primeiro")) {
    return "conteudo_primeiro";
  }

  return null;
}

export function inferModoApresentacao(opts: {
  alunoNome?: string | null;
  alunoDescricao?: string | null;
  ordem?: unknown;
  classeResumo?: string | null;
}): ModoApresentacao {
  const fromText =
    modoFromTexto(opts.alunoNome) ||
    modoFromTexto(opts.alunoDescricao) ||
    modoFromTexto(opts.classeResumo);

  if (fromText) return fromText;

  const fromOrder = modoFromOrdem(opts.ordem);
  if (fromOrder) return fromOrder;

  return "conteudo_primeiro";
}

export function orderContentBlocksByMode(
  blocks: ContentBlock[],
  options: OrderContentBlockOptions
) {
  return blocks
    .map((block, index) => ({
      block,
      index,
      score: blockPriorityScore(block, index, options),
    }))
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.block);
}

export function getConteudoDominantType(
  conteudo: any,
  modo: ModoApresentacao
): ContentBlockType | null {
  const blocks = buildContentBlocks(conteudo);
  if (!blocks.length) return null;

  const ordered = orderContentBlocksByMode(blocks, { modo });
  return ordered[0]?.tipo ?? null;
}

export function orderTopicoConteudosByMode<T extends { id?: number | string }>(
  conteudos: T[],
  modo: ModoApresentacao
) {
  return [...conteudos]
    .map((conteudo, index) => {
      const dominantType = getConteudoDominantType(conteudo, modo);
      const syntheticBlock: ContentBlock = {
        id: conteudo?.id ?? `conteudo-${index}`,
        tipo: dominantType ?? "texto",
        payload: "",
      };

      return {
        conteudo,
        index,
        score: blockPriorityScore(syntheticBlock, index, { modo }),
      };
    })
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.conteudo);
}
