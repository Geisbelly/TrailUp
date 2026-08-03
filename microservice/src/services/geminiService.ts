import { GoogleGenAI, Type, Modality } from "@google/genai";
import mammoth from "mammoth";
import JSZip from "jszip";
import * as lamejs from "lamejs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
import { BrainHexProfile, BRAIN_HEX_CONFIG } from "../constants/brainHex";
import { GUARDIAN_VOICE_PROFILES } from "../constants/guardianVoices";
import {
  buildPresentationDesignPlan,
  presentationImageDirection,
  type PresentationDesignPlan,
} from "../constants/presentationThemes";
import { mapWithConcurrency } from "../lib/boundedConcurrency";
import { resolveRealSlideOrder } from "../lib/pptxSlideOrder";
import { addWavHeader } from "../lib/wav";
import {
  generateOpenAISlidesOnly,
  generateOpenAITextOnly,
  generateStructuredContentWithFallback,
  isGeminiContentGenerationUnavailable,
  resolveGeminiContentGenerationModel,
  resolveOpenAIContentGenerationFallbackModel,
  type ContentGenerationProvider,
  type StructuredContentGenerationCall,
} from "./contentGenerationService";
import {
  ApiKeysConfig,
  EnrichedContentBlock,
  InternalBlock,
  ProcessedContent,
  SlideContent,
  SourceRef
} from "../types";

// Suporta multiplas chaves Gemini na mesma GEMINI_API_KEY (separadas por
// virgula/ponto-e-virgula). Cada chave tem sua propria cota diaria gratuita —
// alternar entre elas multiplica o limite efetivo (ex.: 3 chaves x 20 req/dia
// = 60 req/dia) sem custo adicional.
export function parseGeminiApiKeys(raw: string | undefined): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const part of String(raw ?? "").split(/[,;]/)) {
    const key = part.trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function geminiApiKeys(): string[] {
  return parseGeminiApiKeys(process.env.GEMINI_API_KEY);
}

// --- MOTOR DE REGENERACAO COM PROMPT (multi-chave/multi-modelo) ---
// Portado do protótipo gerado no AI Studio (remix-trailup-brainhex-converter)
// especificamente para os endpoints de regeneração/expansão com prompt do
// professor (ver server.ts, /api/v1/regenerate/*). Independente da rotação
// de chaves com cooldown por (chave,modelo) usada pelo resto do arquivo
// (_geminiKeyCooldownUntil) — aqui cada chamada tenta sua própria cascata do
// zero, sem estado compartilhado entre chamadas concorrentes.
export function getActiveKeys(
  customConfig?: ApiKeysConfig,
): { geminiKeys: string[]; openAIKey: string } {
  const geminiSet = new Set<string>();
  (customConfig?.geminiKeys ?? []).forEach((k) => {
    if (k && k.trim()) geminiSet.add(k.trim());
  });
  parseGeminiApiKeys(process.env.GEMINI_API_KEY).forEach((k) => geminiSet.add(k));
  [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
  ].forEach((k) => {
    if (k && k.trim()) geminiSet.add(k.trim());
  });
  if (process.env.GEMINI_API_KEYS) {
    parseGeminiApiKeys(process.env.GEMINI_API_KEYS).forEach((k) => geminiSet.add(k));
  }
  const openAIKey = customConfig?.openAIKey?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
  return { geminiKeys: Array.from(geminiSet), openAIKey };
}

const REGENERATION_GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];
const REGENERATION_OPENAI_MODELS = ["gpt-4o-mini", "gpt-3.5-turbo"];

/**
 * Executa uma geracao estruturada percorrendo uma cascata de modelos Gemini
 * (ate 4 chaves) e, por ultimo, modelos OpenAI - pensado para os fluxos de
 * regeneracao/expansao com prompt do professor, onde uma resposta unica e
 * pequena (nao um lote de blocos) torna aceitavel tentar tudo em serie numa
 * so chamada de usuario.
 */
export async function executeWithModelFallback<T>(params: {
  contentsParts: any[];
  systemInstruction: string;
  responseSchema?: any;
  customKeys?: ApiKeysConfig;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<T> {
  const { geminiKeys, openAIKey } = getActiveKeys(params.customKeys);
  let lastError: unknown = null;

  const keysToTry = geminiKeys.length > 0 ? geminiKeys : [];
  for (const apiKey of keysToTry) {
    const aiInstance = new GoogleGenAI({ apiKey });
    for (const modelName of REGENERATION_GEMINI_MODELS) {
      try {
        const configObj: Record<string, unknown> = {
          systemInstruction: params.systemInstruction,
          maxOutputTokens: params.maxOutputTokens || 16_384,
          temperature: params.temperature ?? 0.5,
          responseMimeType: "application/json",
        };
        if (params.responseSchema) configObj.responseSchema = params.responseSchema;

        const response = await aiInstance.models.generateContent({
          model: modelName,
          contents: [{ parts: params.contentsParts }],
          config: configObj,
        });
        if (response.text) {
          return JSON.parse(response.text) as T;
        }
      } catch (err) {
        lastError = err;
        console.warn(
          `[regenerate-engine] modelo '${modelName}' com chave ...${apiKey.slice(-4)} falhou:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  if (openAIKey) {
    for (const openAiModel of REGENERATION_OPENAI_MODELS) {
      try {
        const userPrompt = params.contentsParts
          .map((p) => (typeof p === "string" ? p : p?.text || ""))
          .filter(Boolean)
          .join("\n\n");
        const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAIKey}`,
          },
          body: JSON.stringify({
            model: openAiModel,
            messages: [
              {
                role: "system",
                content: `${params.systemInstruction}\n\nResponda ESTRITAMENTE em formato JSON válido.`,
              },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
            temperature: params.temperature ?? 0.5,
          }),
        });
        if (openAiRes.ok) {
          const data = await openAiRes.json();
          const contentStr = data.choices?.[0]?.message?.content || "";
          if (contentStr) return JSON.parse(contentStr) as T;
        } else {
          console.warn(`[regenerate-engine] OpenAI '${openAiModel}' HTTP ${openAiRes.status}`);
        }
      } catch (err) {
        lastError = err;
        console.warn("[regenerate-engine] erro OpenAI:", err instanceof Error ? err.message : err);
      }
    }
  }

  throw new Error(
    "Todos os modelos e chaves ativas atingiram limite de cota (429) ou falharam. "
    + `${lastError instanceof Error ? lastError.message : ""} Aguarde alguns instantes ou verifique as chaves fornecidas.`,
  );
}

const _geminiClients = new Map<string, GoogleGenAI>();
// Cota do free tier e por (chave, modelo) — nao só por chave (ver tabela de
// cotas do AI Studio: gemini-3.6-flash tem teto diário baixo, gemini-2.5-
// flash-lite não). Chavear o cooldown só por API key faria uma chave
// esgotada num modelo parecer indisponível pra TODOS os modelos, inclusive
// os com cota livre.
const _geminiKeyCooldownUntil = new Map<string, number>();
let _geminiKeyIndex = 0;
const GEMINI_KEY_QUOTA_COOLDOWN_MS = 5 * 60 * 1_000;
// Varios desses modelos aparecem com cota diária muito maior (ou ilimitada)
// que gemini-3.6-flash nas tabelas do AI Studio — tentados em ordem, cada um
// em todas as chaves configuradas, quando o modelo anterior esgota a cota em
// todas elas, antes de cair pro fallback pago da OpenAI. Ordem prioriza a
// série 3.x: gemini-2.5-flash-lite (e outros modelos 2.x) retornaram 404
// "no longer available to new users" em produção — contas novas parecem só
// ter acesso à série 3.x. Os 2.x ficam no fim como tentativa residual, caso
// algum outro tier ainda os aceite.
const DEFAULT_GEMINI_TEXT_FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

export function resolveGeminiTextFallbackModels(
  environment: Record<string, string | undefined> = process.env,
): string[] {
  const configured = parseGeminiApiKeys(environment.GEMINI_TEXT_FALLBACK_MODELS);
  return configured.length > 0 ? configured : DEFAULT_GEMINI_TEXT_FALLBACK_MODELS;
}

// Familia de modelo diferente do texto (TTS) — nao dá pra reusar a lista
// acima. gemini-2.5-flash-preview-tts é o mesmo modelo já referenciado como
// GEMINI_MODEL_TTS no lado da API (settings.py); confirmadamente válido no
// mesmo tier, ao contrário de nomes de modelo de imagem/TTS não testados.
const DEFAULT_GEMINI_TTS_FALLBACK_MODELS = ["gemini-2.5-flash-preview-tts"];

export function resolveGeminiTtsFallbackModels(
  environment: Record<string, string | undefined> = process.env,
): string[] {
  const configured = parseGeminiApiKeys(environment.GEMINI_TTS_FALLBACK_MODELS);
  return configured.length > 0 ? configured : DEFAULT_GEMINI_TTS_FALLBACK_MODELS;
}

// Idem para imagem de slide — gemini-2.0-flash-preview-image-generation é o
// mesmo modelo já referenciado como GEMINI_MODEL_IMAGE no lado da API.
const DEFAULT_GEMINI_IMAGE_FALLBACK_MODELS = ["gemini-2.0-flash-preview-image-generation"];

export function resolveGeminiImageFallbackModels(
  environment: Record<string, string | undefined> = process.env,
): string[] {
  const configured = parseGeminiApiKeys(environment.GEMINI_IMAGE_FALLBACK_MODELS);
  return configured.length > 0 ? configured : DEFAULT_GEMINI_IMAGE_FALLBACK_MODELS;
}

function cooldownKey(apiKey: string, model: string): string {
  return `${apiKey}::${model}`;
}

function clientForGeminiKey(key: string): GoogleGenAI {
  let client = _geminiClients.get(key);
  if (!client) {
    client = new GoogleGenAI({ apiKey: key });
    _geminiClients.set(key, client);
  }
  return client;
}

// Round-robin entre as chaves que nao estao em cooldown de cota PRA ESSE
// MODELO; null se todas estiverem indisponiveis no momento.
export function pickAvailableGeminiKey(keys: string[], model: string): string | null {
  const now = Date.now();
  for (let offset = 0; offset < keys.length; offset += 1) {
    const index = (_geminiKeyIndex + offset) % keys.length;
    const key = keys[index];
    if (now >= (_geminiKeyCooldownUntil.get(cooldownKey(key, model)) ?? 0)) {
      _geminiKeyIndex = index;
      return key;
    }
  }
  return null;
}

/** Só pra isolar testes entre si — reseta o round-robin e os cooldowns de chave. */
export function resetGeminiKeyRotationForTests(): void {
  _geminiKeyIndex = 0;
  _geminiKeyCooldownUntil.clear();
}

function getAi(model: string): GoogleGenAI {
  const keys = geminiApiKeys();
  if (keys.length === 0) {
    throw new Error("GEMINI_API_KEY ausente — configure no .env antes de chamar o serviço Gemini.");
  }
  const key = pickAvailableGeminiKey(keys, model) ?? keys[_geminiKeyIndex % keys.length];
  return clientForGeminiKey(key);
}

function isGeminiQuotaOrRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("429")
    || message.includes("quota")
    || message.includes("RESOURCE_EXHAUSTED");
}

/**
 * Erros de modelo indisponível (401 de modelo aposentado, 404 not found) não
 * são erros de cota — não faz sentido rotacionar chave pra eles (todas as
 * chaves falhariam igual), mas ainda justificam pular pro próximo modelo
 * candidato em vez de propagar o erro imediatamente.
 */
function isGeminiModelUnavailableError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  return message.includes("401")
    || message.includes("unauthenticated")
    || message.includes("404")
    || message.includes("not_found")
    || message.includes("not found")
    || message.includes("no longer available");
}

