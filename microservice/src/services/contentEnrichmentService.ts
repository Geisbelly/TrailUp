import OpenAI from "openai";
import { GoogleGenAI, Type } from "@google/genai";
import {
  hasMeaningfulContentExpansion,
  type BaseContentBlock,
  type ContentBlock,
  type ContentEnrichmentRequest,
} from "../lib/validators";

export const CONTENT_ENRICHMENT_SCHEMA_VERSION = "trailup.content-blocks.v2" as const;
export const CONTENT_ENRICHMENT_PROVIDER = "openai" as const;
export const DEFAULT_CONTENT_ENRICHMENT_MODEL = "gpt-5.6-sol" as const;
export const CONTENT_ENRICHMENT_FALLBACK_PROVIDER = "gemini" as const;
export const DEFAULT_CONTENT_ENRICHMENT_FALLBACK_MODEL =
  "gemini-2.5-flash-lite" as const;

const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_OUTPUT_TOKENS = 32_768;
const DEFAULT_OPENAI_UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1_000;

export interface ContentEnrichmentResult {
  schema_version: typeof CONTENT_ENRICHMENT_SCHEMA_VERSION;
  source_hash: string;
  tema: string;
  blocos: ContentBlock[];
  metadata: {
    provider: "openai" | "gemini" | "mixed";
    model: string;
    models?: string[];
    fallback: boolean;
    fallback_from?: "openai";
    fallback_calls?: number;
    blocos_recebidos: number;
    blocos_gerados: number;
    lotes_gerados: number;
    chamadas_realizadas: number;
  };
}

export interface StructuredEnrichmentCall {
  model: string;
  instructions: string;
  input: string;
  maxOutputTokens: number;
  blockIds: string[];
  attempt: number;
}

export type StructuredEnrichmentGenerator = (
  call: StructuredEnrichmentCall,
) => Promise<unknown>;

export interface ContentEnrichmentOptions {
  generateStructured?: StructuredEnrichmentGenerator;
  generateStructuredFallback?: StructuredEnrichmentGenerator;
  model?: string;
  fallbackModel?: string;
  batchSize?: number;
  maxAttempts?: number;
  maxOutputTokens?: number;
  environment?: Record<string, string | undefined>;
  now?: () => number;
}

interface RawEnrichedBlock {
  id?: unknown;
  tema?: unknown;
  topico?: unknown;
  objetivos?: unknown;
  conteudo_aprofundado?: unknown;
  conceitos_chave?: unknown;
  exemplos_contextos?: unknown;
  ponte_proximo_bloco?: unknown;
}

let openai: OpenAI | null = null;
let gemini: GoogleGenAI | null = null;
let openaiUnavailableUntil = 0;

function getOpenAI(): OpenAI {
  if (openai) return openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY ausente: enriquecimento obrigatório não pode ser executado.",
    );
  }
  openai = new OpenAI({ apiKey });
  return openai;
}

function getGemini(): GoogleGenAI {
  if (gemini) return gemini;
  const apiKey = String(process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY ausente: a contingência do enriquecimento não está disponível.",
    );
  }
  gemini = new GoogleGenAI({ apiKey });
  return gemini;
}

function normalizedText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizedText).filter(Boolean))];
}

function meaningfulTokens(value: string): Set<string> {
  const tokens = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  return new Set(tokens);
}

function hasNewVocabulary(base: string, expanded: string): boolean {
  const baseTokens = meaningfulTokens(base);
  const expandedTokens = meaningfulTokens(expanded);
  let additions = 0;
  for (const token of expandedTokens) {
    if (!baseTokens.has(token)) additions += 1;
    if (additions >= 3) return true;
  }
  return false;
}

function assertStringList(
  value: unknown,
  options: {
    minimum: number;
    field: string;
    blockId: string;
  },
): string[] {
  const { minimum, field, blockId } = options;
  const normalized = normalizedList(value);
  if (normalized.length < minimum) {
    throw new Error(
      `Gerador retornou ${field} insuficiente no bloco ${blockId}.`,
    );
  }
  return normalized;
}

