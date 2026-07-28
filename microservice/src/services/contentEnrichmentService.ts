import OpenAI from "openai";
import {
  hasMeaningfulContentExpansion,
  type BaseContentBlock,
  type ContentBlock,
  type ContentEnrichmentRequest,
} from "../lib/validators";

export const CONTENT_ENRICHMENT_SCHEMA_VERSION = "trailup.content-blocks.v2" as const;
export const CONTENT_ENRICHMENT_PROVIDER = "openai" as const;
export const DEFAULT_CONTENT_ENRICHMENT_MODEL = "gpt-5.6-sol" as const;

const DEFAULT_BATCH_SIZE = 4;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_OUTPUT_TOKENS = 32_768;

export interface ContentEnrichmentResult {
  schema_version: typeof CONTENT_ENRICHMENT_SCHEMA_VERSION;
  source_hash: string;
  tema: string;
  blocos: ContentBlock[];
  metadata: {
    provider: typeof CONTENT_ENRICHMENT_PROVIDER;
    model: string;
    fallback: false;
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
  model?: string;
  batchSize?: number;
  maxAttempts?: number;
  maxOutputTokens?: number;
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
      `OpenAI retornou ${field} insuficiente no bloco ${blockId}.`,
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
    throw new Error("OpenAI retornou enriquecimento fora do formato JSON.");
  }
  const rawBlocks = (raw as { blocos?: unknown }).blocos;
  if (!Array.isArray(rawBlocks) || rawBlocks.length !== request.blocos_base.length) {
    throw new Error("OpenAI omitiu ou acrescentou blocos durante o enriquecimento.");
  }

  const candidates = new Map<string, RawEnrichedBlock>();
  for (const rawBlock of rawBlocks) {
    if (typeof rawBlock !== "object" || rawBlock === null || Array.isArray(rawBlock)) {
      throw new Error("OpenAI retornou bloco de enriquecimento inválido.");
    }
    const candidate = rawBlock as RawEnrichedBlock;
    const id = normalizedText(candidate.id);
    if (!id || candidates.has(id)) {
      throw new Error("OpenAI retornou bloco sem identidade única.");
    }
    candidates.set(id, candidate);
  }

  const blocos = request.blocos_base.map((baseBlock, index): ContentBlock => {
    const candidate = candidates.get(baseBlock.id);
    if (!candidate) {
      throw new Error(`OpenAI omitiu o bloco ${baseBlock.id}.`);
    }
    const expanded = normalizedText(candidate.conteudo_aprofundado);
    if (!hasMeaningfulContentExpansion(baseBlock.conteudo_base, expanded)) {
      throw new Error(
        `OpenAI não aprofundou de verdade o bloco ${baseBlock.id}.`,
      );
    }
    if (!hasNewVocabulary(baseBlock.conteudo_base, expanded)) {
      throw new Error(
        `OpenAI não acrescentou contexto ou vocabulário ao bloco ${baseBlock.id}.`,
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

export interface ContentEnrichmentReadiness {
  ready: boolean;
  provider: typeof CONTENT_ENRICHMENT_PROVIDER;
  model: string;
  error?: string;
}

export function getContentEnrichmentReadiness(
  environment: Record<string, string | undefined> = process.env,
): ContentEnrichmentReadiness {
  const ready = Boolean(String(environment.OPENAI_API_KEY ?? "").trim());
  return {
    ready,
    provider: CONTENT_ENRICHMENT_PROVIDER,
    model: resolveContentEnrichmentModel(environment),
    ...(!ready
      ? { error: "OPENAI_API_KEY ausente para o enriquecimento curricular." }
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
    throw new Error("OpenAI retornou enriquecimento fora do formato JSON.");
  }
  const rawBlocks = (raw as { blocos?: unknown }).blocos;
  if (!Array.isArray(rawBlocks)) {
    throw new Error("OpenAI não retornou a lista de blocos enriquecidos.");
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
  const model = String(options.model ?? "").trim() || resolveContentEnrichmentModel();
  const batchSize = boundedInteger(
    options.batchSize ?? process.env.CONTENT_ENRICHMENT_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    1,
    8,
  );
  const maxAttempts = boundedInteger(
    options.maxAttempts ?? process.env.CONTENT_ENRICHMENT_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
    1,
    4,
  );
  const maxOutputTokens = boundedInteger(
    options.maxOutputTokens
      ?? process.env.OPENAI_CONTENT_ENRICHMENT_MAX_OUTPUT_TOKENS
      ?? process.env.CONTENT_ENRICHMENT_MAX_OUTPUT_TOKENS,
    DEFAULT_MAX_OUTPUT_TOKENS,
    8_192,
    65_536,
  );
  const generateStructured =
    options.generateStructured ?? generateStructuredWithOpenAI;
  const batches = partitionBlocks(request.blocos_base, batchSize);
  const enrichedById = new Map<string, ContentBlock>();
  const originalOrder = new Map(
    request.blocos_base.map((block, index) => [block.id, index + 1]),
  );
  let callsMade = 0;

  for (const batch of batches) {
    let pending = [...batch];
    let feedback = "";

    for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt += 1) {
      let raw: unknown;
      callsMade += 1;
      try {
        raw = await generateStructured({
          model,
          instructions: ENRICHMENT_INSTRUCTIONS,
          input: batchInput(request, pending, feedback),
          maxOutputTokens,
          blockIds: pending.map((block) => block.id),
          attempt,
        });
      } catch (error) {
        feedback = errorMessage(error);
        if (attempt === maxAttempts) {
          throw new Error(
            `OpenAI falhou ao aprofundar os blocos ${pending
              .map((block) => block.id)
              .join(", ")} após ${maxAttempts} tentativas: ${feedback}`,
            { cause: error },
          );
        }
        continue;
      }

      let indexed: ReturnType<typeof candidateIndex>;
      try {
        indexed = candidateIndex(raw);
      } catch (error) {
        feedback = errorMessage(error);
        if (attempt === maxAttempts) {
          throw new Error(
            `OpenAI não devolveu blocos válidos após ${maxAttempts} tentativas: ${feedback}`,
            { cause: error },
          );
        }
        continue;
      }

      const failures: Array<{ block: BaseContentBlock; message: string }> = [];
      for (const baseBlock of pending) {
        try {
          if (indexed.duplicates.has(baseBlock.id)) {
            throw new Error(`OpenAI duplicou o bloco ${baseBlock.id}.`);
          }
          const candidate = indexed.candidates.get(baseBlock.id);
          if (!candidate) {
            throw new Error(`OpenAI omitiu o bloco ${baseBlock.id}.`);
          }
          const singleRequest: ContentEnrichmentRequest = {
            ...request,
            blocos_base: [baseBlock],
          };
          const validated = buildValidatedEnrichmentResult(
            singleRequest,
            { blocos: [candidate] },
            model,
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
          `OpenAI não aprofundou todos os blocos após ${maxAttempts} tentativas: ${feedback}`,
        );
      }
    }
  }

  const blocos = request.blocos_base.map((block) => {
    const enriched = enrichedById.get(block.id);
    if (!enriched) {
      throw new Error(`OpenAI não produziu o bloco obrigatório ${block.id}.`);
    }
    return enriched;
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
      lotes_gerados: batches.length,
      chamadas_realizadas: callsMade,
    },
  };
}