/**
 * 503 UNAVAILABLE ("high demand") e 5xx em geral sao sobrecarga transitoria
 * do servidor do Gemini, nao um problema da conta/chave — vale tentar a
 * proxima chave ou modelo em vez de propagar o erro imediatamente.
 */
function isGeminiTransientUnavailableError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  return message.includes("503")
    || message.includes("unavailable")
    || message.includes("overloaded")
    || message.includes("high demand")
    || message.includes("try again later");
}

/**
 * Marca a chave Gemini atualmente selecionada como esgotada PRA ESSE MODELO
 * e avança o round-robin pra próxima. Retorna true quando havia outra chave
 * disponível pra tentar imediatamente (sem cooldown de espera) nesse mesmo
 * modelo.
 */
export function rotateGeminiKeyAfterFailure(error: unknown, model: string): boolean {
  if (!isGeminiQuotaOrRateLimitError(error) && !isGeminiTransientUnavailableError(error)) {
    return false;
  }
  const keys = geminiApiKeys();
  if (keys.length === 0) return false;
  // Registra o cooldown mesmo com 1 chave so: mesmo sem outra chave pra
  // tentar AGORA, essa marca evita que uma proxima chamada nesse mesmo
  // modelo bata de novo numa cota ja sabidamente esgotada — ela cai direto
  // pro modelo alternativo (ver generateGeminiContent) sem gastar uma
  // chamada real.
  const exhaustedKey = keys[_geminiKeyIndex % keys.length];
  _geminiKeyCooldownUntil.set(cooldownKey(exhaustedKey, model), Date.now() + GEMINI_KEY_QUOTA_COOLDOWN_MS);
  return keys.length > 1 && pickAvailableGeminiKey(keys, model) !== null;
}

/**
 * Ponto único de chamada ao Gemini generateContent: tenta o modelo pedido em
 * todas as chaves configuradas (round-robin); se TODAS esgotarem a cota (ou
 * o modelo estiver indisponível/aposentado) passa pro próximo modelo
 * candidato em `fallbackModels`, de novo em todas as chaves, e assim por
 * diante. Só propaga o erro depois de esgotar todo mundo — o que então
 * aciona o circuito de indisponibilidade / fallback pago já existente em
 * contentGenerationService.ts e nos retries ad hoc de TTS/imagem.
 *
 * `fallbackModels` é passado pelo chamador porque a lista depende da
 * FAMÍLIA do modelo (texto/TTS/imagem não são intercambiáveis) — default pro
 * texto pois é o caminho de maior volume (markdown/audioScript/slides).
 */
async function generateGeminiContent(
  params: Parameters<GoogleGenAI["models"]["generateContent"]>[0],
  fallbackModels: string[] = resolveGeminiTextFallbackModels(),
): ReturnType<GoogleGenAI["models"]["generateContent"]> {
  const primaryModel = String(params.model ?? "");
  const candidateModels = [
    primaryModel,
    ...fallbackModels.filter((model) => model !== primaryModel),
  ];
  const maxAttemptsPerModel = Math.max(geminiApiKeys().length, 1);

  let lastError: unknown;
  for (const model of candidateModels) {
    const currentParams = model === primaryModel ? params : { ...params, model };
    for (let attempt = 0; attempt < maxAttemptsPerModel; attempt += 1) {
      try {
        return await getAi(model).models.generateContent(currentParams);
      } catch (error) {
        lastError = error;
        if (rotateGeminiKeyAfterFailure(error, model)) {
          continue; // outra chave disponivel pra esse mesmo modelo
        }
        if (
          !isGeminiQuotaOrRateLimitError(error)
          && !isGeminiModelUnavailableError(error)
          && !isGeminiTransientUnavailableError(error)
        ) {
          throw error; // erro nao relacionado a cota/disponibilidade: nao adianta trocar de modelo
        }
        break; // esgotou todas as chaves desse modelo -> tenta o proximo modelo candidato
      }
    }
  }
  throw lastError;
}

// --- 1. Ingestion & Extraction Modules ---

const MAX_PPTX_SLIDES = 200;
const MAX_EXTRACTED_MEDIA = 32;

async function extractFromZip(arrayBuffer: ArrayBuffer, mediaPath: string): Promise<{ blocks: InternalBlock[], media: { data: string, mimeType: string, name: string }[] }> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const mediaFiles = Object.keys(zip.files)
    .filter(name => name.startsWith(mediaPath) && /\.(png|jpe?g|webp)$/i.test(name))
    .slice(0, MAX_EXTRACTED_MEDIA);
  const allSlideFiles = Object.keys(zip.files)
    .filter(name => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"));

  const blocks: InternalBlock[] = [];
  const media: { data: string, mimeType: string, name: string }[] = [];

  // Extract Text (PPTX specific logic if slideFiles exist)
  if (allSlideFiles.length > 0) {
    // Resolve a ordem real ANTES de cortar em MAX_PPTX_SLIDES — cortar antes
    // manteria os primeiros 200 na ordem arbitraria de Object.keys() (ordem
    // fisica do zip), nao os primeiros 200 slides de fato da apresentacao.
    const orderedAllSlideFiles = await (async () => {
      const presentationFile = zip.files["ppt/presentation.xml"];
      const relsFile = zip.files["ppt/_rels/presentation.xml.rels"];
      if (!presentationFile || !relsFile) return allSlideFiles;
      try {
        const [presentationXml, relsXml] = await Promise.all([
          presentationFile.async("string"),
          relsFile.async("string"),
        ]);
        return resolveRealSlideOrder(presentationXml, relsXml, allSlideFiles);
      } catch {
        return allSlideFiles;
      }
    })();
    const slideFiles = orderedAllSlideFiles.slice(0, MAX_PPTX_SLIDES);

    for (const [index, slideFile] of slideFiles.entries()) {
      const content = await zip.files[slideFile].async("string");
      const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g);
      if (textMatches) {
        const slideText = textMatches.map(m => m.replace(/<\/?a:t>/g, "")).join(" ");
        blocks.push({
          id: `pptx-s${index + 1}`,
          kind: "paragraph" as const,
          text: slideText,
          source_ref: { slide: index + 1 }
        });
      }
    }
  }

  // Extract Media
  for (const file of mediaFiles) {
    const data = await zip.files[file].async("base64");
    const ext = file.split('.').pop()?.toLowerCase();
    const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    media.push({ data, mimeType, name: file });
  }

  return { blocks, media };
}

async function extractRawFromPPTX(arrayBuffer: ArrayBuffer) {
  return extractFromZip(arrayBuffer, "ppt/media/");
}

async function extractRawFromDOCX(arrayBuffer: ArrayBuffer) {
  const media: { data: string, mimeType: string, name: string }[] = [];
  
  const result = await mammoth.extractRawText({ 
    arrayBuffer: arrayBuffer
  });

  // Extract media manually from the zip as mammoth image extraction is more for HTML conversion
  const docData = await extractFromZip(arrayBuffer, "word/media/");
  
  const textBlocks = result.value.split("\n\n").map((text, i) => ({
    id: `docx-b${i}`,
    kind: "paragraph" as const,
    text: text.trim(),
    source_ref: { line: i + 1 }
  })).filter(b => b.text.length > 0);

  return { blocks: textBlocks, media: docData.media };
}

// --- 2. Processing Pipeline ---

const SUPPORTED_NATIVE_MIMES = [
  "application/pdf",
  "image/jpeg", "image/png", "image/webp",
  "audio/mpeg", "audio/mp3", "audio/wav",
  "video/mp4", "video/mpeg"
];

// Antes fixo em 1 (cada bloco virava sua propria chamada) e depois substituido
// por um merge forcado de TODOS os blocos numa unica chamada gigante — essa
// segunda abordagem provou (via diagnostico de finishReason/usageMetadata)
// que o Gemini para sozinho (STOP) bem antes de cobrir 24 blocos concatenados,
// nao importa o orcamento de tokens ou instrucoes explicitas de tamanho no
// prompt. Lotes de tamanho intermediario evitam as duas pontas: pequenos o
// bastante pra nao disparar o comportamento de resumo do modelo, grandes o
// bastante pra nao multiplicar chamadas (e cota diaria) por 1-bloco-por-vez.
const DEFAULT_CONTENT_BLOCK_BATCH_SIZE = 6;
const MAX_CONTENT_BLOCK_BATCH_SIZE = 8;
const DEFAULT_CONTENT_BLOCK_CONCURRENCY = 2;
const MAX_CONTENT_BLOCK_CONCURRENCY = 4;
const DEFAULT_CONTENT_GENERATION_MAX_OUTPUT_TOKENS = 16_384;
// Historico: quando processMediaWithGemini ainda mesclava TODOS os blocos do
// topico numa unica chamada (mergeContentBlocksIntoOne), esse teto maior foi
// adicionado na tentativa de dar mais espaco de saida ao Gemini. Diagnostico
// via finishReason/usageMetadata provou que nao era o gargalo (o Gemini parava
// sozinho - STOP - usando uma fracao minima do orcamento, nao MAX_TOKENS) —
// o problema real era o modelo tratando 24 blocos concatenados como material
// a resumir. A mesclagem foi removida (ver comentario em
// DEFAULT_CONTENT_BLOCK_BATCH_SIZE); nenhum chamador passa isMergedDocument
// como true hoje. A branch fica aqui, testada e pronta, caso outro caminho de
// geracao precise de mais orcamento de saida no futuro.
const DEFAULT_CONTENT_GENERATION_MERGED_MAX_OUTPUT_TOKENS = 65_536;

export function resolveContentGenerationMaxOutputTokens(
  isMergedDocument: boolean,
  environment: Record<string, string | undefined> = process.env,
): number {
  const envValue = isMergedDocument
    ? environment.CONTENT_GENERATION_MERGED_MAX_OUTPUT_TOKENS
    : environment.CONTENT_GENERATION_BATCH_MAX_OUTPUT_TOKENS;
  const fallback = isMergedDocument
    ? DEFAULT_CONTENT_GENERATION_MERGED_MAX_OUTPUT_TOKENS
    : DEFAULT_CONTENT_GENERATION_MAX_OUTPUT_TOKENS;
  return Math.max(8_192, Number(envValue) || fallback);
}
const GEMINI_CONTENT_GENERATION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    chapters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          blockId: { type: Type.STRING },
          markdown: { type: Type.STRING },
          audioScript: { type: Type.STRING },
          slides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                topics: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                explanation: { type: Type.STRING },
                visualDescription: { type: Type.STRING },
                characterQuote: { type: Type.STRING },
                characterAction: {
                  type: Type.STRING,
                  description:
                    "Ação: explaining, celebrating, thinking ou warning",
                },
                imagePrompt: { type: Type.STRING },
                iconPrompts: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                sourceIds: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: [
                "title",
                "topics",
                "explanation",
                "visualDescription",
                "characterQuote",
                "characterAction",
                "imagePrompt",
                "iconPrompts",
                "sourceIds",
              ],
            },
          },
        },
        required: ["blockId", "markdown", "audioScript", "slides"],
      },
    },
    confidence: { type: Type.NUMBER },
  },
  required: ["chapters", "confidence"],
};

// Usado só na contingência: quando o Gemini falha pro bloco inteiro, markdown
// e slides vão pra OpenAI (teto de 16384 tokens de saída obriga a dividir),
// mas o audioScript continua exclusivamente Gemini — nunca gerado pela OpenAI.
const GEMINI_AUDIO_SCRIPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    chapters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          blockId: { type: Type.STRING },
          audioScript: { type: Type.STRING },
        },
        required: ["blockId", "audioScript"],
      },
    },
    confidence: { type: Type.NUMBER },
  },
  required: ["chapters", "confidence"],
};