export function buildValidatedEnrichmentResult(
  request: ContentEnrichmentRequest,
  raw: unknown,
  model: string,
): ContentEnrichmentResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Gerador retornou enriquecimento fora do formato JSON.");
  }
  const rawBlocks = (raw as { blocos?: unknown }).blocos;
  if (!Array.isArray(rawBlocks) || rawBlocks.length !== request.blocos_base.length) {
    throw new Error("Gerador omitiu ou acrescentou blocos durante o enriquecimento.");
  }

  const candidates = new Map<string, RawEnrichedBlock>();
  for (const rawBlock of rawBlocks) {
    if (typeof rawBlock !== "object" || rawBlock === null || Array.isArray(rawBlock)) {
      throw new Error("Gerador retornou bloco de enriquecimento inválido.");
    }
    const candidate = rawBlock as RawEnrichedBlock;
    const id = normalizedText(candidate.id);
    if (!id || candidates.has(id)) {
      throw new Error("Gerador retornou bloco sem identidade única.");
    }
    candidates.set(id, candidate);
  }

  const blocos = request.blocos_base.map((baseBlock, index): ContentBlock => {
    const candidate = candidates.get(baseBlock.id);
    if (!candidate) {
      throw new Error(`Gerador omitiu o bloco ${baseBlock.id}.`);
    }
    const expanded = normalizedText(candidate.conteudo_aprofundado);
    if (!hasMeaningfulContentExpansion(baseBlock.conteudo_base, expanded)) {
      throw new Error(
        `Gerador não aprofundou de verdade o bloco ${baseBlock.id}.`,
      );
    }
    if (!hasNewVocabulary(baseBlock.conteudo_base, expanded)) {
      throw new Error(
        `Gerador não acrescentou contexto ou vocabulário ao bloco ${baseBlock.id}.`,
      );
    }

    const objetivos = assertStringList(candidate.objetivos, {
      minimum: 1,
      field: "objetivos",
      blockId: baseBlock.id,
    });
    const conceitos = assertStringList(candidate.conceitos_chave, {
      minimum: 2,
      field: "conceitos_chave",
      blockId: baseBlock.id,
    });
    const exemplos = assertStringList(candidate.exemplos_contextos, {
      minimum: 1,
      field: "exemplos_contextos",
      blockId: baseBlock.id,
    });

    return {
      id: baseBlock.id,
      ordem: index + 1,
      tema: normalizedText(candidate.tema) || baseBlock.tema,
      topico: normalizedText(candidate.topico) || baseBlock.topico,
      objetivos,
      conteudo_base: baseBlock.conteudo_base,
      conteudo_aprofundado: expanded,
      conceitos_chave: conceitos,
      exemplos_contextos: exemplos,
      ponte_proximo_bloco: normalizedText(candidate.ponte_proximo_bloco),
      source_ids: [...baseBlock.source_ids],
    };
  });

  return {
    schema_version: CONTENT_ENRICHMENT_SCHEMA_VERSION,
    source_hash: request.source_hash,
    tema: request.tema.titulo || request.blocos_base[0]?.tema || "Conteúdo de estudo",
    blocos,
    metadata: {
      provider: CONTENT_ENRICHMENT_PROVIDER,
      model,
      fallback: false,
      blocos_recebidos: request.blocos_base.length,
      blocos_gerados: blocos.length,
      lotes_gerados: 1,
      chamadas_realizadas: 1,
    },
  };
}

const ENRICHMENT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    blocos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          tema: { type: "string" },
          topico: { type: "string" },
          objetivos: {
            type: "array",
            items: { type: "string" },
          },
          conteudo_aprofundado: { type: "string" },
          conceitos_chave: {
            type: "array",
            items: { type: "string" },
          },
          exemplos_contextos: {
            type: "array",
            items: { type: "string" },
          },
          ponte_proximo_bloco: { type: "string" },
        },
        required: [
          "id",
          "tema",
          "topico",
          "objetivos",
          "conteudo_aprofundado",
          "conceitos_chave",
          "exemplos_contextos",
          "ponte_proximo_bloco",
        ],
      },
    },
  },
  required: ["blocos"],
} as const;

