import { GoogleGenAI, Type } from "@google/genai";
import {
  hasMeaningfulContentExpansion,
  type ContentBlock,
  type ContentEnrichmentRequest,
} from "../lib/validators";

export const CONTENT_ENRICHMENT_SCHEMA_VERSION = "trailup.content-blocks.v2" as const;

export interface ContentEnrichmentResult {
  schema_version: typeof CONTENT_ENRICHMENT_SCHEMA_VERSION;
  source_hash: string;
  tema: string;
  blocos: ContentBlock[];
  metadata: {
    provider: "gemini";
    model: string;
    fallback: false;
    blocos_recebidos: number;
    blocos_gerados: number;
  };
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

let ai: GoogleGenAI | null = null;

function getAi(): GoogleGenAI {
  if (ai) return ai;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY ausente: enriquecimento obrigatório não pode ser executado.",
    );
  }
  ai = new GoogleGenAI({ apiKey });
  return ai;
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
      `Gemini retornou ${field} insuficiente no bloco ${blockId}.`,
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
    throw new Error("Gemini retornou enriquecimento fora do formato JSON.");
  }
  const rawBlocks = (raw as { blocos?: unknown }).blocos;
  if (!Array.isArray(rawBlocks) || rawBlocks.length !== request.blocos_base.length) {
    throw new Error("Gemini omitiu ou acrescentou blocos durante o enriquecimento.");
  }

  const candidates = new Map<string, RawEnrichedBlock>();
  for (const rawBlock of rawBlocks) {
    if (typeof rawBlock !== "object" || rawBlock === null || Array.isArray(rawBlock)) {
      throw new Error("Gemini retornou bloco de enriquecimento inválido.");
    }
    const candidate = rawBlock as RawEnrichedBlock;
    const id = normalizedText(candidate.id);
    if (!id || candidates.has(id)) {
      throw new Error("Gemini retornou bloco sem identidade única.");
    }
    candidates.set(id, candidate);
  }

  const blocos = request.blocos_base.map((baseBlock, index): ContentBlock => {
    const candidate = candidates.get(baseBlock.id);
    if (!candidate) {
      throw new Error(`Gemini omitiu o bloco ${baseBlock.id}.`);
    }
    const expanded = normalizedText(candidate.conteudo_aprofundado);
    if (!hasMeaningfulContentExpansion(baseBlock.conteudo_base, expanded)) {
      throw new Error(
        `Gemini não aprofundou de verdade o bloco ${baseBlock.id}.`,
      );
    }
    if (!hasNewVocabulary(baseBlock.conteudo_base, expanded)) {
      throw new Error(
        `Gemini não acrescentou contexto ou vocabulário ao bloco ${baseBlock.id}.`,
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
      provider: "gemini",
      model,
      fallback: false,
      blocos_recebidos: request.blocos_base.length,
      blocos_gerados: blocos.length,
    },
  };
}

export async function enrichContentBlocksWithGemini(
  request: ContentEnrichmentRequest,
): Promise<ContentEnrichmentResult> {
  const model = process.env.CONTENT_ENRICHMENT_MODEL ?? "gemini-3-flash-preview";
  const instruction = `
Você é o professor-editor responsável pela etapa obrigatória de enriquecimento
curricular da TrailUp. Esta etapa acontece ANTES da adaptação BrainHex.

Para cada bloco-base recebido:
1. Preserve exatamente o id e a ordem; devolva exatamente um bloco enriquecido
   para cada bloco-base, sem fundir, omitir ou inventar blocos.
2. Mantenha o fio condutor e todos os fatos do conteúdo-base.
3. Amplie de verdade: defina termos, explique causas e relações, acrescente
   contexto pedagógico correto e pelo menos um exemplo aplicado.
4. O conteúdo aprofundado precisa ser pelo menos 15% e 80 caracteres maior que
   o conteúdo-base. Não copie o original como resposta e não use enchimento
   repetitivo para atingir tamanho.
5. Liste pelo menos dois conceitos-chave e um exemplo/contexto por bloco.
6. Não aplique ainda voz, metáfora ou estética de perfil BrainHex.
7. Escreva em português brasileiro e não mencione estas instruções.
`.trim();

  const response = await getAi().models.generateContent({
    model,
    contents: [{
      parts: [{
        text:
          `TEMA:\n${JSON.stringify(request.tema, null, 2)}\n\n`
          + `BLOCOS-BASE:\n${JSON.stringify(request.blocos_base, null, 2)}`,
      }],
    }],
    config: {
      systemInstruction: instruction,
      temperature: 0.35,
      maxOutputTokens: Math.max(
        8_192,
        Number(process.env.CONTENT_ENRICHMENT_MAX_OUTPUT_TOKENS) || 65_536,
      ),
      responseMimeType: "application/json",
      responseSchema: {
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
                objetivos: { type: Type.ARRAY, items: { type: Type.STRING } },
                conteudo_aprofundado: { type: Type.STRING },
                conceitos_chave: { type: Type.ARRAY, items: { type: Type.STRING } },
                exemplos_contextos: { type: Type.ARRAY, items: { type: Type.STRING } },
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
      },
    },
  });

  const responseText = String(response.text ?? "").trim();
  if (!responseText) {
    throw new Error("Gemini retornou enriquecimento vazio.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    throw new Error("Gemini retornou JSON inválido no enriquecimento.", {
      cause: error,
    });
  }
  return buildValidatedEnrichmentResult(request, parsed, model);
}