export interface GeneratedBlockChapter {
  blockId: string;
  markdown: string;
  audioScript: string;
  slides: SlideContent[];
}

export interface GeneratedBlockBatch {
  batchIndex: number;
  blockIds: string[];
  chapters: GeneratedBlockChapter[];
  confidence: number;
  generationProvider?: ContentGenerationProvider;
  generationModel?: string;
  fallbackFrom?: "gemini";
}

function normalizedText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizedText).filter(Boolean))];
}

export function resolveContentBlockBatchSize(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_CONTENT_BLOCK_BATCH_SIZE;
  }
  return Math.min(parsed, MAX_CONTENT_BLOCK_BATCH_SIZE);
}

export function resolveContentBlockConcurrency(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_CONTENT_BLOCK_CONCURRENCY;
  }
  return Math.min(parsed, MAX_CONTENT_BLOCK_CONCURRENCY);
}

export function partitionContentBlocks(
  contentBlocks: EnrichedContentBlock[],
  batchSize = DEFAULT_CONTENT_BLOCK_BATCH_SIZE,
): EnrichedContentBlock[][] {
  if (!Array.isArray(contentBlocks) || contentBlocks.length === 0) return [];
  const size = resolveContentBlockBatchSize(batchSize);
  const ids = new Set<string>();
  const ordered = contentBlocks
    .map((block, inputIndex) => ({ block, inputIndex }))
    .sort((a, b) => (a.block.ordem - b.block.ordem) || (a.inputIndex - b.inputIndex))
    .map(({ block }) => {
      const id = normalizedText(block.id);
      if (!id || ids.has(id)) {
        throw new Error("contentBlocks contém id ausente ou duplicado.");
      }
      if (!Number.isFinite(block.ordem)) {
        throw new Error(`contentBlocks contém ordem inválida no bloco ${id}.`);
      }
      ids.add(id);
      return block;
    });

  const batches: EnrichedContentBlock[][] = [];
  for (let index = 0; index < ordered.length; index += size) {
    batches.push(ordered.slice(index, index + size));
  }
  return batches;
}