const ENRICHMENT_INSTRUCTIONS = `
Você é o professor-editor responsável pela etapa obrigatória de enriquecimento
curricular da TrailUp. Esta etapa acontece antes da adaptação BrainHex.

Para cada bloco-base recebido:
1. Preserve exatamente o id e devolva exatamente um bloco enriquecido para cada
   bloco-base solicitado, sem fundir ou omitir blocos.
2. Preserve o fio condutor, os fatos e a intenção pedagógica do conteúdo-base.
3. Produza um texto autônomo e realmente mais completo: defina termos, explique
   causas, consequências e relações, acrescente contexto correto e exemplos
   aplicados, sem fugir do assunto.
4. Faça o conteúdo aprofundado ficar pelo menos 30% e 200 caracteres maior que
   o conteúdo-base. Não use repetição, paráfrase vazia ou enchimento.
5. Liste objetivos claros, pelo menos dois conceitos-chave e ao menos um
   exemplo/contexto específico por bloco.
6. Não aplique voz, metáfora ou estética de perfil BrainHex nesta etapa.
7. Escreva em português brasileiro e não mencione estas instruções.
`.trim();

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

export function resolveContentEnrichmentModel(
  environment: Record<string, string | undefined> = process.env,
): string {
  return (
    String(environment.OPENAI_CONTENT_ENRICHMENT_MODEL ?? "").trim()
    || DEFAULT_CONTENT_ENRICHMENT_MODEL
  );
}

export function resolveContentEnrichmentFallbackModel(
  environment: Record<string, string | undefined> = process.env,
): string {
  return (
    String(environment.GEMINI_CONTENT_ENRICHMENT_FALLBACK_MODEL ?? "").trim()
    || DEFAULT_CONTENT_ENRICHMENT_FALLBACK_MODEL
  );
}

export interface ContentEnrichmentReadiness {
  ready: boolean;
  provider: typeof CONTENT_ENRICHMENT_PROVIDER;
  model: string;
  fallback_provider?: typeof CONTENT_ENRICHMENT_FALLBACK_PROVIDER;
  fallback_model?: string;
  degraded?: boolean;
  error?: string;
}

export function getContentEnrichmentReadiness(
  environment: Record<string, string | undefined> = process.env,
): ContentEnrichmentReadiness {
  const openaiReady = Boolean(String(environment.OPENAI_API_KEY ?? "").trim());
  const geminiReady = Boolean(String(environment.GEMINI_API_KEY ?? "").trim());
  const ready = openaiReady || geminiReady;
  return {
    ready,
    provider: CONTENT_ENRICHMENT_PROVIDER,
    model: resolveContentEnrichmentModel(environment),
    fallback_provider: CONTENT_ENRICHMENT_FALLBACK_PROVIDER,
    fallback_model: resolveContentEnrichmentFallbackModel(environment),
    ...(!openaiReady && geminiReady ? { degraded: true } : {}),
    ...(!ready
      ? {
          error:
            "OPENAI_API_KEY e GEMINI_API_KEY ausentes para o enriquecimento curricular.",
        }
      : {}),
  };
}

function partitionBlocks(
  blocks: BaseContentBlock[],
  batchSize: number,
): BaseContentBlock[][] {
  const batches: BaseContentBlock[][] = [];
  for (let index = 0; index < blocks.length; index += batchSize) {
    batches.push(blocks.slice(index, index + batchSize));
  }
  return batches;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error ?? "erro desconhecido");
}

function candidateIndex(raw: unknown): {
  candidates: Map<string, RawEnrichedBlock>;
  duplicates: Set<string>;
} {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Gerador retornou enriquecimento fora do formato JSON.");
  }
  const rawBlocks = (raw as { blocos?: unknown }).blocos;
  if (!Array.isArray(rawBlocks)) {
    throw new Error("Gerador não retornou a lista de blocos enriquecidos.");
  }

  const candidates = new Map<string, RawEnrichedBlock>();
  const duplicates = new Set<string>();
  for (const rawBlock of rawBlocks) {
    if (typeof rawBlock !== "object" || rawBlock === null || Array.isArray(rawBlock)) {
      continue;
    }
    const candidate = rawBlock as RawEnrichedBlock;
    const id = normalizedText(candidate.id);
    if (!id) continue;
    if (candidates.has(id)) duplicates.add(id);
    candidates.set(id, candidate);
  }
  return { candidates, duplicates };
}