function validateSlideForBlock(
  raw: unknown,
  options: {
    blockId: string;
    batchIds: Set<string>;
    slideIndex: number;
  },
): SlideContent {
  const { blockId, batchIds, slideIndex } = options;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Slide ${slideIndex + 1} inválido no capítulo ${blockId}.`);
  }
  const slide = raw as Record<string, unknown>;
  let sourceIds = normalizedStringList(slide.sourceIds);
  if (!sourceIds.includes(blockId)) {
    // Lotes sempre tem exatamente 1 bloco hoje (DEFAULT/MAX_CONTENT_BLOCK_BATCH_SIZE
    // = 1) - com um unico id valido no lote nao ha ambiguidade sobre qual
    // deveria ser o sourceIds. O modelo (sobretudo a contingencia OpenAI)
    // as vezes esquece de preencher esse campo de rastreabilidade mesmo
    // gerando o resto do slide corretamente; reprovar a tentativa inteira
    // por isso descarta conteudo bom por um campo com resposta unica
    // possivel neste caso. So reprova de verdade quando o lote tiver mais
    // de um bloco valido (nao acontece hoje, mas preserva a checagem se o
    // batch size voltar a ser >1 no futuro).
    if (batchIds.size === 1) {
      sourceIds = [blockId];
    } else {
      throw new Error(
        `Slide ${slideIndex + 1} não referencia seu bloco ${blockId}.`,
      );
    }
  }
  if (sourceIds.some((sourceId) => !batchIds.has(sourceId))) {
    throw new Error(
      `Slide ${slideIndex + 1} referencia bloco fora do lote.`,
    );
  }
  const action = normalizedText(slide.characterAction);
  if (!["explaining", "celebrating", "thinking", "warning"].includes(action)) {
    throw new Error(
      `Slide ${slideIndex + 1} contém characterAction inválida.`,
    );
  }
  const requiredStrings = [
    "title",
    "explanation",
    "visualDescription",
    "characterQuote",
    "imagePrompt",
  ] as const;
  for (const field of requiredStrings) {
    if (!normalizedText(slide[field])) {
      throw new Error(
        `Slide ${slideIndex + 1} não contém ${field} no capítulo ${blockId}.`,
      );
    }
  }
  const topics = normalizedStringList(slide.topics);
  const iconPrompts = normalizedStringList(slide.iconPrompts);
  if (topics.length === 0 || iconPrompts.length === 0) {
    throw new Error(
      `Slide ${slideIndex + 1} não contém tópicos ou ícones no capítulo ${blockId}.`,
    );
  }
  return {
    title: normalizedText(slide.title),
    topics,
    explanation: normalizedText(slide.explanation),
    visualDescription: normalizedText(slide.visualDescription),
    characterQuote: normalizedText(slide.characterQuote),
    characterAction: action as SlideContent["characterAction"],
    imagePrompt: normalizedText(slide.imagePrompt),
    iconPrompts,
    sourceIds,
  };
}

export function validateBlockBatchGeneration(
  batch: EnrichedContentBlock[],
  raw: unknown,
  batchIndex: number,
  options: { requireAudio?: boolean; maxOutputTokens?: number } = {},
): GeneratedBlockBatch {
  const requireAudio = options.requireAudio ?? true;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Gerador retornou lote ${batchIndex} fora do formato JSON.`);
  }
  const rawObject = raw as Record<string, unknown>;
  if (!Array.isArray(rawObject.chapters) || rawObject.chapters.length !== batch.length) {
    throw new Error(
      `Gerador omitiu ou acrescentou capítulos no lote ${batchIndex}.`,
    );
  }
  const batchIds = batch.map((block) => normalizedText(block.id));
  const batchIdSet = new Set(batchIds);
  const chapterMap = new Map<string, Record<string, unknown>>();
  for (const rawChapter of rawObject.chapters) {
    if (
      typeof rawChapter !== "object"
      || rawChapter === null
      || Array.isArray(rawChapter)
    ) {
      throw new Error(`Gerador retornou capítulo inválido no lote ${batchIndex}.`);
    }
    const chapter = rawChapter as Record<string, unknown>;
    const blockId = normalizedText(chapter.blockId);
    if (!batchIdSet.has(blockId) || chapterMap.has(blockId)) {
      throw new Error(
        `Gerador retornou identidade ausente, duplicada ou externa no lote ${batchIndex}.`,
      );
    }
    chapterMap.set(blockId, chapter);
  }

  const chapters = batch.map((block): GeneratedBlockChapter => {
    const blockId = normalizedText(block.id);
    const chapter = chapterMap.get(blockId);
    if (!chapter) {
      throw new Error(`Gerador omitiu o capítulo do bloco ${blockId}.`);
    }
    const markdown = String(chapter.markdown ?? "").trim();
    const audioScript = String(chapter.audioScript ?? "").trim();
    let minimumMarkdownLength = Math.max(
      200,
      Math.floor(normalizedText(block.conteudo_aprofundado).length * 0.75),
    );
    let minimumAudioLength = Math.max(
      160,
      Math.floor(normalizedText(block.conteudo_aprofundado).length * 0.5),
    );
    // markdown, audioScript e slides saem da MESMA chamada e dividem o mesmo
    // orcamento de output. Quando varios blocos sao mesclados num so (ver
    // mergeContentBlocksIntoOne), o texto-fonte cresce com a quantidade de
    // blocos mas o orcamento de output nao — sem este teto, a cobertura
    // minima exigida (% do texto-fonte) supera o que a resposta consegue
    // fisicamente conter, e o lote nunca passa por mais que se repita a
    // geracao. O teto usa uma estimativa conservadora de chars/token para
    // nao travar o caso normal de um bloco so (onde raramente se aplica).
    if (options.maxOutputTokens) {
      const CHARS_PER_TOKEN_ESTIMATE = 3;
      const outputCharBudget = options.maxOutputTokens * CHARS_PER_TOKEN_ESTIMATE;
      minimumMarkdownLength = Math.min(
        minimumMarkdownLength,
        Math.max(200, Math.floor(outputCharBudget * 0.5)),
      );
      minimumAudioLength = Math.min(
        minimumAudioLength,
        Math.max(160, Math.floor(outputCharBudget * 0.25)),
      );
    }
    if (normalizedText(markdown).length < minimumMarkdownLength) {
      throw new Error(
        `Markdown do bloco ${blockId} foi resumido abaixo do mínimo de cobertura `
        + `(recebido=${normalizedText(markdown).length} chars, `
        + `minimo=${minimumMarkdownLength} chars, `
        + `fonte=${normalizedText(block.conteudo_aprofundado).length} chars, `
        + `maxOutputTokens=${options.maxOutputTokens ?? "n/d"}).`,
      );
    }
    // audioScript so sai do Gemini, sem fallback proprio - quando a cota do
    // Gemini esta esgotada (fallback OpenAI para markdown/slides), audio
    // vazio e esperado e nao pode reprovar um lote que ja tem markdown e
    // slides bons. So exige cobertura de audio quando a chamada principal
    // (Gemini) e a origem, onde audio curto de fato indica baixa qualidade.
    if (requireAudio && normalizedText(audioScript).length < minimumAudioLength) {
      throw new Error(
        `Áudio do bloco ${blockId} foi resumido abaixo do mínimo de cobertura `
        + `(recebido=${normalizedText(audioScript).length} chars, `
        + `minimo=${minimumAudioLength} chars, `
        + `fonte=${normalizedText(block.conteudo_aprofundado).length} chars, `
        + `maxOutputTokens=${options.maxOutputTokens ?? "n/d"}).`,
      );
    }
    if (!Array.isArray(chapter.slides) || chapter.slides.length === 0) {
      throw new Error(`Gerador não produziu slides para o bloco ${blockId}.`);
    }
    return {
      blockId,
      markdown,
      audioScript,
      slides: chapter.slides.map((slide, slideIndex) =>
        validateSlideForBlock(slide, {
          blockId,
          batchIds: batchIdSet,
          slideIndex,
        })
      ),
    };
  });

  const confidence = Number(rawObject.confidence);
  if (!Number.isFinite(confidence)) {
    throw new Error(`Gerador não informou confiança válida no lote ${batchIndex}.`);
  }
  return {
    batchIndex,
    blockIds: batchIds,
    chapters,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

/**
 * Combina os três pedaços da contingência dividida (áudio sempre via Gemini,
 * markdown e slides via OpenAI) num único objeto no formato que
 * validateBlockBatchGeneration já sabe validar. blockId ausente em algum
 * pedaço vira campo vazio em vez de capítulo omitido — a validação existente
 * já recusa markdown/audioScript curto demais ou slides vazios com uma
 * mensagem específica, que realimenta o loop de correção da OpenAI.
 */
export async function generateOpenAIFallbackChapters(
  expectedIds: string[],
  generators: {
    generateAudioScript: () => Promise<unknown>;
    generateMarkdown: () => Promise<unknown>;
    generateSlides: () => Promise<unknown>;
  },
): Promise<{ chapters: unknown[]; confidence: number }> {
  const tagSubCallError = (
    label: string,
    promise: Promise<unknown>,
  ): Promise<unknown> =>
    promise.catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${label}: ${message}`, { cause: error });
    });

  // markdown/slides nao tem outro fallback depois da OpenAI - se falharem, a
  // geracao do lote falhou de fato. audioScript so sai do Gemini (sem
  // fallback proprio) e ja e tratado como opcional no resto do pipeline
  // (materiais.audio pode ficar "failed" independente de markdown/
  // apresentacao) - por isso sua falha nao pode derrubar markdown/slides que
  // ja tenham sido gerados com sucesso.
  const [audioResult, textResult, slidesResult] = await Promise.allSettled([
    tagSubCallError("audioScript/Gemini", generators.generateAudioScript()),
    tagSubCallError("markdown/OpenAI", generators.generateMarkdown()),
    tagSubCallError("slides/OpenAI", generators.generateSlides()),
  ]);
  if (textResult.status === "rejected") throw textResult.reason;
  if (slidesResult.status === "rejected") throw slidesResult.reason;
  const audio = audioResult.status === "fulfilled" ? audioResult.value : null;
  return mergeSplitFallbackChapters(expectedIds, audio, textResult.value, slidesResult.value);
}

export function mergeSplitFallbackChapters(
  expectedIds: string[],
  audio: unknown,
  text: unknown,
  slides: unknown,
): { chapters: unknown[]; confidence: number } {
  const chaptersById = (value: unknown): Map<string, Record<string, unknown>> => {
    const map = new Map<string, Record<string, unknown>>();
    const chapters = value && typeof value === "object"
      ? (value as Record<string, unknown>).chapters
      : null;
    if (!Array.isArray(chapters)) return map;
    for (const rawChapter of chapters) {
      if (typeof rawChapter !== "object" || rawChapter === null) continue;
      const chapter = rawChapter as Record<string, unknown>;
      const blockId = normalizedText(chapter.blockId);
      if (blockId) map.set(blockId, chapter);
    }
    return map;
  };
  const confidenceOf = (value: unknown): number => {
    const confidence = value && typeof value === "object"
      ? Number((value as Record<string, unknown>).confidence)
      : NaN;
    return Number.isFinite(confidence) ? confidence : 0;
  };

  const audioById = chaptersById(audio);
  const textById = chaptersById(text);
  const slidesById = chaptersById(slides);

  const chapters = expectedIds.map((blockId) => ({
    blockId,
    markdown: String(textById.get(blockId)?.markdown ?? ""),
    audioScript: String(audioById.get(blockId)?.audioScript ?? ""),
    slides: slidesById.get(blockId)?.slides ?? [],
  }));

  return {
    chapters,
    confidence: Math.min(confidenceOf(audio), confidenceOf(text), confidenceOf(slides)),
  };
}

export function consolidateBlockBatchGenerations(
  contentBlocks: EnrichedContentBlock[],
  batchResults: GeneratedBlockBatch[],
  options: {
    batchSize: number;
    concurrency: number;
    family: string;
    filesCount: number;
  },
): ProcessedContent {
  const effectiveBatchSize = resolveContentBlockBatchSize(options.batchSize);
  const expectedBatches = partitionContentBlocks(contentBlocks, effectiveBatchSize);
  const expectedIds = expectedBatches
    .flat()
    .map((block) => normalizedText(block.id));
  const orderedBatches = [...batchResults].sort(
    (a, b) => a.batchIndex - b.batchIndex,
  );
  if (orderedBatches.length !== expectedBatches.length) {
    throw new Error(
      "Consolidação recusada: quantidade de lotes diferente da planejada.",
    );
  }
  for (let index = 0; index < expectedBatches.length; index++) {
    const expectedBatchIds = expectedBatches[index].map((block) =>
      normalizedText(block.id)
    );
    const returnedBatch = orderedBatches[index];
    if (
      returnedBatch.batchIndex !== index + 1
      || returnedBatch.blockIds.length !== expectedBatchIds.length
      || returnedBatch.blockIds.some(
        (blockId, blockIndex) => blockId !== expectedBatchIds[blockIndex],
      )
    ) {
      throw new Error(
        `Consolidação recusada: cobertura incorreta no lote ${index + 1}.`,
      );
    }
  }
  const returnedIds = orderedBatches.flatMap((batch) => batch.blockIds);
  if (
    returnedIds.length !== expectedIds.length
    || returnedIds.some((id, index) => id !== expectedIds[index])
  ) {
    throw new Error(
      "Consolidação recusada: os lotes não cobrem todos os blocos na ordem.",
    );
  }
  const chapters = orderedBatches.flatMap((batch) => batch.chapters);
  if (
    chapters.length !== expectedIds.length
    || chapters.some((chapter, index) => chapter.blockId !== expectedIds[index])
  ) {
    throw new Error(
      "Consolidação recusada: capítulos ausentes, duplicados ou fora de ordem.",
    );
  }
  const confidence = orderedBatches.length > 0
    ? orderedBatches.reduce((sum, batch) => sum + batch.confidence, 0)
      / orderedBatches.length
    : 0;
  const generationProviders = [
    ...new Set(
      orderedBatches
        .map((batch) => batch.generationProvider)
        .filter((provider): provider is ContentGenerationProvider =>
          Boolean(provider)
        ),
    ),
  ];
  const generationModels = [
    ...new Set(
      orderedBatches
        .map((batch) => batch.generationModel)
        .filter((model): model is string => Boolean(model)),
    ),
  ];
  const fallbackCount = orderedBatches.filter(
    (batch) => batch.fallbackFrom === "gemini",
  ).length;

  return {
    markdown: chapters.map((chapter) => chapter.markdown).join("\n\n---\n\n"),
    audioScript: chapters.map((chapter) => chapter.audioScript).join("\n\n"),
    slides: chapters.flatMap((chapter) => chapter.slides),
    metadata: {
      blocks_processed: expectedIds.length,
      confidence,
      parser_used:
        `TrailUp ${options.family} Block Batch Generator `
        + `(${options.filesCount} fonte(s) de referência não reenviadas)`,
      generation_mode: "block_batches",
      content_blocks_total: expectedIds.length,
      content_block_batches: orderedBatches.length,
      content_block_batch_size: effectiveBatchSize,
      content_block_concurrency: resolveContentBlockConcurrency(
        options.concurrency,
      ),
      batch_block_ids: orderedBatches.map((batch) => [...batch.blockIds]),
      content_generation_provider: generationProviders.length === 1
        ? generationProviders[0]
        : generationProviders.length > 1
        ? "mixed"
        : undefined,
      content_generation_models: generationModels,
      content_generation_fallback_count: fallbackCount,
    },
  };
}

/**
 * Junta todos os blocos enriquecidos pela API num único bloco sintético
 * antes da geração de áudio/markdown. A API continua dividindo o material
 * em blocos (cada um já enriquecido e com teto de tamanho — ver
 * content_enrichment.py), mas a geração deixa de tratar cada bloco como um
 * capítulo isolado: o modelo volta a ver o tópico inteiro de uma vez, como
 * na versão original do gerador, e sintetiza um guia único e coeso — sem
 * isso, cada segmento de origem virava sua própria seção mesmo quando o
 * material do professor reintroduzia o mesmo conceito em mais de um slide,
 * duplicando o mesmo assunto com palavras diferentes no material final.
 */
export function mergeContentBlocksIntoOne(
  contentBlocks: EnrichedContentBlock[],
): EnrichedContentBlock {
  const ordered = [...contentBlocks].sort((a, b) => a.ordem - b.ordem);
  const label = (block: EnrichedContentBlock) =>
    normalizedText(block.topico) || normalizedText(block.tema) || block.id;

  const joinSections = (pick: (block: EnrichedContentBlock) => string) =>
    ordered
      .map((block) => `[${label(block)}]\n${pick(block).trim()}`)
      .filter((section) => section.length > 0)
      .join("\n\n---\n\n");

  return {
    id: "documento-completo",
    ordem: 1,
    tema: ordered[0]?.tema ?? "",
    topico: normalizedStringList(ordered.map((block) => block.topico)).join(" | "),
    objetivos: normalizedStringList(ordered.flatMap((block) => block.objetivos)),
    conteudo_base: joinSections((block) => block.conteudo_base),
    conteudo_aprofundado: joinSections((block) => block.conteudo_aprofundado),
    conceitos_chave: normalizedStringList(ordered.flatMap((block) => block.conceitos_chave)),
    exemplos_contextos: normalizedStringList(ordered.flatMap((block) => block.exemplos_contextos)),
    ponte_proximo_bloco: "",
    source_ids: normalizedStringList(ordered.flatMap((block) => block.source_ids)),
  };
}

export interface ContentPart {
  ordem: number;
  titulo: string;
  markdown: string;
  audioScript: string;
  slides: SlideContent[];
}

const DEFAULT_PART_TARGET_CHARS = 4_500;

// So reconhece heading de NIVEL 2 ("## Titulo") como fronteira de parte -
// "### " (nivel 3) fica dentro do corpo da secao pai, senao qualquer
// subsecao interna viraria sua propria "parte" entregavel.
const LEVEL_2_HEADING_RE = /^##[ \t]+(.+?)[ \t]*$/gm;

function splitMarkdownByLevel2Headings(
  markdown: string,
): { title: string; body: string }[] {
  const matches = [...markdown.matchAll(LEVEL_2_HEADING_RE)];
  if (matches.length === 0) return [];

  const sections: { title: string; body: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const title = normalizedText(match[1]);
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? markdown.length) : markdown.length;
    sections.push({ title, body: markdown.slice(start, end).trim() });
  }
  return sections;
}

// O audioScript so tem os marcadores "## <titulo>" (nunca falados) quando o
// modelo segue a instrucao a risca. Quando algum titulo nao e encontrado
// (ou vem fora de ordem), cai no fallback proporcional em vez de perder
// audio ou travar a divisao - alinhamento aproximado e melhor que nenhum.
function splitAudioByMarkdownTitles(
  audioScript: string,
  titles: string[],
): string[] | null {
  const positions: number[] = [];
  let cursor = 0;
  for (const title of titles) {
    const marker = `## ${title}`;
    const index = audioScript.indexOf(marker, cursor);
    if (index === -1) return null;
    positions.push(index);
    cursor = index + marker.length;
  }

  return titles.map((_, i) => {
    const markerEnd = positions[i] + `## ${titles[i]}`.length;
    const sectionEnd = i + 1 < positions.length ? positions[i + 1] : audioScript.length;
    return audioScript.slice(markerEnd, sectionEnd).trim();
  });
}

function stripSectionMarkers(audioScript: string): string {
  return audioScript.replace(LEVEL_2_HEADING_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

function splitAudioByCharRatio(
  audioScript: string,
  sectionChars: number[],
): string[] {
  const totalChars = sectionChars.reduce((sum, chars) => sum + chars, 0);
  const clean = stripSectionMarkers(audioScript);
  if (totalChars === 0 || clean.length === 0) {
    return sectionChars.map(() => "");
  }

  let cursor = 0;
  const parts = sectionChars.map((chars) => {
    const share = Math.round((chars / totalChars) * clean.length);
    const slice = clean.slice(cursor, cursor + share);
    cursor += share;
    return slice.trim();
  });
  parts[parts.length - 1] = (parts[parts.length - 1] + " " + clean.slice(cursor)).trim();
  return parts;
}

// Distribui `total` itens em `parts` grupos o mais equilibrado possivel
// (ex.: 10 slides em 3 partes -> [4, 3, 3]), sem depender de o modelo saber
// quantos slides "pertencem" a cada parte.
function distributeEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Divide o resultado JA sintetizado (mergeContentBlocksIntoOne + geracao)
 * em partes sequenciais entregaveis (arquivos separados de markdown/audio/
 * apresentacao) - a sintese continua sem duplicar topicos entre partes,
 * so a ENTREGA vira multiplos arquivos por tamanho em vez de um arquivo
 * monolitico (que ja estourou o limite de upload do Supabase Storage numa
 * apresentacao grande). Agrupa headings de nivel 2 consecutivos ate
 * atingir targetPartChars por parte; nunca quebra uma secao ao meio.
 */
export function splitProcessedContentIntoParts(
  content: { markdown: string; audioScript: string; slides: SlideContent[] },
  options: { targetPartChars?: number } = {},
): ContentPart[] {
  const targetPartChars = options.targetPartChars ?? DEFAULT_PART_TARGET_CHARS;
  const sections = splitMarkdownByLevel2Headings(content.markdown);

  if (sections.length === 0) {
    return [{
      ordem: 1,
      titulo: "Conteúdo completo",
      markdown: content.markdown.trim(),
      audioScript: stripSectionMarkers(content.audioScript),
      slides: content.slides,
    }];
  }

  const titles = sections.map((section) => section.title);
  const audioBySection =
    splitAudioByMarkdownTitles(content.audioScript, titles)
    ?? splitAudioByCharRatio(content.audioScript, sections.map((section) => section.body.length));

  const groups: number[][] = [];
  let current: number[] = [];
  let currentChars = 0;
  sections.forEach((section, index) => {
    if (current.length > 0 && currentChars + section.body.length > targetPartChars) {
      groups.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(index);
    currentChars += section.body.length;
  });
  if (current.length > 0) groups.push(current);

  const slidesPerPart = distributeEvenly(content.slides.length, groups.length);
  let slideCursor = 0;

  return groups.map((indices, partIndex) => {
    const slideCount = slidesPerPart[partIndex];
    const slidesPart = content.slides.slice(slideCursor, slideCursor + slideCount);
    slideCursor += slideCount;
    return {
      ordem: partIndex + 1,
      titulo: sections[indices[0]].title,
      markdown: indices
        .map((i) => `## ${sections[i].title}\n\n${sections[i].body}`)
        .join("\n\n"),
      audioScript: indices.map((i) => audioBySection[i]).join("\n\n"),
      slides: slidesPart,
    };
  });
}

export async function processMediaWithGemini(
  filesData: { data: string; mimeType: string; name: string }[],
  profile: BrainHexProfile,
  contentBlocks: EnrichedContentBlock[] = [],
  requestedPresentationPlan?: PresentationDesignPlan,
  guidancePrompt?: string,
): Promise<ProcessedContent> {
  // API continua dividindo o material em blocos (ver content_enrichment.py).
  // A geracao processa os blocos em lotes de tamanho moderado (ver
  // DEFAULT_CONTENT_BLOCK_BATCH_SIZE) — cada bloco do lote vira seu proprio
  // capitulo (ver validateBlockBatchGeneration), nunca mesclando todos os
  // blocos do topico numa unica chamada (ver mergeContentBlocksIntoOne, que
  // permanece exportada e testada mas nao e mais chamada aqui: mesclar tudo
  // fazia o Gemini resumir agressivamente o material em vez de expandi-lo).
  const originalBlocksCount = contentBlocks.length;
  const maxOutputTokens = resolveContentGenerationMaxOutputTokens(false);

  const config = BRAIN_HEX_CONFIG[profile];
  const presentationPlan = requestedPresentationPlan
    ?? buildPresentationDesignPlan(
      profile,
      {},
      contentBlocks[0]?.tema
        || contentBlocks[0]?.topico
        || "Conteúdo de estudo",
    );

  if ((!filesData || filesData.length === 0) && contentBlocks.length === 0) {
    throw new Error("processMediaWithGemini: fontes e contentBlocks vazios.");
  }

  // Use first non-empty file to detect family
  const primary = filesData[0] ?? { data: "", mimeType: "text/plain", name: "empty.txt" };
  let family: "text" | "presentation" | "paged" | "temporal" | "markdown" | "image" = "text";
  if (primary.mimeType.includes("presentation")) family = "presentation";
  else if (primary.mimeType.includes("pdf")) family = "paged";
  else if (primary.mimeType.startsWith("audio/") || primary.mimeType.startsWith("video/")) family = "temporal";
  else if (primary.mimeType.includes("markdown") || primary.name.endsWith(".md")) family = "markdown";
  else if (primary.mimeType.startsWith("image/")) family = "image";

  // Build contentsParts for all files
  let blocksCount = 0;
  const contentsParts: any[] = [];

  if (contentBlocks.length > 0) {
    blocksCount += originalBlocksCount;
  }

  // Com blocos enriquecidos, eles já são a fonte curricular validada. Arquivos
  // binários não são reenviados em cada lote; ficam apenas no caminho legado.
  if (contentBlocks.length === 0) {
    for (const fileData of filesData) {
      const isNative = SUPPORTED_NATIVE_MIMES.includes(fileData.mimeType);

      if (isNative) {
        contentsParts.push({
          inlineData: {
            data: fileData.data,
            mimeType: fileData.mimeType,
          },
        });
        blocksCount += 1;
      } else {
        const binaryString = atob(fileData.data);
        const bytes = new Uint8Array(binaryString.length).map((_, i) => binaryString.charCodeAt(i));
        let extractionResult: { blocks: InternalBlock[], media: any[] } = { blocks: [], media: [] };

        const fileMime = fileData.mimeType;
        if (fileMime.includes("presentation")) {
          extractionResult = await extractRawFromPPTX(bytes.buffer);
        } else if (fileMime.includes("wordprocessingml")) {
          extractionResult = await extractRawFromDOCX(bytes.buffer);
        } else {
          const text = new TextDecoder().decode(bytes);
          extractionResult.blocks = text.split("\n").filter(t => t.trim()).map((t, i) => ({
            id: `txt-${i}`,
            kind: "paragraph" as const,
            text: t.trim(),
            source_ref: { line: i + 1 }
          }));
        }

        blocksCount += extractionResult.blocks.length;

        contentsParts.push({
          text: `### MODELO INTERNO UNIFICADO (DOC: ${fileData.name})\n\n` +
                JSON.stringify(extractionResult.blocks, null, 2)
        });

        extractionResult.media.slice(0, 8).forEach((m, i) => {
          contentsParts.push({ inlineData: { data: m.data, mimeType: m.mimeType } });
          contentsParts.push({ text: `[IMAGEM DE REFERÊNCIA ${i+1}: ENCONTRADA NO CONTEÚDO ORIGINAL]` });
        });
      }
    }
  }

  if (contentsParts.length === 0) {
    contentsParts.push({ text: "Conteúdo não disponível." });
  }

  // 4. Personalized Semantic Generation
  const systemInstruction = `
    Você é a autoridade máxima em transmutação de conteúdo do sistema TrailUp, operando sob o arquétipo ${config.label} (${config.guideName}).
    
    ARQUITETURA DE RESPOSTA (NARRATIVA POR PERFIL):
    1. Fidelidade Absoluta: Use 100% dos dados fornecidos no Modelo Interno Unificado. NADA deve ser omitido.
       A ambientação mística/medieval do arquétipo é uma CAMADA aplicada SOBRE o conteúdo técnico e
       pedagógico original — nunca um substituto dele. Todo termo técnico, definição, passo, fórmula
       ou exemplo do material original precisa aparecer de forma explícita e correta (com o nome
       técnico real, não apenas a metáfora) antes ou junto da moldura narrativa do perfil. A metáfora
       ilustra e emociona o conceito; ela nunca o esconde, resume demais ou substitui a explicação
       técnica real. Em caso de dúvida, priorize a substância pedagógica sobre o floreio narrativo.
       Quando existirem BLOCOS PEDAGÓGICOS ENRIQUECIDOS PELA API, eles são o roteiro
       curricular obrigatório: preserve a ordem, crie uma seção ou capítulo identificável
       para CADA bloco nos três formatos e use o conteúdo aprofundado integralmente.
       Não funda blocos a ponto de perder tópicos e não reduza cada bloco a um bullet.

    2. Exemplos Visuais da Origem (MUITO CRÍTICO):
       - Se você encontrar imagens, diagramas ou fluxogramas nas partes multimodais enviadas (IMAGENS DE REFERÊNCIA), você DEVE descrevê-los detalhadamente no campo 'visualDescription'.
       - Use essas referências visuais para criar o 'imagePrompt', pedindo uma versão "Alquímica/2D Mágica" baseada exatamente naquela imagem do anexo.
       - Se o anexo contiver uma foto de uma pessoa ou cenário, transforme-a em uma ilustração épica coerente com o tema ${profile}.
    
    3. Exemplos e Analogias (Didática Alquímica):
       - Slides e Texto: Você DEVE incluir exemplos escritos explícitos e analogias temáticas para facilitar a compreensão.
       - Marque seções de exemplo com títulos como "CASO DE ESTUDO" ou "NA PRÁTICA".
    
    4. Grimório (Markdown) — Texto de Estudo Completo:
       O campo 'markdown' é o material de estudo PRINCIPAL do aluno — não é um
       resumo de apoio aos slides, é o texto que ele vai ler para aprender o
       conteúdo do zero. Aplique a regra 1 (Fidelidade Absoluta) com o máximo
       rigor aqui:
       - Estruture em seções com headings (## / ###), uma por bloco/tópico do
         conteúdo original, na mesma ordem em que aparecem no material do
         professor. Nenhum bloco do Modelo Interno Unificado pode ficar de fora.
       - Cada heading de nível 2 (##) é o ponto onde o material é dividido em
         partes/arquivos sequenciais para entrega ao aluno — use títulos
         curtos e descritivos (3 a 8 palavras), nunca repetidos.
       - Para cada conceito: defina-o, explique o "porquê" (não só o "o quê"),
         traga pelo menos um exemplo prático ou caso de estudo, e conecte com
         o conceito anterior/seguinte quando fizer sentido pedagógico.
       - NÃO resuma o material fornecido — use-o integralmente, sem cortar
         nem achatar em bullets de uma linha. A expansão e o aprofundamento do
         conteúdo (exemplos, contexto adicional, esclarecimentos) já são feitos
         pela API antes de chegar aqui — quando o bloco vier enriquecido, esse
         aprofundamento já está no texto recebido; sua tarefa é reaproveitá-lo
         por completo, não inventar exemplos, contexto ou explicações NOVAS
         além do que foi fornecido.
       - Extensão: o texto tem que ser proporcional ao conteúdo recebido —
         nunca mais curto ou mais raso que o material fornecido. Isso
         normalmente significa vários parágrafos por seção, não uma linha por
         bullet, mas não é licença para adicionar conteúdo que não veio no
         material de origem.
       - Termos técnicos e siglas: na primeira aparição de cada termo técnico,
         sigla ou jargão (ex.: RPC, sockets, middleware, DNS, transparência),
         defina-o explicitamente na mesma frase ou na seguinte — nunca assuma
         que o aluno já conhece a palavra.
       - Retomada: quando um conceito se apoiar ou se conectar com algo já
         apresentado antes na mesma seção/tópico, faça a ponte de forma
         explícita ("lembra de X? Y é a extensão disso porque..."), reforçando
         a memória em vez de apresentar fatos isolados.
       - Uso no contexto: depois de definir e exemplificar cada conceito,
         mostre COMO ele é usado na prática dentro da narrativa do guia — um
         mini-cenário, diálogo ou situação concreta ("imagine que...", "quando
         você digita uma URL, é aqui que...") de forma lúdica e dinâmica, não
         apenas o conceito isolado.
       - PROIBIDO transformar uma lista de conceitos (ex.: requisitos, pilares,
         características) em bullets de uma linha só ("Nome: frase curta.").
         Cada item de uma lista assim vira sua própria mini-seção com
         definição, porquê, conexão com o resto do conteúdo e um exemplo de
         uso no contexto.
       - MERGULHO TEMÁTICO: mantenha a voz do arquétipo ${profile} do início
         ao fim, sem sacrificar a densidade técnica.
       - 'mastermind': Lexicografia técnica.
       - 'seeker': Linguagem evocativa.
       - 'survivor': Dialeto pragmático.
       - 'daredevil': Verbos de ação.
       - 'conqueror': Tom majestoso.
       - 'socializer': Narrativa empática.
       - 'achiever': Foco em progressão.

    3. Eco da Sabedoria (Script de Áudio):
       O áudio é uma aula completa em capítulos, não uma sinopse do markdown.
       Narre o mesmo conteúdo do bloco (base e aprofundamento já recebidos) em
       voz alta, verbalizando os exemplos e contextos que já estão no material
       — não invente exemplos ou contexto novos que não estejam no bloco — e
       faça a ponte para o próximo bloco. Use transições faláveis ("agora", "em
       seguida", "isso nos leva a...") em vez de títulos secos. A cobertura
       deve ser equivalente à do texto de estudo.
       MARCAÇÃO OBRIGATÓRIA de seção: imediatamente antes de narrar o trecho
       correspondente a cada heading de nível 2 (##) do markdown, insira uma
       linha própria EXATAMENTE "## <mesmo título da seção em markdown>"
       (idêntico, incluindo acentos e pontuação). Essa linha é só um marcador
       de corte para dividir o áudio em arquivos — não é falada pelo
       narrador nem pelos guardiões, e não conta como título "seco" proibido
       acima (a proibição é sobre o texto FALADO, não sobre este marcador).
       ${config.secondaryGuideName ? `
       O roteiro é um DIÁLOGO entre os dois guardiões ${config.guideName} e ${config.secondaryGuideName} —
       não uma narração solo. Formato OBRIGATÓRIO (é assim que o motor de voz separa quem fala):
       - Cada fala é uma linha própria, começando EXATAMENTE com "${config.guideName}: " ou
         "${config.secondaryGuideName}: " (sem colchetes, sem markdown, sem outros prefixos).
       - Os dois se revezam naturalmente — perguntas, complementos, reações um ao outro — como
         uma conversa real entre colegas, não como um monólogo dividido ao meio.
       - Os dois juntos precisam cobrir 100% do conteúdo (regra 1, Fidelidade Absoluta); nenhum
         dos dois carrega o conteúdo técnico sozinho enquanto o outro só reage.
       - NÃO use marcações [Tom: ...] aqui — a emoção vem do próprio texto e da alternância de
         vozes, não de marcação de tom (essa é só para narração solo).
       ` : `
       O roteiro deve ser ESCRITO para ser falado pelo guia ${config.guideName}.
       - Se ${profile} for 'seeker', o narrador deve parecer ofegante e animado.
       - Se 'mastermind', calmo, calculista e pausado.
       - Se 'survivor', firme, grave e protetor.
       - Inclua marcações de [Tom: ...] para guiar a entonação mística.
       `}

    5. Slides (Visual Alchemy): ${contentBlocks.length > 0
      ? "Para CADA bloco deste lote, crie ao menos um slide próprio e slides adicionais quando necessários para cobrir integralmente o capítulo."
      : "Crie entre 10 e 25 slides (ou mais se necessário para cobrir 100% do conteúdo original)."
    } Crie uma estrutura ÚNICA para o perfil ${profile}, garantindo que exemplos e analogias tenham destaque visual:
       - 'mastermind': Estrutura analítica. Use analogias de "Engrenagens" e "Sistemas". Tópicos devem ser lógicos (Passo 1, Passo 2). Destaque o "Diagrama Lógico" como exemplo.
       - 'seeker': Estrutura de jornada. Tópicos como "Pista", "Rastro" ou "Horizonte". Use analogias de "Bússolas" e "Mapas". Destaque "Encontros" como exemplos.
       - 'survivor': Estrutura de alerta. Tópicos de "Atenção". Analogias de "Escudos" e "Abrigos". Destaque "Simulações de Campo" como exemplos.
       - 'daredevil': Estrutura de alta energia. Tópicos de "Desafio". Analogias de "Voo" e "Combustão". Destaque "Manobras" como exemplos.
       - 'conqueror': Estrutura de comando. Tópicos como "Domínio" e "Expansão". Analogias de "Estratégia Militar" e "Tronos". Destaque "Conquistas Reais" como exemplos.
       - 'socializer': Estrutura de diálogo. Tópicos focados em "Pessoas" e "Comunidade". Analogias de "Fogueiras" e "Banquete". Destaque "Relações" como exemplos.
       - 'achiever': Estrutura de progresso. Tópicos como "Meta" e "Recurso". Analogias de "Escadas" e "Pedras Preciosas". Destaque "Recompensas" como exemplos.
       
       RESTRIÇÕES DE TEXTO E ORGANIZAÇÃO:
       - PROIBIDO: Nunca use sintaxe de tabelas (ex: | --- |). Use listas e headings bem espaçados.
       - O texto deve ser entregue limpo, com parágrafos bem definidos e espaçamento duplo.
       - Use títulos curtos (max 6 palavras) e explicações densas porém legíveis.
       - visualDescription: Descrição de um exemplo prático ou analogia visual presente no slide.
       - characterQuote: Uma fala do guia ${config.guideName} reagindo ou explicando o conteúdo.
       - characterAction: A pose/emoção do guia ("explaining", "celebrating", "thinking", "warning").
       - imagePrompt: Prompt para geração de imagem 2D.
       - iconPrompts: 2 a 4 prompts curtos, cada um descrevendo UM elemento decorativo
         especifico do slide (ex.: numa aula de Egito antigo, "hieroglifo dourado
         estilizado", "escaravelho sagrado"; numa aula de sistemas distribuidos,
         "engrenagem magica conectada por fios de luz"). Mesmo estilo magico/ilustrado
         do guardiao ${config.guideName} — nunca icone generico de clipart, nunca
         texto ou letras dentro da imagem.
       - DIREÇÃO DE ARTE GLOBAL OBRIGATÓRIA: ${presentationImageDirection(presentationPlan)}
       - Todos os imagePrompt e iconPrompts precisam parecer parte do MESMO template
         editorial "${presentationPlan.styleName}", não uma coleção de artes independentes.
       - imagePrompt deve pedir composição horizontal 16:9, sem texto dentro da imagem,
         sem moldura pronta, com área de respiro para o conteúdo editorial do slide.
       - A temática visual vem de "${presentationPlan.subject}"; a identidade BrainHex
         funciona como assinatura, sem substituir o assunto real da aula por fantasia genérica.

    ${contentBlocks.length > 0 ? `
    LOTE DE BLOCOS PEDAGÓGICOS:
    - Este lote contém ${contentBlocks.length > 1 ? "vários blocos distintos" : "um bloco"}
      do tópico (o professor organizou o material em blocos maiores — ver
      content_enrichment.py; este lote é uma fatia deles, não o tópico
      inteiro). Cada blockId listado em "IDS OBRIGATORIOS" precisa virar seu
      PRÓPRIO capítulo completo (markdown + audioScript + slides), com
      extensão proporcional ao conteúdo aprofundado DAQUELE bloco especificamente
      — nunca condense um bloco achando que outro bloco do lote (ou de fora
      dele) já cobriu um conceito parecido; cada capítulo é validado sozinho
      e precisa se sustentar sem depender de nenhum outro.
    - Ainda assim, gere ao menos um slide por assunto principal de cada
      bloco. Todo slide deve incluir o blockId do capítulo em sourceIds.
    ` : ""}

    ${guidancePrompt ? `
    ORIENTAÇÃO DO PROFESSOR PARA ESTA GERAÇÃO (siga com prioridade sobre o
    resto deste prompt, mas sem contradizer a regra 1 de Fidelidade Absoluta
    nem omitir conteúdo do material original):
    "${guidancePrompt}"
    ` : ""}

    Estética: cor de assinatura ${config.color}, sistema ${presentationPlan.styleName},
    acabamento de template editorial profissional e coerente entre todos os slides.
    
    Traceability: No campo slides.sourceIds, relacione os IDs dos blocos originais que fundamentaram aquele slide.
  `;

  if (contentBlocks.length > 0) {
    const batchSize = resolveContentBlockBatchSize(
      process.env.CONTENT_GENERATION_BLOCK_BATCH_SIZE,
    );
    const batches = partitionContentBlocks(contentBlocks, batchSize);
    const concurrency = resolveContentBlockConcurrency(
      process.env.CONTENT_GENERATION_BLOCK_CONCURRENCY,
    );
    const geminiModel = resolveGeminiContentGenerationModel();
    const openaiModel = resolveOpenAIContentGenerationFallbackModel();

    // Cada chamada continua atômica (um único bloco), mas um pool pequeno
    // aproveita os provedores sem multiplicar trabalho. O helper devolve os
    // resultados na ordem pedagógica, independentemente da ordem de conclusão.
    const batchResults = await mapWithConcurrency(
      batches,
      concurrency,
      async (batch, index): Promise<GeneratedBlockBatch> => {
        const expectedIds = batch.map((block) => block.id);
        const batchInput =
          `IDS OBRIGATORIOS, NESTA ORDEM: ${JSON.stringify(expectedIds)}\n`
          + `Gere um capitulo PROPRIO para CADA um dos ${batch.length} `
          + "bloco(s) abaixo (um markdown, um audioScript e slides por "
          + "blockId) - cubra 100% dos conceitos de cada bloco individualmente, "
          + "com extensao proporcional ao conteudo_aprofundado daquele bloco "
          + "especifico.\n\n"
          + JSON.stringify(batch, null, 2);
        const generation = await generateStructuredContentWithFallback(
          {
            instructions: systemInstruction,
            input: batchInput,
            maxOutputTokens,
            geminiModel,
            openaiModel,
          },
          {
            generateWithGemini: async (call) => {
              const response = await generateGeminiContent({
                model: call.geminiModel,
                contents: [{
                  parts: [{ text: call.input }],
                }],
                config: {
                  systemInstruction: call.instructions,
                  maxOutputTokens: call.maxOutputTokens,
                  responseMimeType: "application/json",
                  responseSchema: GEMINI_CONTENT_GENERATION_RESPONSE_SCHEMA,
                },
              });
              // Diagnostico temporario: recebido=chars ficou curto mesmo com
              // maxOutputTokens alto - precisamos saber se o Gemini foi
              // truncado (finishReason=MAX_TOKENS, ai thoughtsTokenCount
              // consumiu o orcamento) ou se ele parou sozinho (STOP) antes de
              // cobrir o material, o que aponta pra um problema de prompt/
              // comportamento em vez de orcamento. Remover apos diagnosticar.
              console.error("[gemini-diag] lote", index + 1, JSON.stringify({
                finishReason: response.candidates?.[0]?.finishReason,
                usageMetadata: response.usageMetadata,
                maxOutputTokens: call.maxOutputTokens,
                textLength: String(response.text ?? "").length,
              }));
              const responseText = String(response.text ?? "").trim();
              if (!responseText) {
                throw new Error(`Gemini retornou vazio no lote ${index + 1}.`);
              }
              let rawBatch: unknown;
              try {
                rawBatch = JSON.parse(responseText);
              } catch (error) {
                throw new Error(
                  `Gemini retornou JSON inválido no lote ${index + 1}.`,
                  { cause: error },
                );
              }
              return rawBatch;
            },
            generateWithOpenAI: async (currentCall: StructuredContentGenerationCall) => {
              const generateAudioScriptWithGemini = async () => {
                // O circuito de indisponibilidade do Gemini é aberto pela
                // tentativa principal (ex.: 429 de rate limit). Sem essa
                // checagem, essa chamada martelaria o Gemini de novo na
                // mesma janela de cooldown, quase sempre repetindo a mesma
                // falha em vez de aguardar a recuperação.
                if (isGeminiContentGenerationUnavailable()) {
                  throw new Error(
                    `Gemini indisponível (circuito de cooldown aberto) no lote `
                    + `${index + 1} — audioScript não é gerado pela OpenAI, `
                    + "aguardando o Gemini se recuperar.",
                  );
                }
                const response = await generateGeminiContent({
                  model: currentCall.geminiModel,
                  contents: [{
                    parts: [{ text: currentCall.input }],
                  }],
                  config: {
                    systemInstruction: currentCall.instructions,
                    maxOutputTokens: currentCall.maxOutputTokens,
                    responseMimeType: "application/json",
                    responseSchema: GEMINI_AUDIO_SCRIPT_SCHEMA,
                  },
                });
                const responseText = String(response.text ?? "").trim();
                if (!responseText) {
                  throw new Error(
                    `Gemini retornou audioScript vazio no lote ${index + 1}.`,
                  );
                }
                try {
                  return JSON.parse(responseText);
                } catch (error) {
                  throw new Error(
                    `Gemini retornou JSON inválido no audioScript do lote ${index + 1}.`,
                    { cause: error },
                  );
                }
              };

              // audioScript nunca sai da OpenAI — só markdown e slides, cada
              // um em chamada própria pra caber no teto de 16384 tokens de
              // saída do gpt-4o-mini. audioScript falhar (cota do Gemini
              // esgotada) não pode derrubar markdown/slides, que não têm
              // outro fallback e já podem ter sido gerados com sucesso.
              return generateOpenAIFallbackChapters(expectedIds, {
                generateAudioScript: generateAudioScriptWithGemini,
                generateMarkdown: () => generateOpenAITextOnly(currentCall),
                generateSlides: () => generateOpenAISlidesOnly(currentCall),
              });
            },
            validateResult: (value, provider) => {
              // audioScript so sai do Gemini (sem fallback proprio) - quando
              // a origem e o fallback OpenAI, audio vazio e esperado e nao
              // pode reprovar markdown/slides que ja foram gerados com
              // sucesso (ver generateOpenAIFallbackChapters).
              validateBlockBatchGeneration(batch, value, index + 1, {
                requireAudio: provider !== "openai",
                maxOutputTokens,
              });
            },
            geminiFallbackModels: resolveGeminiTextFallbackModels(),
          },
        );
        const validated = validateBlockBatchGeneration(
          batch,
          generation.value,
          index + 1,
          { requireAudio: generation.provider !== "openai", maxOutputTokens },
        );
        validated.generationProvider = generation.provider;
        validated.generationModel = generation.model;
        validated.fallbackFrom = generation.fallbackFrom;
        return validated;
      },
    );

    return consolidateBlockBatchGenerations(contentBlocks, batchResults, {
      batchSize,
      concurrency,
      family,
      filesCount: filesData.length,
    });
  }

  const response = await generateGeminiContent({
    model: resolveGeminiContentGenerationModel(),
    contents: [
      {
        parts: [
          { text: `Guia ${config.guideName}, inicie o processamento da família ${family}. Alvo: Perfil ${profile}.` },
          ...contentsParts
        ]
      }
    ],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          markdown: { type: Type.STRING },
          audioScript: { type: Type.STRING },
          slides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                topics: { type: Type.ARRAY, items: { type: Type.STRING } },
                explanation: { type: Type.STRING },
                visualDescription: { type: Type.STRING },
                characterQuote: { type: Type.STRING },
                characterAction: { 
                  type: Type.STRING, 
                  description: "Ação do personagem: explaining, celebrating, thinking, or warning" 
                },
                imagePrompt: { type: Type.STRING },
                iconPrompts: { type: Type.ARRAY, items: { type: Type.STRING } },
                sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "topics", "explanation", "visualDescription", "characterQuote", "characterAction", "imagePrompt", "iconPrompts", "sourceIds"]
            }
          },
          confidence: { type: Type.NUMBER }
        },
        required: ["markdown", "audioScript", "slides", "confidence"]
      }
    }
  });

  const rawResult = JSON.parse(response.text);
  return {
    ...rawResult,
    metadata: {
      blocks_processed: blocksCount,
      confidence: rawResult.confidence || 0.9,
      parser_used: `TrailUp ${family} Extractor (${filesData.length} fonte(s))`,
      generation_mode: "legacy_aggregate",
    }
  } as ProcessedContent;
}