async function generateStructuredWithOpenAI(
  call: StructuredEnrichmentCall,
): Promise<unknown> {
  const response = await getOpenAI().responses.create({
    model: call.model,
    instructions: call.instructions,
    input: call.input,
    max_output_tokens: call.maxOutputTokens,
    reasoning: { effort: "medium" },
    store: false,
    text: {
      verbosity: "high",
      format: {
        type: "json_schema",
        name: "trailup_content_enrichment",
        description:
          "Blocos curriculares aprofundados, completos e rastreáveis.",
        strict: true,
        schema: ENRICHMENT_RESPONSE_SCHEMA,
      },
    },
  });

  const responseText = String(response.output_text ?? "").trim();
  if (!responseText) {
    throw new Error(
      `OpenAI retornou enriquecimento vazio (status: ${response.status}).`,
    );
  }
  try {
    return JSON.parse(responseText);
  } catch (error) {
    throw new Error("OpenAI retornou JSON inválido no enriquecimento.", {
      cause: error,
    });
  }
}

const GEMINI_ENRICHMENT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    blocos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          tema: { type: Type.STRING },
          topico: { type: Type.STRING },
          objetivos: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          conteudo_aprofundado: { type: Type.STRING },
          conceitos_chave: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          exemplos_contextos: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          ponte_proximo_bloco: { type: Type.STRING },
        },
        required: [
          "id",
          "tema",
          "topico",
          "objetivos",
          "conteudo_aprofundado",
          "conceitos_chave",
          "exemplos_contextos",
          "ponte_proximo_bloco",
        ],
      },
    },
  },
  required: ["blocos"],
};

async function generateStructuredWithGemini(
  call: StructuredEnrichmentCall,
): Promise<unknown> {
  const response = await getGemini().models.generateContent({
    model: call.model,
    contents: [{
      parts: [{ text: call.input }],
    }],
    config: {
      systemInstruction: call.instructions,
      temperature: 0.35,
      maxOutputTokens: call.maxOutputTokens,
      responseMimeType: "application/json",
      responseSchema: GEMINI_ENRICHMENT_RESPONSE_SCHEMA,
    },
  });
  const responseText = String(response.text ?? "").trim();
  if (!responseText) {
    throw new Error("Gemini retornou enriquecimento vazio na contingência.");
  }
  try {
    return JSON.parse(responseText);
  } catch (error) {
    throw new Error("Gemini retornou JSON inválido na contingência.", {
      cause: error,
    });
  }
}

function errorDetails(error: unknown): string {
  if (error instanceof Error) {
    const cause = "cause" in error ? String(error.cause ?? "") : "";
    return `${error.name} ${error.message} ${cause}`.trim();
  }
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "");
}

export function isOpenAIAvailabilityError(error: unknown): boolean {
  const record = typeof error === "object" && error !== null
    ? error as Record<string, unknown>
    : {};
  const status = Number(record.status ?? record.statusCode ?? record.code);
  if (status === 408 || status === 429 || status >= 500) return true;

  const details = errorDetails(error).toLowerCase();
  return [
    "429",
    "current quota",
    "insufficient_quota",
    "rate limit",
    "too many requests",
    "service unavailable",
    "temporarily unavailable",
    "timeout",
    "timed out",
    "etimedout",
    "econnreset",
    "connection reset",
    "fetch failed",
    "openai_api_key ausente",
  ].some((marker) => details.includes(marker));
}

export function resetOpenAIContentEnrichmentCircuit(): void {
  openaiUnavailableUntil = 0;
}

interface EnrichmentGeneration {
  value: unknown;
  provider: "openai" | "gemini";
  model: string;
  fallback: boolean;
  calls: number;
}