export type GeminiTtsVoice =
  | 'Puck'
  | 'Charon'
  | 'Kore'
  | 'Fenrir'
  | 'Zephyr'
  | 'Aoede'
  | 'Leda'
  | 'Schedar'
  | 'Achird'
  | 'Sulafat'
  | 'Orus';

/** PCM 24kHz (raw, do Gemini TTS) -> WAV com header + MP3 (lamejs). Compartilhado entre
 * narração de 1 voz e diálogo multi-voz — a codificação é igual, só a origem do PCM muda. */
function encodePcmToWavAndMp3(pcmBuffer: Uint8Array): { wav: string; mp3: string | null } {
  const wavWithHeader = addWavHeader(pcmBuffer, 24000);

  // Return base64 of the WAV file in chunks to avoid "Maximum call stack size exceeded"
  const CHUNK_SIZE = 8192;
  let binary = "";
  for (let i = 0; i < wavWithHeader.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...wavWithHeader.subarray(i, i + CHUNK_SIZE));
  }
  const audioBase64 = btoa(binary);

  // Geração de MP3 usando lamejs
  let mp3Base64 = null;
  try {
    const mp3Buffer = [];
    // Converter Uint8Array (PCM 16-bit) para Int16Array esperado pelo lamejs
    const sampleCount = pcmBuffer.length / 2;
    const samples = new Int16Array(sampleCount);
    const view = new DataView(pcmBuffer.buffer);
    for(let i=0; i<sampleCount; i++) {
        samples[i] = view.getInt16(i * 2, true);
    }

    // lamejs@1.2.1 foi escrito para ser concatenado num unico bundle (lame.all.js), onde
    // Lame.js e BitStream.js referenciam MPEGMode/Lame como globais "soltas" (sem require
    // proprio). O index.js do pacote so reexporta Mp3Encoder/WavHeader — Lib.MPEGMode e
    // Lib.Lame sempre foram undefined aqui, por isso o encoder quebrava com
    // "Cannot read properties of undefined (reading 'NOT_SET')". Corrigido carregando as
    // classes reais direto dos arquivos-fonte do pacote.
    const Lib = (lamejs as any).default || lamejs;
    if (typeof (globalThis as any).MPEGMode === "undefined") {
        (globalThis as any).MPEGMode = require("lamejs/src/js/MPEGMode.js");
    }
    if (typeof (globalThis as any).Lame === "undefined") {
        (globalThis as any).Lame = require("lamejs/src/js/Lame.js");
    }
    if (typeof (globalThis as any).BitStream === "undefined") {
        (globalThis as any).BitStream = require("lamejs/src/js/BitStream.js");
    }

    const mp3encoder = new Lib.Mp3Encoder(1, 24000, 128);
    const mp3Data = mp3encoder.encodeBuffer(samples);
    if (mp3Data.length > 0) mp3Buffer.push(mp3Data);
    const mp3DataEnd = mp3encoder.flush();
    if (mp3DataEnd.length > 0) mp3Buffer.push(mp3DataEnd);

    const mergedMp3 = new Uint8Array(mp3Buffer.reduce((acc, curr) => acc + curr.length, 0));
    let offset = 0;
    for (const buf of mp3Buffer) {
        mergedMp3.set(new Uint8Array(buf), offset);
        offset += buf.length;
    }

    let mp3Binary = "";
    for (let i = 0; i < mergedMp3.length; i += CHUNK_SIZE) {
        mp3Binary += String.fromCharCode(...mergedMp3.subarray(i, i + CHUNK_SIZE));
    }
    mp3Base64 = btoa(mp3Binary);
  } catch (e) {
    console.error("Erro na transmutação para MP3:", e);
  }

  return { wav: audioBase64, mp3: mp3Base64 };
}

/**
 * Natural Audio Generation using Gemini 3.1 TTS
 */
export async function generateNaturalAudio(
  text: string,
  voice: GeminiTtsVoice = 'Kore',
  direction = "Voz natural, didática e expressiva em português brasileiro.",
  retries = 3
): Promise<{ wav: string, mp3: string | null }> {
  let response;
  try {
    response = await generateGeminiContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{
        parts: [{
          text:
            "Sintetize somente o conteúdo depois de TRANSCRIÇÃO. Não leia estas instruções em voz alta.\n" +
            `DIREÇÃO DE VOZ: ${direction}\n` +
            "CENA: mentoria educacional em uma jornada fantástica, com naturalidade e emoção controlada.\n" +
            `TRANSCRIÇÃO:\n${text}`,
        }],
      }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    }, resolveGeminiTtsFallbackModels());
  } catch (error: any) {
    const isRateLimit = error?.message?.includes("429")
      || error?.message?.includes("quota")
      || error?.message?.includes("RESOURCE_EXHAUSTED");
    if (retries > 0 && isRateLimit) {
      const delay = (4 - retries) * 5000;
      console.warn(`[brainhex] TTS rate-limit — retry em ${delay/1000}s (${retries} restantes)`);
      await new Promise((r) => setTimeout(r, delay));
      return generateNaturalAudio(text, voice, direction, retries - 1);
    }
    throw error;
  }

  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) throw new Error("A voz mística falhou em se materializar.");

  // Gemini returns raw PCM 24kHz. We need to add a WAV header for the browser to play it in <audio>
  const pcmBinary = atob(data);
  const pcmBuffer = new Uint8Array(pcmBinary.length).map((_, i) => pcmBinary.charCodeAt(i));
  return encodePcmToWavAndMp3(pcmBuffer);
}

function splitTtsChapters(text: string, maxChars = 6_000): string[] {
  const paragraphs = String(text || "")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chapters: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) chapters.push(current);
      const speakerPrefix = paragraph.match(/^([^:\n]{1,40}: )/)?.[1] ?? "";
      const body = speakerPrefix ? paragraph.slice(speakerPrefix.length) : paragraph;
      const sliceSize = Math.max(1, maxChars - speakerPrefix.length);
      for (let start = 0; start < body.length; start += sliceSize) {
        chapters.push(`${speakerPrefix}${body.slice(start, start + sliceSize)}`);
      }
      current = "";
      continue;
    }
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChars) {
      chapters.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }
  if (current) chapters.push(current);
  return chapters.length > 0 ? chapters : [String(text || "")];
}