async function generateEnrichmentWithFallback(
  call: StructuredEnrichmentCall,
  options: {
    generatePrimary: StructuredEnrichmentGenerator;
    generateFallback: StructuredEnrichmentGenerator;
    fallbackModel: string;
    environment: Record<string, string | undefined>;
    now: () => number;
  },
): Promise<EnrichmentGeneration> {
  if (options.now() < openaiUnavailableUntil) {
    return {
      value: await options.generateFallback({
        ...call,
        model: options.fallbackModel,
      }),
      provider: "gemini",
      model: options.fallbackModel,
      fallback: true,
      calls: 1,
    };
  }

  try {
    return {
      value: await options.generatePrimary(call),
      provider: "openai",
      model: call.model,
      fallback: false,
      calls: 1,
    };
  } catch (error) {
    if (!isOpenAIAvailabilityError(error)) throw error;

    const cooldownMs = boundedInteger(
      options.environment.CONTENT_ENRICHMENT_OPENAI_COOLDOWN_MS,
      DEFAULT_OPENAI_UNAVAILABLE_COOLDOWN_MS,
      1_000,
      60 * 60 * 1_000,
    );
    openaiUnavailableUntil = options.now() + cooldownMs;
    try {
      return {
        value: await options.generateFallback({
          ...call,
          model: options.fallbackModel,
        }),
        provider: "gemini",
        model: options.fallbackModel,
        fallback: true,
        calls: 2,
      };
    } catch (fallbackError) {
      const openaiDetails = errorDetails(error).slice(0, 500);
      const geminiDetails = errorDetails(fallbackError).slice(0, 500);
      throw new Error(
        "OpenAI está indisponível e a contingência Gemini também falhou. "
          + `OpenAI: ${openaiDetails}. Gemini: ${geminiDetails}.`,
        {
          cause: {
            openai: openaiDetails,
            gemini: geminiDetails,
          },
        },
      );
    }
  }
}

function batchInput(
  request: ContentEnrichmentRequest,
  blocks: BaseContentBlock[],
  feedback: string,
): string {
  const correction = feedback
    ? `\n\nCORREÇÕES OBRIGATÓRIAS DA TENTATIVA ANTERIOR:\n${feedback}`
    : "";
  return (
    `TEMA:\n${JSON.stringify(request.tema, null, 2)}\n\n`
    + `BLOCOS-BASE DESTE LOTE:\n${JSON.stringify(blocks, null, 2)}`
    + correction
  );
}

export async function enrichContentBlocksWithOpenAI(
  request: ContentEnrichmentRequest,
  options: ContentEnrichmentOptions = {},
): Promise<ContentEnrichmentResult> {
  const environment = options.environment ?? process.env;
  const now = options.now ?? Date.now;
  const model = String(options.model ?? "").trim()
    || resolveContentEnrichmentModel(environment);
  const fallbackModel = String(options.fallbackModel ?? "").trim()
    || resolveContentEnrichmentFallbackModel(environment);
  const batchSize = boundedInteger(
    options.batchSize ?? environment.CONTENT_ENRICHMENT_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    1,
    8,
  );
  const maxAttempts = boundedInteger(
    options.maxAttempts ?? environment.CONTENT_ENRICHMENT_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
    1,
    4,
  );
  const maxOutputTokens = boundedInteger(
    options.maxOutputTokens
      ?? environment.OPENAI_CONTENT_ENRICHMENT_MAX_OUTPUT_TOKENS
      ?? environment.CONTENT_ENRICHMENT_MAX_OUTPUT_TOKENS,
    DEFAULT_MAX_OUTPUT_TOKENS,
    8_192,
    65_536,
  );
  const generateStructured =
    options.generateStructured ?? generateStructuredWithOpenAI;
  const generateStructuredFallback =
    options.generateStructuredFallback ?? generateStructuredWithGemini;
  const batches = partitionBlocks(request.blocos_base, batchSize);
  const enrichedById = new Map<string, ContentBlock>();
  const originalOrder = new Map(
    request.blocos_base.map((block, index) => [block.id, index + 1]),
  );
  let callsMade = 0;
  let fallbackCalls = 0;
  const providersUsed = new Set<"openai" | "gemini">();
  const modelsUsed = new Set<string>();

  for (const batch of batches) {
    let pending = [...batch];
    let feedback = "";

    for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt += 1) {
      let generation: EnrichmentGeneration;
      try {
        generation = await generateEnrichmentWithFallback(
          {
            model,
            instructions: ENRICHMENT_INSTRUCTIONS,
            input: batchInput(request, pending, feedback),
            maxOutputTokens,
            blockIds: pending.map((block) => block.id),
            attempt,
          },
          {
            generatePrimary: generateStructured,
            generateFallback: generateStructuredFallback,
            fallbackModel,
            environment,
            now,
          },
        );
      } catch (error) {
        feedback = errorMessage(error);
        if (attempt === maxAttempts) {
          throw new Error(
            `Os provedores falharam ao aprofundar os blocos ${pending
              .map((block) => block.id)
              .join(", ")} após ${maxAttempts} tentativas: ${feedback}`,
            { cause: error },
          );
        }
        continue;
      }
      callsMade += generation.calls;
      providersUsed.add(generation.provider);
      modelsUsed.add(generation.model);
      if (generation.fallback) fallbackCalls += 1;
      const raw = generation.value;

      let indexed: ReturnType<typeof candidateIndex>;
      try {
        indexed = candidateIndex(raw);
      } catch (error) {
        feedback = errorMessage(error);
        if (attempt === maxAttempts) {
          throw new Error(
            `O gerador não devolveu blocos válidos após ${maxAttempts} tentativas: ${feedback}`,
            { cause: error },
          );
        }
        continue;
      }

      const failures: Array<{ block: BaseContentBlock; message: string }> = [];
      for (const baseBlock of pending) {
        try {
          if (indexed.duplicates.has(baseBlock.id)) {
            throw new Error(`Gerador duplicou o bloco ${baseBlock.id}.`);
          }
          const candidate = indexed.candidates.get(baseBlock.id);
          if (!candidate) {
            throw new Error(`Gerador omitiu o bloco ${baseBlock.id}.`);
          }
          const singleRequest: ContentEnrichmentRequest = {
            ...request,
            blocos_base: [baseBlock],
          };
          const validated = buildValidatedEnrichmentResult(
            singleRequest,
            { blocos: [candidate] },
            generation.model,
          ).blocos[0];
          enrichedById.set(baseBlock.id, {
            ...validated,
            ordem: originalOrder.get(baseBlock.id) ?? validated.ordem,
          });
        } catch (error) {
          failures.push({ block: baseBlock, message: errorMessage(error) });
        }
      }

      pending = failures.map((failure) => failure.block);
      feedback = failures
        .map((failure) => `${failure.block.id}: ${failure.message}`)
        .join("\n");
      if (pending.length > 0 && attempt === maxAttempts) {
        throw new Error(
          `O gerador não aprofundou todos os blocos após ${maxAttempts} tentativas: ${feedback}`,
        );
      }
    }
  }

  const blocos = request.blocos_base.map((block) => {
    const enriched = enrichedById.get(block.id);
    if (!enriched) {
      throw new Error(`O gerador não produziu o bloco obrigatório ${block.id}.`);
    }
    return enriched;
  });
  const provider = providersUsed.size > 1
    ? "mixed"
    : providersUsed.has("gemini")
    ? "gemini"
    : "openai";
  const models = [...modelsUsed];

  return {
    schema_version: CONTENT_ENRICHMENT_SCHEMA_VERSION,
    source_hash: request.source_hash,
    tema: request.tema.titulo || request.blocos_base[0]?.tema || "Conteúdo de estudo",
    blocos,
    metadata: {
      provider,
      model: models[0] ?? model,
      models,
      fallback: fallbackCalls > 0,
      ...(fallbackCalls > 0 ? { fallback_from: "openai" as const } : {}),
      fallback_calls: fallbackCalls,
      blocos_recebidos: request.blocos_base.length,
      blocos_gerados: blocos.length,
      lotes_gerados: batches.length,
      chamadas_realizadas: callsMade,
    },
  };
}