function wavBase64ToPcm(wavBase64: string): Uint8Array {
  const binary = atob(wavBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.length > 44 ? bytes.slice(44) : bytes;
}

async function joinAudioChapters(
  chapters: string[],
  synthesize: (chapter: string) => Promise<{ wav: string; mp3: string | null }>,
): Promise<{ wav: string; mp3: string | null }> {
  if (chapters.length === 1) return synthesize(chapters[0]);
  const pcmParts: Uint8Array[] = [];
  for (const chapter of chapters) {
    const rendered = await synthesize(chapter);
    pcmParts.push(wavBase64ToPcm(rendered.wav));
  }
  const total = pcmParts.reduce((sum, part) => sum + part.length, 0);
  const pcm = new Uint8Array(total);
  let offset = 0;
  for (const part of pcmParts) {
    pcm.set(part, offset);
    offset += part.length;
  }
  return encodePcmToWavAndMp3(pcm);
}

export async function generateLongNaturalAudio(
  text: string,
  voice: GeminiTtsVoice = "Kore",
  direction = "Voz natural, didática e expressiva em português brasileiro.",
): Promise<{ wav: string; mp3: string | null }> {
  return joinAudioChapters(
    splitTtsChapters(text),
    (chapter) => generateNaturalAudio(chapter, voice, direction),
  );
}

/**
 * Diálogo entre 2 guardiões via Gemini TTS multi-speaker (usado hoje só pelo Socializador:
 * Mateo + Zuri). O texto precisa vir com cada linha prefixada por "NomeDoSpeaker: " — o Gemini
 * casa esse prefixo com `speaker` em speakerVoiceConfigs para trocar de voz por fala.
 */
export async function generateConversationalAudio(
  text: string,
  speakerA: { name: string; voice: GeminiTtsVoice; direction?: string },
  speakerB: { name: string; voice: GeminiTtsVoice; direction?: string },
  retries = 3
): Promise<{ wav: string, mp3: string | null }> {
  let response;
  try {
    response = await generateGeminiContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{
        parts: [{
          text:
            "Sintetize somente o diálogo depois de TRANSCRIÇÃO. Não leia estas instruções em voz alta.\n" +
            `DIREÇÃO DE ${speakerA.name}: ${speakerA.direction ?? "voz natural e expressiva"}\n` +
            `DIREÇÃO DE ${speakerB.name}: ${speakerB.direction ?? "voz natural e expressiva"}\n` +
            "CENA: conversa calorosa entre mentores durante uma jornada educacional fantástica.\n" +
            `TRANSCRIÇÃO:\n${text}`,
        }],
      }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: speakerA.name, voiceConfig: { prebuiltVoiceConfig: { voiceName: speakerA.voice } } },
              { speaker: speakerB.name, voiceConfig: { prebuiltVoiceConfig: { voiceName: speakerB.voice } } },
            ],
          },
        },
      },
    }, resolveGeminiTtsFallbackModels());
  } catch (error: any) {
    const isRateLimit = error?.message?.includes("429")
      || error?.message?.includes("quota")
      || error?.message?.includes("RESOURCE_EXHAUSTED");
    if (retries > 0 && isRateLimit) {
      const delay = (4 - retries) * 5000;
      console.warn(`[brainhex] TTS rate-limit (dialogo) — retry em ${delay/1000}s (${retries} restantes)`);
      await new Promise((r) => setTimeout(r, delay));
      return generateConversationalAudio(text, speakerA, speakerB, retries - 1);
    }
    throw error;
  }

  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) throw new Error("A conversa mística falhou em se materializar.");

  const pcmBinary = atob(data);
  const pcmBuffer = new Uint8Array(pcmBinary.length).map((_, i) => pcmBinary.charCodeAt(i));
  return encodePcmToWavAndMp3(pcmBuffer);
}

export async function generateLongConversationalAudio(
  text: string,
  speakerA: { name: string; voice: GeminiTtsVoice; direction?: string },
  speakerB: { name: string; voice: GeminiTtsVoice; direction?: string },
): Promise<{ wav: string; mp3: string | null }> {
  return joinAudioChapters(
    splitTtsChapters(text),
    (chapter) => generateConversationalAudio(chapter, speakerA, speakerB),
  );
}

// addWavHeader extraído para src/lib/wav.ts (testado).

/**
 * Generates a high-quality 2D magical animation image for a slide
 * Includes a robust retry mechanism for rate limits (429)
 */
export async function generateSlideImage(prompt: string, retries = 3): Promise<string> {
  try {
    const response = await generateGeminiContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: `Professional 2D concept art, sticker style, clean lines, vibrant colors, magical alchemy theme, center composition: ${prompt}`,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
        },
      },
    }, resolveGeminiImageFallbackModels());

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
    
    throw new Error("A imagem sagrada não pôde ser materializada.");
  } catch (error: any) {
    // Check for rate limit or quota exceeded
    const isRateLimit = error.message?.includes("429") || 
                        error.message?.includes("quota") || 
                        error.message?.includes("RESOURCE_EXHAUSTED");

    if (retries > 0 && isRateLimit) {
      const delay = (4 - retries) * 5000; // Progressive delay: 5s, 10s, 15s
      console.warn(`Ritual de Cadência: Cota excedida. Tentando novamente em ${delay/1000}s... (${retries} tentativas restantes)`);
      await new Promise(r => setTimeout(r, delay));
      return generateSlideImage(prompt, retries - 1);
    }
    throw error;
  }
}

// --- REGENERAÇÃO/EXPANSÃO COM PROMPT DO PROFESSOR ---
// Usa executeWithModelFallback (motor portado acima) para regenerar UM
// capítulo, UM slide ou o documento completo com um prompt de melhoria livre
// — reaproveita a geração de áudio/imagem já existentes (generateNaturalAudio,
// generateSlideImage), não duplica esse pipeline.

export interface RegenerateOptions {
  expansionPrompt?: string;
  keysConfig?: ApiKeysConfig;
}

export interface RegeneratedChapterContent {
  markdown: string;
  audioScript: string;
  audioWavBase64: string | null;
  audioMp3Base64: string | null;
}

/**
 * Regenera markdown + audioScript de um capítulo já gerado, a partir de um
 * prompt de melhoria do professor. Não mexe nos slides do capítulo — quem
 * quiser regenerar um slide específico usa regenerateSlideContent.
 */
export async function regenerateChapterContent(
  chapter: { markdown: string; audioScript: string },
  improvementPrompt: string,
  profile: BrainHexProfile,
  options: RegenerateOptions = {},
): Promise<RegeneratedChapterContent> {
  const config = BRAIN_HEX_CONFIG[profile];
  const systemInstruction = `
    Você é o Guia Alquímico ${config.guideName} (perfil ${profile}).
    Sua missão é APRIMORAR E REGERAR ESTE CAPÍTULO COMPLETO com base no prompt de
    melhoria do professor. O prompt orienta COMO apresentar/aprofundar o
    conteúdo - ele nunca autoriza omitir conceitos técnicos que já estavam
    corretos no capítulo atual (Fidelidade Absoluta continua valendo).
    ${options.expansionPrompt ? `DIRETRIZ DE EXPANSÃO GERAL (aplique também): "${options.expansionPrompt}"` : ""}
  `;
  const contentsParts = [{
    text: `CAPÍTULO ATUAL:\n${JSON.stringify({ markdown: chapter.markdown, audioScript: chapter.audioScript }, null, 2)}\n\n`
      + `PROMPT DE MELHORIA DO PROFESSOR:\n"${improvementPrompt}"\n\n`
      + "Gere uma versão aprimorada dos campos 'markdown' e 'audioScript'.",
  }];
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      markdown: { type: Type.STRING },
      audioScript: { type: Type.STRING },
    },
    required: ["markdown", "audioScript"],
  };
  const updated = await executeWithModelFallback<{ markdown: string; audioScript: string }>({
    contentsParts,
    systemInstruction,
    responseSchema,
    customKeys: options.keysConfig,
    temperature: 0.6,
  });
  const voiceProfile = GUARDIAN_VOICE_PROFILES[profile];
  const audio = await generateNaturalAudio(updated.audioScript, voiceProfile.voice, voiceProfile.direction);
  return {
    markdown: updated.markdown,
    audioScript: updated.audioScript,
    audioWavBase64: audio.wav,
    audioMp3Base64: audio.mp3,
  };
}

/**
 * Regenera um slide específico a partir de um prompt de melhoria do
 * professor, incluindo uma nova imagem quando o slide regenerado produz um
 * imagePrompt/visualDescription. Preserva o formato de SlideContent atual
 * (iconPrompts, não audioScript por slide).
 */
export async function regenerateSlideContent(
  slide: SlideContent,
  improvementPrompt: string,
  profile: BrainHexProfile,
  options: RegenerateOptions = {},
): Promise<{ slide: SlideContent; imageBase64: string | null }> {
  const config = BRAIN_HEX_CONFIG[profile];
  const systemInstruction = `
    Você é o Guia Alquímico ${config.guideName} (perfil ${profile}).
    Sua missão é APRIMORAR E REGERAR UM SLIDE ESPECÍFICO conforme o prompt de
    melhoria do professor. Mantenha a riqueza conceitual e o tom do guia;
    preserve os sourceIds originais do slide.
    ${options.expansionPrompt ? `DIRETRIZ DE EXPANSÃO GERAL (aplique também): "${options.expansionPrompt}"` : ""}
  `;
  const contentsParts = [{
    text: `SLIDE ATUAL:\n${JSON.stringify(slide, null, 2)}\n\n`
      + `PROMPT DE MELHORIA DO PROFESSOR:\n"${improvementPrompt}"\n\n`
      + "Reescreva e aprimore todos os campos do slide (title, topics, "
      + "explanation, visualDescription, characterQuote, characterAction, "
      + "imagePrompt, iconPrompts, sourceIds) atendendo ao pedido do professor.",
  }];
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      topics: { type: Type.ARRAY, items: { type: Type.STRING } },
      explanation: { type: Type.STRING },
      visualDescription: { type: Type.STRING },
      characterQuote: { type: Type.STRING },
      characterAction: { type: Type.STRING },
      imagePrompt: { type: Type.STRING },
      iconPrompts: { type: Type.ARRAY, items: { type: Type.STRING } },
      sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: [
      "title", "topics", "explanation", "visualDescription", "characterQuote",
      "characterAction", "imagePrompt", "iconPrompts", "sourceIds",
    ],
  };
  const updatedSlide = await executeWithModelFallback<SlideContent>({
    contentsParts,
    systemInstruction,
    responseSchema,
    customKeys: options.keysConfig,
    temperature: 0.6,
  });

  let imageBase64: string | null = null;
  const promptForImage = updatedSlide.imagePrompt || updatedSlide.visualDescription || updatedSlide.title;
  if (promptForImage) {
    try {
      imageBase64 = await generateSlideImage(promptForImage, 2);
    } catch (err) {
      console.warn(
        "[regenerate-engine] falha ao gerar imagem do slide regenerado:",
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { slide: updatedSlide, imageBase64 };
}

const REGENERATE_DOCUMENT_MAX_INPUT_CHARS = 16_000;

/**
 * Regenera o documento de estudo completo (markdown + audioScript) a partir
 * de um prompt de melhoria do professor. Trunca o documento de entrada em
 * REGENERATE_DOCUMENT_MAX_INPUT_CHARS para manter a chamada dentro de um
 * orçamento de prompt razoável em documentos muito grandes.
 */
export async function regenerateDocumentMarkdown(
  currentMarkdown: string,
  improvementPrompt: string,
  profile: BrainHexProfile,
  options: RegenerateOptions = {},
): Promise<{ markdown: string; audioScript: string }> {
  const config = BRAIN_HEX_CONFIG[profile];
  const truncated = currentMarkdown.length > REGENERATE_DOCUMENT_MAX_INPUT_CHARS;
  const documentForPrompt = truncated
    ? `${currentMarkdown.slice(0, REGENERATE_DOCUMENT_MAX_INPUT_CHARS)}\n\n[...documento truncado para a chamada de regeneração...]`
    : currentMarkdown;

  const systemInstruction = `
    Você é o Guia Alquímico ${config.guideName} (perfil ${profile}).
    Reescreva e aprimore o documento de estudo completo abaixo de acordo com o
    prompt de melhoria do professor, preservando a Fidelidade Absoluta ao
    conteúdo técnico original.
    ${options.expansionPrompt ? `DIRETRIZ DE EXPANSÃO GERAL (aplique também): "${options.expansionPrompt}"` : ""}
  `;
  const contentsParts = [{
    text: `DOCUMENTO ATUAL:\n${documentForPrompt}\n\n`
      + `PROMPT DE MELHORIA DO PROFESSOR:\n"${improvementPrompt}"\n\n`
      + "Gere a versão aprimorada dos campos 'markdown' e 'audioScript'.",
  }];
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      markdown: { type: Type.STRING },
      audioScript: { type: Type.STRING },
    },
    required: ["markdown", "audioScript"],
  };
  return executeWithModelFallback<{ markdown: string; audioScript: string }>({
    contentsParts,
    systemInstruction,
    responseSchema,
    customKeys: options.keysConfig,
    temperature: 0.6,
  });
}
