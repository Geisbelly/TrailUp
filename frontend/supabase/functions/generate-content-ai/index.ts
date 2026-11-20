import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import {
  chamarGeminiComRotacao,
  GeminiInalcancavel,
  novoEstadoDaRotacao,
  PrazoDoGeminiEsgotado,
  type RespostaGemini,
} from "./rotacaoGemini.ts";
import { limiteAposCorte, limiteDoDetalhe, usoDeTokens } from "./limiteDeSaida.ts";
import {
  instrucaoDeFiguras,
  lerAnexos,
  limparMarcadoresDeFigura,
  montarPartesDosAnexos,
  type ParteGemini,
  type PartesDosAnexos,
} from "./anexosDaTrilha.ts";
import { limitesDoEsqueleto, MAX_TOPICOS, quantidadeDeTopicos, regrasDaQuantidade } from "./quantidadeDeTopicos.ts";
import { lerPaginaDoLink, linkPublicoSeguro, urlDoYouTube, type RelatoDoMaterial } from "./materialDoConteudo.ts";
import { respostasDaLacuna } from "./respostasDaLacuna.ts";
import { blocoDaOrientacao, orientacaoDoPedido, type Orientacao } from "./orientacao.ts";
import { DESAFIOS_COMPLETOS, DESAFIOS_SCHEMA, normalizarDesafios, promptDeDesafios, type DesafiosNormalizados } from "./desafios.ts";
import {
  blocoDosExistentes,
  criarFiltroDeRepetidas,
  existentesDoPedido,
  type Existentes,
  type FiltroDeRepetidas,
} from "./repetidas.ts";
import { autorizar, pareceChaveDeServico } from "./pedidoDoServidor.ts";
import { criarConferenciaDeServico } from "../storage-upload-url/pedido.ts";

/** Parte do pedido ao Gemini: texto, arquivo inline ou arquivo por URL (o vídeo do YouTube). */
type ParteDoPedido = ParteGemini | { fileData: { fileUri: string; mimeType?: string } };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_PRIMARY_MODEL = "gemini-3.6-flash";
// Cota do tier free e por (chave, modelo): quando o principal esgota, os
// "lite" da mesma serie ainda costumam responder. Sobrescreva com
// GEMINI_FALLBACK_MODELS (separados por virgula) sem precisar de deploy.
const GEMINI_DEFAULT_FALLBACK_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
// Chave esgotada e modelo sobrecarregado ficam de fora por um tempo nesta
// instancia, pra nao gastar ida e volta neles a cada pedido. Qual falha pula
// o que esta em rotacaoGemini.ts.
const geminiRotacao = novoEstadoDaRotacao();

function splitList(raw: string | undefined | null): string[] {
  return String(raw ?? "")
    .split(/[,;\s]+/)
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function geminiModels(): string[] {
  const fallbacks = splitList(Deno.env.get("GEMINI_FALLBACK_MODELS"));
  const list = [GEMINI_PRIMARY_MODEL, ...(fallbacks.length ? fallbacks : GEMINI_DEFAULT_FALLBACK_MODELS)];
  return Array.from(new Set(list));
}

/**
 * Chama o Gemini percorrendo todas as chaves de GEMINI_API_KEY (aceita
 * varias, separadas por virgula ou ponto e virgula, como na API) e os
 * modelos de reserva. Devolve a primeira resposta que nao seja de cota,
 * credito ou sobrecarga; se todas forem, devolve a ultima.
 */
// Sem `any`: o eslint do frontend (no-explicit-any) varre esta pasta. Os dois
// chamadores fazem cast explicito ao navegar candidates[0].content.parts.
type GeminiResult = { res: Response; apiData: JsonRecord };

// Teto de tempo de UMA requisicao a esta funcao. O Supabase mata o worker
// em 150 s de relogio no plano Free (546 WORKER_LIMIT, sem corpo) e o
// gateway desiste antes disso (504). Parar em 120 s deixa a funcao devolver
// um erro legivel em vez de morrer calada. Nao e por chamada ao Gemini: e o
// orcamento da requisicao inteira, que todas as tentativas dividem.
const REQUEST_BUDGET_MS = 120 * 1000;

function aiTimeoutError(): AiStructuredError {
  return new AiStructuredError(
    "A IA demorou demais para responder. Tente de novo em instantes.",
    "ai_timeout",
    504,
  );
}

async function fetchGemini(rawKeys: string, body: unknown, deadline?: number): Promise<GeminiResult> {
  const keys = splitList(rawKeys);
  if (keys.length === 0) keys.push(rawKeys);
  try {
    const resposta: RespostaGemini = await chamarGeminiComRotacao({
      chaves: keys,
      modelos: geminiModels(),
      modeloPrincipal: GEMINI_PRIMARY_MODEL,
      corpo: JSON.stringify(body),
      estado: geminiRotacao,
      prazo: deadline,
      fetch,
      log: { info: (msg) => console.log(msg), warn: (msg) => console.warn(msg) },
    });
    return resposta as GeminiResult;
  } catch (error) {
    if (error instanceof PrazoDoGeminiEsgotado) throw aiTimeoutError();
    if (error instanceof GeminiInalcancavel) {
      throw new AiStructuredError(
        "Nao foi possivel conectar ao Gemini.",
        "gemini_network_error",
        502,
        { cause: error.causa instanceof Error ? error.causa.message : String(error.causa) },
      );
    }
    throw error;
  }
}

function geminiHttpError(status: number, apiData: JsonRecord): AiStructuredError {
  // 402 (credito esgotado) tambem e falta de cota pra quem usa: mesma mensagem do 429.
  const quota = status === 429 || status === 402;
  return new AiStructuredError(
    quota ? "Limite temporario do Gemini atingido. Tente novamente em instantes." : "Gemini API error",
    quota ? "gemini_rate_limit" : "gemini_error",
    quota ? 429 : 502,
    { upstream_status: status, response: apiData },
  );
}

type JsonRecord = Record<string, unknown>;

interface ContentItem {
  titulo: string;
  tipo: string;
  conteudo: string | null;
}

interface AiSourceFile {
  name: string;
  mimeType?: string | null;
  storagePath?: string | null;
  publicUrl?: string | null;
  base64?: string | null;
}

interface AiSourceInput {
  sourceRef?: string | null;
  titulo: string;
  tipo: string;
  conteudo?: string | null;
  markdown?: string | null;
  texto?: string | null;
  url?: string | null;
  files?: AiSourceFile[];
  existingContent?: boolean;
}

interface TrailSkeletonTopic {
  nome: string;
  descricao: string;
  ordem: number;
  depende: number[];
  next: number[];
  arquivos_relacionados: string[];
}


interface RequestBody {
  mode?: "all" | "content" | "description" | "desafios" | "trail" | "trail-skeleton" | "trail-topic";
  /** trail-topic: o topico do esqueleto a detalhar, a posicao dele e o total. */
  topic?: unknown;
  topicIndex?: number;
  totalTopics?: number;
  topicName?: string;
  topicDescription?: string;
  contents?: ContentItem[];
  sources?: AiSourceInput[];
  trailDescription?: string;
  /** Quantidade de topicos escolhida pelo professor; ausente ou nulo = automatico. */
  numTopics?: number | null;
  topicNames?: string[];
  syllabus?: string;
  fileContents?: string;
  fileNames?: string[];
  /** Arquivos do professor como o Gemini os le (ver anexosDaTrilha.ts). */
  anexos?: unknown;
  // Contexto pedagogico usado nos modos description/content
  materiaNome?: string;
  materiaDescricao?: string;
  classeNome?: string;
  topicoNome?: string;
  topicoDescricao?: string;
  personalizacaoThemeGuide?: unknown;
  /** Modo `content`: video do YouTube do conteudo, que o Gemini assiste. */
  videoUrl?: string;
  /** Modo `content`: link externo do conteudo, que a funcao le. */
  linkUrl?: string;
  /** Orientacao do professor da turma (`classe_orientacao_ia`): `{ pedir, evitar }`. Vale em todo modo. */
  orientacao?: unknown;
  /**
   * Perguntas que ja existem e nao podem voltar: `{ questoes, cards }`. No modo
   * `content`, as do topico; na trilha, as dos outros topicos da proposta.
   */
  existentes?: unknown;
}
type GeminiCallOptions = {
  key: string;
  prompt: string;
  maxOutputTokens: number;
  responseSchema?: JsonRecord;
  /** Arquivos (PDF, imagens, texto extraido) que vao antes do prompt. */
  partes?: ParteGemini[];
  /** Instante (Date.now()) em que a requisicao tem de parar de chamar o Gemini. */
  deadline?: number;
};

const textDecoder = new TextDecoder("utf-8");

class AiStructuredError extends Error {
  code: string;
  details?: unknown;
  status: number;

  constructor(message: string, code: string, status = 422, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function decodeBase64Utf8(value: string): string {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  return textDecoder.decode(bytes);
}

function stripCodeFence(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractJsonCandidate(value: string): string | null {
  const trimmed = value.trim();
  const firstObject = trimmed.indexOf("{");
  const firstArray = trimmed.indexOf("[");
  const start =
    firstObject >= 0 && firstArray >= 0 ? Math.min(firstObject, firstArray) : Math.max(firstObject, firstArray);
  if (start < 0) return null;

  const opening = trimmed[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === opening) depth += 1;
    if (char === closing) depth -= 1;

    if (depth === 0) {
      return trimmed.slice(start, i + 1);
    }
  }

  return null;
}

function tryParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseGeminiJson(raw: string): unknown | null {
  const cleaned = stripCodeFence(raw);
  const direct = tryParse(cleaned);
  if (direct) return direct;

  const candidate = extractJsonCandidate(cleaned) ?? extractJsonCandidate(raw);
  if (!candidate) return null;
  return tryParse(stripCodeFence(candidate));
}

function normalizeSources(body: RequestBody): AiSourceInput[] {
  if (body.sources?.length) return body.sources;
  return (body.contents ?? []).map((content, index) => ({
    sourceRef: `legacy:${index + 1}`,
    titulo: content.titulo,
    tipo: content.tipo,
    conteudo: content.conteudo,
    texto: content.tipo === "texto" ? content.conteudo : null,
    markdown: content.tipo === "markdown" ? content.conteudo : null,
  }));
}

function extractSourceText(source: AiSourceInput): string | null {
  const directText = source.texto?.trim() || source.markdown?.trim() || source.conteudo?.trim() || "";
  if (directText) return directText;

  for (const file of source.files ?? []) {
    const mimeType = file.mimeType?.toLowerCase() ?? "";
    const fileName = file.name.toLowerCase();
    const isTextLike =
      mimeType.startsWith("text/") ||
      mimeType.includes("json") ||
      fileName.endsWith(".md") ||
      fileName.endsWith(".txt") ||
      fileName.endsWith(".csv");
    if (!isTextLike || !file.base64) continue;

    try {
      const decoded = decodeBase64Utf8(file.base64).trim();
      if (decoded) return decoded;
    } catch {
      continue;
    }
  }

  return null;
}

function buildSourceBlock(sources: AiSourceInput[], fileContents?: string, fileNames?: string[]): string {
  const extracted = sources
    .map((source) => {
      const extractedText = extractSourceText(source);
      if (!extractedText) return null;
      return [
        `Fonte: ${source.titulo}`,
        `Tipo: ${source.tipo}`,
        source.sourceRef ? `Referencia: ${source.sourceRef}` : null,
        extractedText.substring(0, 9000),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean);

  const materialParts: string[] = [];
  if (extracted.length > 0) {
    materialParts.push(
      "MATERIAL EXTRAIDO DAS FONTES:",
      extracted.map((item, index) => `\n[${index + 1}]\n${item}`).join("\n"),
    );
  }

  const normalizedFileContents = fileContents?.trim() ?? "";
  if (normalizedFileContents) {
    materialParts.push(
      "MATERIAL FORNECIDO PELO PROFESSOR:",
      fileNames?.length ? `Arquivos: ${fileNames.join(", ")}\n` : "",
      normalizedFileContents.substring(0, 20000),
    );
  } else if (fileNames?.length) {
    materialParts.push(`Arquivos fornecidos (sem texto extraido): ${fileNames.join(", ")}`);
  }

  if (materialParts.length === 0) return "";
  return `\n\n${materialParts.filter(Boolean).join("\n")}`;
}

/**
 * Regra comum aos prompts que geram atividade. O modelo chamava o mesmo conceito por dois nomes
 * (o card dizia "anomalia de insercao" e a lacuna so aceitava "inclusao"), e o aluno que usava o
 * nome do card errava. A lacuna e corrigida contra cada forma separada por "|" (app e
 * `fn_questao_respostas_aceitas` no banco), entao os sinonimos vao no proprio gabarito.
 */
/**
 * O prompt sem acento ensinava o modelo a escrever sem acento: na turma 70,
 * 2 dos 23 textos saíram com "nao", "informacoes", "O que e". A exigência
 * fica escrita, e escrita com acento.
 */
const IDIOMA = "Idioma obrigatório: português do Brasil, com acentuação e pontuação corretas (não, são, função, informações). Texto sem acento é erro.";

const REGRAS_DE_TERMOS = `- Use o mesmo nome para o mesmo conceito em todos os cards e atividades: o termo que o material usa. Se o material usa dois nomes para a mesma coisa (ex.: "anomalia de inserção" e "anomalia de inclusão"), escolha um e mantenha-o em tudo.
- Para tipo "fill_blank", "resposta_correta" lista TODAS as formas aceitas, separadas por " | ": o termo escolhido e os sinônimos que o material usa para ele (ex.: "inserção | inclusão"). Só entram nomes diferentes: não repita a mesma palavra mudando maiúscula, acento ou pontuação ("CONCAT | concat"), porque a correção já ignora isso. O aluno digita a resposta, e uma forma correta que não estiver listada pode ser corrigida como errada.`;

function normalizeActivityType(value: unknown): "quiz" | "questao" | "texto" | "true_false" | "fill_blank" {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "quiz") return "quiz";
  if (normalized === "questao") return "questao";
  if (normalized === "texto") return "texto";
  if (normalized === "true_false" || normalized === "verdadeiro_falso") return "true_false";
  if (normalized === "fill_blank" || normalized === "lacuna") return "fill_blank";
  return "quiz";
}

function normalizeMediaType(value: unknown): "video" | "audio" | "pdf" | "documento" | "apresentacao" {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "video") return "video";
  if (normalized === "audio") return "audio";
  if (normalized === "pdf") return "pdf";
  if (normalized === "apresentacao") return "apresentacao";
  return "documento";
}

function toIntArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out = value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.trunc(item));
  return Array.from(new Set(out));
}

function ensureObjectArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object");
}

function countSkeletonTopics(payload: unknown): number {
  const topicos = (payload as JsonRecord | null)?.topicos;
  return Array.isArray(topicos) ? topicos.length : 0;
}

function normalizeTrailSkeleton(
  payload: unknown,
  desiredTopics: number | null,
  topicNames: string[] = [],
): TrailSkeletonTopic[] {
  const rawTopics = Array.isArray((payload as JsonRecord)?.topicos)
    ? ((payload as JsonRecord).topicos as unknown[])
    : [];

  const fallbackNames = topicNames.filter((item) => item.trim().length > 0);
  const topics: TrailSkeletonTopic[] = [];

  const maxTopics = desiredTopics === null ? MAX_TOPICOS : clampInt(desiredTopics, 1, MAX_TOPICOS);
  // Sem resposta util: com quantidade escolhida, monta os nomes pelo que o
  // professor listou; no automatico nao ha o que montar (vira erro abaixo).
  const source =
    rawTopics.length > 0 ? rawTopics.slice(0, maxTopics) : Array.from({ length: desiredTopics === null ? 0 : maxTopics }, () => ({}));

  source.forEach((item, index) => {
    const record = (item && typeof item === "object" ? (item as JsonRecord) : {}) as JsonRecord;
    const ordem = index + 1;
    const fallbackName = fallbackNames[index] || `Topico ${ordem}`;
    const nome = String(record.nome ?? fallbackName).trim() || fallbackName;
    const descricao =
      String(record.descricao ?? `Explorar os fundamentos de ${nome}.`).trim() ||
      `Explorar os fundamentos de ${nome}.`;

    const dependsRaw = toIntArray(record.depende).filter((dep) => dep > 0 && dep < ordem);
    const nextRaw = toIntArray(record.next).filter((next) => next > ordem && next <= maxTopics);
    const arquivos = Array.isArray(record.arquivos_relacionados)
      ? Array.from(new Set((record.arquivos_relacionados as unknown[]).map((v) => String(v).trim()).filter(Boolean)))
      : [];

    topics.push({
      nome,
      descricao,
      ordem,
      depende: dependsRaw,
      next: nextRaw,
      arquivos_relacionados: arquivos,
    });
  });

  if (topics.length === 0) {
    throw new AiStructuredError("Nao foi possivel gerar topicos para a trilha.", "trail_skeleton_empty");
  }

  for (let i = 0; i < topics.length; i += 1) {
    const current = topics[i];
    if (i === 0) {
      current.depende = [];
    } else if (current.depende.length === 0) {
      current.depende = [i];
    }
    if (i < topics.length - 1 && current.next.length === 0) {
      current.next = [i + 2];
    }
  }

  const byOrder = new Map<number, TrailSkeletonTopic>();
  topics.forEach((topic) => byOrder.set(topic.ordem, topic));

  topics.forEach((topic) => {
    topic.next.forEach((next) => {
      const target = byOrder.get(next);
      if (!target) return;
      if (!target.depende.includes(topic.ordem)) target.depende.push(topic.ordem);
    });
    topic.depende.forEach((dep) => {
      const sourceTopic = byOrder.get(dep);
      if (!sourceTopic) return;
      if (!sourceTopic.next.includes(topic.ordem)) sourceTopic.next.push(topic.ordem);
    });
    topic.depende = Array.from(new Set(topic.depende)).sort((a, b) => a - b);
    topic.next = Array.from(new Set(topic.next)).sort((a, b) => a - b);
  });

  return topics;
}

function computeContentTarget(
  topicIndex: number,
  totalTopics: number,
  totalSignals: number,
  relatedFilesCount: number,
): number {
  const base = clampInt(totalSignals / Math.max(totalTopics, 1), 1, 4);
  const filePressure = clampInt(relatedFilesCount, 1, 4);
  const weighted = Math.max(base, filePressure);
  if (topicIndex === 0 && totalSignals > totalTopics) return clampInt(weighted + 1, 1, 4);
  return clampInt(weighted, 1, 4);
}

async function callGeminiJson(options: GeminiCallOptions): Promise<{ parsed: unknown; rawText: string; finishReason: string }> {
  const attemptConfigs: Array<{ useSchema: boolean }> = options.responseSchema
    ? [{ useSchema: true }, { useSchema: false }]
    : [{ useSchema: false }];

  let lastError: AiStructuredError | null = null;

  tentativas: for (const attempt of attemptConfigs) {
    let maxOutputTokens = options.maxOutputTokens;
    for (;;) {
      const { res, apiData } = await fetchGemini(options.key, {
        contents: [{ parts: [...(options.partes ?? []), { text: options.prompt }] }],
        generationConfig: {
          maxOutputTokens,
          responseMimeType: "application/json",
          ...(attempt.useSchema && options.responseSchema ? { responseSchema: options.responseSchema } : {}),
        },
      }, options.deadline);
      if (!res.ok) {
        const reason = String((apiData as JsonRecord)?.error ? JSON.stringify((apiData as JsonRecord).error) : "");
        const schemaIssue =
          attempt.useSchema &&
          (reason.toLowerCase().includes("responseschema") ||
            reason.toLowerCase().includes("schema") ||
            reason.toLowerCase().includes("generationconfig"));

        const err = geminiHttpError(res.status, apiData);
        lastError = err;
        if (schemaIssue) continue tentativas;
        throw err;
      }

      const candidate = ((apiData as JsonRecord)?.candidates as JsonRecord[] | undefined)?.[0];
      const finishReason = String(candidate?.finishReason ?? candidate?.finish_reason ?? "").toUpperCase();
      const rawText = String(
        ((candidate?.content as JsonRecord | undefined)?.parts as JsonRecord[] | undefined)?.[0]?.text ?? "{}",
      );

      if (finishReason === "MAX_TOKENS") {
        // O raciocinio do modelo sai do mesmo orcamento: cortar no meio do JSON
        // nao e entrada grande demais, e falta de folga. Uma volta com o dobro.
        const uso = usoDeTokens(apiData);
        const proximo = limiteAposCorte(maxOutputTokens);
        console.warn(
          `gemini: resposta cortada em ${maxOutputTokens} tokens (raciocinio ${uso.raciocinio ?? "?"}, resposta ${uso.resposta ?? "?"})` +
            (proximo ? `; repetindo com ${proximo}` : ""),
        );
        if (proximo !== null) {
          maxOutputTokens = proximo;
          continue;
        }
        throw new AiStructuredError(
          "A resposta da IA ficou longa demais e foi cortada. Tente de novo; se repetir, peca menos topicos ou menos conteudo.",
          "ai_truncated",
          422,
          { finishReason, maxOutputTokens, uso },
        );
      }

      const parsed = parseGeminiJson(rawText);
      if (!parsed) {
        throw new AiStructuredError(
          "Resposta da IA invalida: JSON incompleto ou malformado.",
          "ai_invalid_json",
          422,
          { raw: rawText.substring(0, 2000) },
        );
      }

      return { parsed, rawText, finishReason };
    }
  }

  throw lastError ?? new AiStructuredError("Falha inesperada ao chamar o Gemini.", "gemini_unexpected", 502);
}

const TRAIL_SKELETON_SCHEMA: JsonRecord = {
  type: "OBJECT",
  required: ["topicos"],
  properties: {
    topicos: {
      type: "ARRAY",
      minItems: 1,
      items: {
        type: "OBJECT",
        required: ["nome", "descricao", "ordem", "depende", "next"],
        properties: {
          nome: { type: "STRING" },
          descricao: { type: "STRING" },
          ordem: { type: "NUMBER" },
          depende: { type: "ARRAY", items: { type: "NUMBER" } },
          next: { type: "ARRAY", items: { type: "NUMBER" } },
          arquivos_relacionados: { type: "ARRAY", items: { type: "STRING" } },
        },
      },
    },
  },
};

/** O esquema do esqueleto com o tamanho do array travado na quantidade pedida. */
function skeletonSchema(desiredTopics: number | null): JsonRecord {
  const topicos = (TRAIL_SKELETON_SCHEMA.properties as JsonRecord).topicos as JsonRecord;
  return {
    ...TRAIL_SKELETON_SCHEMA,
    properties: { topicos: { ...topicos, ...limitesDoEsqueleto(desiredTopics) } },
  };
}

const TRAIL_DETAIL_SCHEMA: JsonRecord = {
  type: "OBJECT",
  required: ["conteudos"],
  properties: {
    conteudos: {
      type: "ARRAY",
      minItems: 1,
      items: {
        type: "OBJECT",
        required: ["ref", "titulo", "tipo", "conteudo", "cards", "atividades", "midias"],
        properties: {
          ref: { type: "STRING" },
          titulo: { type: "STRING" },
          tipo: { type: "STRING" },
          conteudo: { type: "STRING" },
          sourceRef: { type: "STRING" },
          cards: {
            type: "ARRAY",
            minItems: 1,
            items: {
              type: "OBJECT",
              required: ["titulo", "descricao", "conteudo_ref", "conteudo_origem_ref", "reaproveitado", "vinculado_ao_conteudo"],
              properties: {
                titulo: { type: "STRING" },
                descricao: { type: "STRING" },
                conteudo_ref: { type: "STRING" },
                conteudo_origem_ref: { type: "STRING" },
                reaproveitado: { type: "BOOLEAN" },
                vinculado_ao_conteudo: { type: "BOOLEAN" },
              },
            },
          },
          atividades: {
            type: "ARRAY",
            minItems: 1,
            items: {
              type: "OBJECT",
              required: ["titulo", "enunciado", "tipo", "resposta_correta"],
              properties: {
                titulo: { type: "STRING" },
                enunciado: { type: "STRING" },
                tipo: { type: "STRING" },
                alternativas: { type: "ARRAY", items: { type: "STRING" } },
                resposta_correta: { type: "STRING" },
                conteudo_ref: { type: "STRING" },
              },
            },
          },
          midias: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              required: ["tipo", "titulo", "descricao"],
              properties: {
                tipo: { type: "STRING" },
                titulo: { type: "STRING" },
                descricao: { type: "STRING" },
                roteiro: { type: "STRING" },
                transcricao: { type: "STRING" },
                url: { type: "STRING" },
                formato_arquivo: { type: "STRING" },
                sourceRef: { type: "STRING" },
              },
            },
          },
        },
      },
    },
  },
};

function normalizeTrailDetails(
  payload: unknown,
  topic: TrailSkeletonTopic,
  contentTarget: number,
  material: {
    arquivos: Map<string, string>;
    figuras: PartesDosAnexos["figuras"];
    /** Barram o card e a atividade que repetem um existente ou um anterior do mesmo topico. */
    filtros?: { cards: FiltroDeRepetidas; questoes: FiltroDeRepetidas };
  },
): JsonRecord[] {
  const contentRecords = ensureObjectArray((payload as JsonRecord)?.conteudos);

  if (contentRecords.length === 0) {
    throw new AiStructuredError(
      `Nao foi possivel gerar conteudos para o topico "${topic.nome}".`,
      "trail_detail_empty",
    );
  }

  const normalized = contentRecords.slice(0, Math.max(contentTarget, 1)).map((record, index) => {
    const ref = String(record.ref ?? `content:${index + 1}`).trim() || `content:${index + 1}`;
    const titulo = String(record.titulo ?? `Conteudo ${index + 1}`).trim() || `Conteudo ${index + 1}`;
    const tipo = String(record.tipo ?? "texto").trim() || "texto";
    const conteudo = limparMarcadoresDeFigura(String(record.conteudo ?? "").trim(), material.figuras);

    const cards = ensureObjectArray(record.cards).filter((card) => material.filtros?.cards.aceitar(String(card.titulo ?? "")) ?? true).map((card, cardIndex) => {
      const conteudoRef = String(card.conteudo_ref ?? ref).trim() || ref;
      const origemRefRaw = String(card.conteudo_origem_ref ?? conteudoRef).trim() || conteudoRef;
      const reaproveitado = Boolean(card.reaproveitado) || origemRefRaw !== conteudoRef;
      const vinculado = Boolean(card.vinculado_ao_conteudo) || conteudoRef === ref;
      return {
        titulo: String(card.titulo ?? `Card ${cardIndex + 1}`).trim() || `Card ${cardIndex + 1}`,
        descricao: String(card.descricao ?? "").trim(),
        conteudo_ref: conteudoRef,
        conteudo_origem_ref: origemRefRaw,
        reaproveitado,
        vinculado_ao_conteudo: vinculado,
      };
    });

    const cardOutput =
      cards.length > 0
        ? cards
        : [
            {
              titulo: `Conceito-chave de ${titulo}`,
              descricao: "Reforce a ideia principal deste conteudo.",
              conteudo_ref: ref,
              conteudo_origem_ref: ref,
              reaproveitado: false,
              vinculado_ao_conteudo: true,
            },
          ];

    const atividades = ensureObjectArray(record.atividades).filter((atividade) => material.filtros?.questoes.aceitar(String(atividade.enunciado ?? "")) ?? true).map((atividade, activityIndex) => {
      const tipoAtividade = normalizeActivityType(atividade.tipo);
      const alternativasRaw = Array.isArray(atividade.alternativas)
        ? (atividade.alternativas as unknown[]).map((item) => String(item))
        : [];
      const alternativas =
        tipoAtividade === "quiz"
          ? alternativasRaw.length >= 4
            ? alternativasRaw.slice(0, 4)
            : ["Opcao A", "Opcao B", "Opcao C", "Opcao D"]
          : tipoAtividade === "true_false"
          ? ["Verdadeiro", "Falso"]
          : [];

      const respostaBruta = String(atividade.resposta_correta ?? alternativas[0] ?? "Revisar o conteudo.").trim();
      const resposta = tipoAtividade === "fill_blank" ? respostasDaLacuna(respostaBruta) || respostaBruta : respostaBruta;

      return {
        titulo: String(atividade.titulo ?? `Atividade ${activityIndex + 1}`).trim() || `Atividade ${activityIndex + 1}`,
        enunciado: String(atividade.enunciado ?? "Resolva com base no conteudo apresentado.").trim(),
        tipo: tipoAtividade,
        alternativas: alternativas.length > 0 ? alternativas : null,
        resposta_correta: resposta,
        conteudo_ref: String(atividade.conteudo_ref ?? ref).trim() || ref,
      };
    });

    const atividadeOutput =
      atividades.length > 0
        ? atividades
        : [
            {
              titulo: `Aplicacao de ${titulo}`,
              enunciado: `Explique com suas palavras o que "${titulo}" ensina.`,
              tipo: "questao",
              alternativas: null,
              resposta_correta: "Resposta aberta alinhada ao conteudo.",
              conteudo_ref: ref,
            },
          ];

    // Midia so existe se aponta para um arquivo que o professor mandou ou para
    // um link. Antes o esquema exigia uma por conteudo e, sem arquivo, vinha um
    // "Resumo de ..." inventado que o console gravava como material vazio.
    const midias = ensureObjectArray(record.midias)
      .map((midia, mediaIndex) => ({
        tipo: normalizeMediaType(midia.tipo),
        titulo: String(midia.titulo ?? `Midia ${mediaIndex + 1}`).trim() || `Midia ${mediaIndex + 1}`,
        descricao: String(midia.descricao ?? "Material complementar.").trim(),
        roteiro: String(midia.roteiro ?? "").trim() || null,
        transcricao: String(midia.transcricao ?? "").trim() || null,
        url: String(midia.url ?? "").trim() || null,
        formato_arquivo: String(midia.formato_arquivo ?? "").trim() || null,
        sourceRef: material.arquivos.get(String(midia.sourceRef ?? "").trim()) ?? null,
      }))
      .filter((midia) => midia.sourceRef !== null || /^https?:\/\//i.test(midia.url ?? ""));

    return {
      ref,
      titulo,
      tipo,
      conteudo,
      sourceRef: String(record.sourceRef ?? "").trim() || null,
      cards: cardOutput,
      atividades: atividadeOutput,
      midias,
    };
  });

  return normalized;
}

type TrailContext = {
  trailDescription: string | undefined;
  fileNames: string[];
  sourceBlock: string;
  sourceGuard: string;
  topicNames: string[];
  /** null = automatico: o modelo escolhe pelo material. */
  desiredTopics: number | null;
  totalSignals: number;
  /** Os arquivos como partes do pedido ao Gemini (PDF inteiro, imagens, texto). */
  material: PartesDosAnexos;
  /**
   * sourceRef de midia aceito -> nome exato do arquivo do professor. Vale o
   * nome e a referencia da fonte (`upload:N`), que o modelo as vezes usa.
   */
  arquivos: Map<string, string>;
  orientacao: Orientacao;
  /** Mutavel: no modo `trail`, cada topico pronto entra aqui para os seguintes nao o repetirem. */
  existentes: Existentes;
};

function buildTrailContext(body: RequestBody, sources: AiSourceInput[]): TrailContext {
  const trailDescription = body.trailDescription?.trim() || body.topicDescription?.trim() || body.topicName;
  const fileNames = (body.fileNames ?? []).map((item) => item.trim()).filter(Boolean);
  const sourceBlock = buildSourceBlock(sources, body.fileContents, fileNames);
  const anexos = lerAnexos(body.anexos);
  const material = montarPartesDosAnexos(anexos);
  const temMaterial = Boolean(sourceBlock) || material.partes.length > 0;

  if (!temMaterial && sources.length > 0) {
    throw new AiStructuredError(
      "Nao foi possivel extrair texto util das fontes enviadas. Envie texto, markdown ou material com texto legivel.",
      "source_extraction_failed",
    );
  }
  if (material.omitidos.length > 0) {
    console.warn(`trilha: arquivos que nao couberam no pedido: ${material.omitidos.join(", ")}`);
  }

  const topicNames = body.topicNames?.map((item) => item.trim()).filter(Boolean) ?? [];
  // O numero do professor vale sempre; arquivos nao o trocam mais (ver quantidadeDeTopicos.ts).
  const desiredTopics = quantidadeDeTopicos(body.numTopics, topicNames);
  const sourceGuard = material.partes.length > 0
    ? "Os arquivos do professor vem anexados antes destas instrucoes: leia-os por inteiro (texto, tabelas, figuras, codigo). " +
      "Construa tudo a partir deles; nao invente conceitos que nao estejam no material."
    : sourceBlock
    ? "Use somente o material fornecido. Nao invente conceitos fora das fontes."
    : "Sem fontes externas: use apenas a descricao do curso para construir uma trilha coerente.";
  const totalSignals = Math.max(fileNames.length, sources.length, anexos.length, body.fileContents?.trim() ? 1 : 0, 1);
  const nomes = new Set([...fileNames, ...anexos.map((anexo) => anexo.nome)]);
  const arquivos = new Map([...nomes].map((nome) => [nome, nome] as [string, string]));
  for (const source of sources) {
    const nome = source.files?.[0]?.name ?? source.titulo;
    if (source.sourceRef && nomes.has(nome)) arquivos.set(source.sourceRef, nome);
  }

  return {
    trailDescription,
    fileNames,
    sourceBlock,
    sourceGuard,
    topicNames,
    desiredTopics,
    totalSignals,
    material,
    arquivos,
    orientacao: orientacaoDoPedido(body.orientacao),
    existentes: existentesDoPedido(body.existentes),
  };
}

async function generateTrailSkeleton(
  ctx: TrailContext,
  body: RequestBody,
  key: string,
  deadline?: number,
): Promise<TrailSkeletonTopic[]> {
  const { trailDescription, fileNames, sourceBlock, sourceGuard, topicNames, desiredTopics } = ctx;
  const skeletonPrompt = `Voce e especialista em design instrucional.
${IDIOMA}
${sourceGuard}

Disciplina/curso: "${trailDescription}"
Quantidade de topicos: ${desiredTopics === null ? "automatica (escolha pelo material)" : desiredTopics}
${topicNames.length > 0 ? `Topicos sugeridos pelo professor:\n${topicNames.map((name, idx) => `${idx + 1}. ${name}`).join("\n")}\n` : ""}
${fileNames.length > 0 ? `Arquivos enviados pelo professor:\n${fileNames.map((name, idx) => `${idx + 1}. ${name}`).join("\n")}\n` : ""}
${body.syllabus?.trim() ? `Ementa complementar:\n${body.syllabus.trim().substring(0, 2500)}\n` : ""}
${sourceBlock}
${blocoDaOrientacao(ctx.orientacao)}
Retorne SOMENTE JSON valido com:
{
  "topicos": [
    {
      "nome": "Nome do topico",
      "descricao": "Descricao curta",
      "ordem": 1,
      "depende": [],
      "next": [2],
      "arquivos_relacionados": ["nome-arquivo.pdf"]
    }
  ]
}

Regras:
${regrasDaQuantidade(desiredTopics, fileNames.length).join("\n")}
- Se houver arquivos, distribua em "arquivos_relacionados" (nome exato do arquivo) os que cada topico usa; um arquivo pode servir a mais de um topico quando o assunto dele se divide.
- A descricao de cada topico diz o que ele cobre do material (conceitos, exemplos), em 1 a 2 frases.
- Evite ciclos em depende/next.
- Organize do basico ao avancado.`;

  const skeletonResult = await callGeminiJson({
    key,
    prompt: skeletonPrompt,
    maxOutputTokens: 8192,
    responseSchema: skeletonSchema(desiredTopics),
    partes: ctx.material.partes,
    deadline,
  });

  let parsed = skeletonResult.parsed;
  const veio = countSkeletonTopics(parsed);
  // O esquema ja trava o tamanho, mas modelo de reserva as vezes ignora: uma
  // volta pedindo o numero de novo antes de cortar (perderia assunto) ou
  // completar com nome generico.
  const temTempo = deadline === undefined || deadline - Date.now() >= TRAIL_DETAIL_RETRY_MIN_REMAINING_MS;
  if (desiredTopics !== null && veio !== desiredTopics && temTempo) {
    try {
      const novo = await callGeminiJson({
        key,
        prompt: `${skeletonPrompt}

ATENCAO: a resposta anterior trouxe ${veio} topicos, mas o professor pediu ${desiredTopics}. Refaca com exatamente ${desiredTopics} topicos, agrupando ou dividindo os assuntos.`,
        maxOutputTokens: 8192,
        responseSchema: skeletonSchema(desiredTopics),
        partes: ctx.material.partes,
        deadline,
      });
      const veioDeNovo = countSkeletonTopics(novo.parsed);
      if (Math.abs(veioDeNovo - desiredTopics) < Math.abs(veio - desiredTopics)) parsed = novo.parsed;
    } catch (error) {
      console.warn(`trail-skeleton: nova tentativa pela quantidade falhou: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return normalizeTrailSkeleton(parsed, desiredTopics, topicNames);
}

// So tenta o detalhe de novo se ainda sobra isso do orcamento da requisicao.
// Com menos, a nova tentativa tende a ser cortada no meio: melhor devolver o
// erro agora e deixar o console repetir o topico numa requisicao nova.
const TRAIL_DETAIL_RETRY_MIN_REMAINING_MS = 45 * 1000;

async function generateTrailTopicDetail(
  ctx: TrailContext,
  topic: TrailSkeletonTopic,
  index: number,
  totalTopics: number,
  key: string,
  deadline?: number,
): Promise<JsonRecord> {
  const { sourceBlock, sourceGuard, totalSignals, material, arquivos } = ctx;
  const contentTarget = computeContentTarget(index, totalTopics, totalSignals, topic.arquivos_relacionados.length);
  const relatedFilesHint =
    topic.arquivos_relacionados.length > 0
      ? `Arquivos prioritarios para este topico: ${topic.arquivos_relacionados.join(", ")}`
      : "Sem arquivo dedicado: use as fontes gerais.";

  const detailPrompt = `Você é especialista em conteúdo didático multimídia.
${IDIOMA}
${sourceGuard}

Tópico atual:
- Nome: ${topic.nome}
- Descrição: ${topic.descricao}
- Ordem: ${topic.ordem}
- Conteúdos alvo para este tópico: ${contentTarget}
- ${relatedFilesHint}

${sourceBlock}
${instrucaoDeFiguras(material.figuras)}
${blocoDaOrientacao(ctx.orientacao)}${blocoDosExistentes(ctx.existentes)}
Retorne SOMENTE JSON valido com:
{
"conteudos": [
  {
    "ref": "content:1",
    "titulo": "Título do conteúdo",
    "tipo": "texto",
    "conteudo": "## Subtítulo\n\nParágrafos que explicam o assunto com o que está no material...",
    "sourceRef": "nome-exato-do-arquivo.pdf",
    "cards": [
      {
        "titulo": "Pergunta ou conceito",
        "descricao": "Resposta",
        "conteudo_ref": "content:1",
        "conteudo_origem_ref": "content:1",
        "reaproveitado": false,
        "vinculado_ao_conteudo": true
      }
    ],
    "atividades": [
      {
        "titulo": "Atividade",
        "enunciado": "Enunciado",
        "tipo": "quiz",
        "alternativas": ["A", "B", "C", "D"],
        "resposta_correta": "A",
        "conteudo_ref": "content:1"
      }
    ],
    "midias": [
      {
        "tipo": "pdf",
        "titulo": "Slides da aula",
        "descricao": "O que o aluno encontra neste arquivo",
        "url": "",
        "formato_arquivo": "pdf",
        "sourceRef": "nome-exato-do-arquivo.pdf"
      }
    ]
  }
]
}

Regras obrigatórias:
- Gere exatamente ${contentTarget} conteúdos para este tópico.
- O campo "conteudo" é a aula que o aluno vai ler: texto completo em markdown, de 350 a 800 palavras, com subtítulos (##), parágrafos que explicam, definições, exemplos e, quando o material tiver, trechos de código, comandos ou tabelas.
- Escreva com todos os acentos ("não", "são", "função", "informações", "é") em títulos, textos, cards e atividades.
- Ensine o que está nos arquivos: use as definições, exemplos, nomes, comandos e números do próprio material. Não resuma em uma frase nem descreva o arquivo ("este material aborda..."): explique o assunto.
- Conteúdos do mesmo tópico não se repetem: divida o assunto entre eles.
- Para CADA conteúdo, gere 2 cards e 1 atividade sobre o que o texto ensinou.
- Nenhuma pergunta (card ou atividade) se repete, nem com outras palavras, dentro do tópico ou com as que já existem.
- "midias" lista só arquivos do professor que o aluno deve abrir junto deste conteúdo, com "sourceRef" igual ao nome exato do arquivo, ou links que estão no material. Sem isso, "midias": []. Nunca invente mídia, roteiro ou arquivo.
- Tipos de atividade permitidos: quiz, questao, texto, true_false, fill_blank.
${REGRAS_DE_TERMOS}
- Tipos de midia permitidos: video, audio, pdf, documento, apresentacao.
- Todo card precisa de conteudo_ref.
- Se o card for reaproveitado de outro conteudo do mesmo topico, marque reaproveitado=true e use conteudo_origem_ref diferente de conteudo_ref.
- Se nao for reaproveitado, conteudo_origem_ref deve ser igual a conteudo_ref.
- Nao inclua markdown fora do JSON.`;

  let detailPayload: unknown | null = null;
  let lastDetailError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const detailResult = await callGeminiJson({
        key,
        prompt: detailPrompt,
        maxOutputTokens: limiteDoDetalhe(contentTarget),
        responseSchema: TRAIL_DETAIL_SCHEMA,
        partes: material.partes,
        deadline,
      });
      detailPayload = detailResult.parsed;
      break;
    } catch (error) {
      lastDetailError = error;
      if (attempt >= 3) break;
      // Estourou o tempo, ou nao sobra tempo para outra volta inteira.
      if (error instanceof AiStructuredError && error.code === "ai_timeout") break;
      if (deadline !== undefined && deadline - Date.now() < TRAIL_DETAIL_RETRY_MIN_REMAINING_MS) break;
    }
  }

  if (!detailPayload) {
    if (lastDetailError instanceof AiStructuredError) {
      throw new AiStructuredError(
        `Falha ao gerar detalhes do topico "${topic.nome}". ${lastDetailError.message}`,
        lastDetailError.code,
        lastDetailError.status,
        lastDetailError.details,
      );
    }
    throw new AiStructuredError(`Falha ao gerar detalhes do topico "${topic.nome}".`, "trail_detail_failed");
  }

  const normalizedContents = normalizeTrailDetails(detailPayload, topic, contentTarget, {
    arquivos,
    figuras: material.figuras,
    filtros: {
      cards: criarFiltroDeRepetidas(ctx.existentes.cards),
      questoes: criarFiltroDeRepetidas(ctx.existentes.questoes),
    },
  });
  const topicCards = normalizedContents.flatMap((content) =>
    ensureObjectArray((content as JsonRecord).cards).map((card) => ({
      ...card,
      conteudo_ref: (card as JsonRecord).conteudo_ref ?? (content as JsonRecord).ref ?? null,
    })),
  );
  const topicActivities = normalizedContents.flatMap((content) =>
    ensureObjectArray((content as JsonRecord).atividades).map((atividade) => ({
      ...atividade,
      conteudo_ref: (atividade as JsonRecord).conteudo_ref ?? (content as JsonRecord).ref ?? null,
    })),
  );

  return {
    nome: topic.nome,
    descricao: topic.descricao,
    ordem: topic.ordem,
    depende: topic.depende,
    next: topic.next,
    conteudos: normalizedContents,
    cards: topicCards,
    atividades: topicActivities,
  };
}

/**
 * Modo "trail" antigo: esqueleto + todos os topicos numa requisicao so. Com
 * 6 topicos ja passava dos 150 s do worker (504/546). O console agora usa
 * "trail-skeleton" + um "trail-topic" por topico; este fica para a
 * regeracao de um topico ("Pedir ajuste", 2 chamadas) e para build antigo.
 */
async function generateTrailTwoSteps(
  body: RequestBody,
  sources: AiSourceInput[],
  key: string,
  deadline?: number,
): Promise<JsonRecord> {
  const ctx = buildTrailContext(body, sources);
  const skeleton = await generateTrailSkeleton(ctx, body, key, deadline);
  const detailedTopics: JsonRecord[] = [];
  for (let index = 0; index < skeleton.length; index += 1) {
    const topico = await generateTrailTopicDetail(ctx, skeleton[index], index, skeleton.length, key, deadline);
    detailedTopics.push(topico);
    ctx.existentes.cards.push(...ensureObjectArray(topico.cards).map((card) => String(card.titulo ?? "")));
    ctx.existentes.questoes.push(...ensureObjectArray(topico.atividades).map((atividade) => String(atividade.enunciado ?? "")));
  }
  return { topicos: detailedTopics };
}

function asTrailSkeletonTopic(value: unknown): TrailSkeletonTopic | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as JsonRecord;
  const nome = String(raw.nome ?? "").trim();
  const ordem = Number(raw.ordem);
  if (!nome || !Number.isFinite(ordem)) return null;
  return {
    nome,
    descricao: String(raw.descricao ?? "").trim(),
    ordem: Math.trunc(ordem),
    depende: toIntArray(raw.depende),
    next: toIntArray(raw.next),
    arquivos_relacionados: Array.isArray(raw.arquivos_relacionados)
      ? raw.arquivos_relacionados.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
  };
}

function buildStandardPrompt(body: RequestBody, sources: AiSourceInput[]): string {
  const mode = body.mode ?? "all";
  const sourceBlock = buildSourceBlock(sources, body.fileContents, body.fileNames);
  const sourceGuard = sourceBlock
    ? "Use somente o material fornecido. Nao invente fatos fora das fontes."
    : "Se nao houver fonte, use apenas o contexto informado.";

  if (!sourceBlock && sources.length > 0) {
    throw new AiStructuredError(
      "Nao foi possivel extrair texto util das fontes enviadas. Envie texto ou markdown legivel.",
      "source_extraction_failed",
    );
  }

  if (mode === "description") {
    return `Voce e um assistente pedagogico.
${IDIOMA}
${sourceGuard}

Topico: "${body.topicName}"
Descricao atual: "${body.topicDescription?.trim() || "nao informada"}"
${sourceBlock}

Retorne SOMENTE JSON valido:
{
  "descricao": "Resumo do modulo em 2 ou 3 frases"
}`;
  }

  return `Voce e um assistente pedagogico.
${IDIOMA}
${sourceGuard}

Topico: "${body.topicName}"
Descricao atual: "${body.topicDescription?.trim() || "nao informada"}"
${sourceBlock}

Retorne SOMENTE JSON valido:
{
  "descricao": "Resumo opcional",
  "conteudos": [
    {
      "sourceRef": "content:1",
      "titulo": "Titulo do conteudo",
      "tipo": "texto",
      "conteudo": "Texto em markdown",
      "cards": [
        {
          "titulo": "Pergunta ou conceito",
          "descricao": "Resposta",
          "conteudo_ref": "content:1",
          "conteudo_origem_ref": "content:1",
          "reaproveitado": false,
          "vinculado_ao_conteudo": true
        }
      ],
      "atividades": [
        {
          "titulo": "Atividade",
          "enunciado": "Pergunta completa",
          "tipo": "quiz",
          "alternativas": ["A", "B", "C", "D"],
          "resposta_correta": "A",
          "conteudo_ref": "content:1"
        }
      ]
    }
  ]
}

Regras:
- Cards e atividades pertencem a um conteudo.
- Todo card precisa conter conteudo_ref.
- Se for reaproveitado, conteudo_origem_ref deve indicar o conteudo de origem.
- Tipos de atividade permitidos: quiz, questao, texto, true_false, fill_blank.
${REGRAS_DE_TERMOS}`;
}

function withLegacyCompatibility(payload: JsonRecord, mode: RequestBody["mode"]) {
  if (mode === "trail" && Array.isArray(payload.topicos)) {
    payload.topicos = payload.topicos.map((topic) => {
      if (!topic || typeof topic !== "object") return topic;
      const record = topic as JsonRecord;
      const conteudos = Array.isArray(record.conteudos) ? record.conteudos : [];
      const cards = conteudos.flatMap((conteudo) =>
        Array.isArray((conteudo as JsonRecord).cards) ? ((conteudo as JsonRecord).cards as unknown[]) : [],
      );
      const atividades = conteudos.flatMap((conteudo) =>
        Array.isArray((conteudo as JsonRecord).atividades)
          ? ((conteudo as JsonRecord).atividades as unknown[])
          : [],
      );
      return { ...record, cards, atividades };
    });
  }

  if (mode === "all" || mode === "content") {
    const conteudos = Array.isArray(payload.conteudos) ? payload.conteudos : [];
    payload.cards = conteudos.flatMap((conteudo) =>
      Array.isArray((conteudo as JsonRecord).cards) ? ((conteudo as JsonRecord).cards as unknown[]) : [],
    );
    payload.atividades = conteudos.flatMap((conteudo) =>
      Array.isArray((conteudo as JsonRecord).atividades)
        ? ((conteudo as JsonRecord).atividades as unknown[])
        : [],
    );
  }

  return payload;
}

// ===== Modo description/content: helpers do PR #3 (contexto, tema, essay, best-of-N) =====
const MAX_FILE_CONTENT_CHARS = 10000;
const MAX_CONTENT_SNIPPET = 900;
const CONTENT_GEN_ATTEMPTS = 3;

type JsonObject = Record<string, unknown>;

type AiCard = {
  titulo: string;
  descricao: string;
};

type AiAtividade = {
  titulo: string;
  enunciado: string;
  tipo: "quiz" | "essay" | "true_false" | "fill_blank";
  alternativas: string[] | null;
  resposta_correta: string;
  nota_estabelecida: number | null;
};

const DESCRIPTION_SCHEMA = {
  type: "OBJECT",
  required: ["descricao"],
  properties: {
    descricao: { type: "STRING" },
  },
} as const;

// Sem schema, o Gemini tem liberdade para variar nomes de campo/estrutura
// (ex.: "pergunta" em vez de "titulo"), o que normalizeCards/normalizeAtividades
// descarta silenciosamente por nao bater com o formato esperado — resultando em
// arrays vazios sem nenhum erro visivel.
const CONTENT_SCHEMA = {
  type: "OBJECT",
  required: ["cards", "atividades"],
  properties: {
    cards: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["titulo", "descricao"],
        properties: {
          titulo: { type: "STRING" },
          descricao: { type: "STRING" },
        },
      },
    },
    atividades: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["titulo", "enunciado", "tipo", "resposta_correta"],
        properties: {
          titulo: { type: "STRING" },
          enunciado: { type: "STRING" },
          tipo: { type: "STRING", enum: ["quiz", "true_false", "fill_blank", "essay"] },
          alternativas: { type: "ARRAY", items: { type: "STRING" } },
          resposta_correta: { type: "STRING" },
          nota_estabelecida: { type: "NUMBER" },
        },
      },
    },
  },
} as const;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// verify_jwt do Supabase só recusa token ausente/invalido — a anon key publica
// (embutida no bundle do front) tambem passa nessa checagem. Exigimos aqui que
// o token pertença a um usuario de fato logado, nao so a chave publica anon.
async function requireAuthenticatedUser(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!authHeader || !supabaseUrl || !supabaseAnonKey) return false;

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await authClient.auth.getUser();
  return !error && Boolean(data?.user);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asContentItems(value: unknown): ContentItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      return {
        titulo: asString(row.titulo),
        tipo: asString(row.tipo),
        conteudo: typeof row.conteudo === "string" ? row.conteudo : null,
      };
    })
    .filter((item): item is ContentItem => item !== null);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asString(entry)).filter(Boolean);
}

function buildMaterialBlock(fileContents: string, fileNames: string[]): string {
  if (!fileContents) return "";
  return `\n\n${"=".repeat(60)}
MATERIAL DO PROFESSOR (FONTE OBRIGATORIA)
${"=".repeat(60)}
Todo conteudo gerado deve ser derivado do material abaixo.
${fileNames.length > 0 ? `Arquivos fornecidos: ${fileNames.join(", ")}\n` : ""}${"-".repeat(60)}
${fileContents.substring(0, MAX_FILE_CONTENT_CHARS)}
${"=".repeat(60)}`;
}

function buildContextBlock(params: {
  materiaNome: string;
  materiaDescricao: string;
  classeNome: string;
  topicoNome: string;
  topicoDescricao: string;
}): string {
  const lines: string[] = [];
  if (params.materiaNome) lines.push(`- Materia: ${params.materiaNome}`);
  if (params.materiaDescricao) lines.push(`- Descricao da materia: ${params.materiaDescricao}`);
  if (params.classeNome) lines.push(`- Classe: ${params.classeNome}`);
  if (params.topicoNome) lines.push(`- Topico: ${params.topicoNome}`);
  if (params.topicoDescricao) lines.push(`- Descricao do topico: ${params.topicoDescricao}`);
  if (lines.length === 0) return "";
  return `\n\nCONTEXTO PEDAGOGICO\n${lines.join("\n")}`;
}

function buildThemeGuideBlock(value: unknown): string {
  if (!value || typeof value !== "object") return "";

  const guide = value as Record<string, unknown>;
  const temaBase = guide.tema_base && typeof guide.tema_base === "object"
    ? (guide.tema_base as Record<string, unknown>)
    : null;
  const perfis = Array.isArray(guide.perfis) ? guide.perfis : [];
  const instrucaoGlobal = asString(guide.instrucao_global);

  const lines: string[] = [];
  if (temaBase) {
    const nome = asString(temaBase.nome);
    const descricao = asString(temaBase.descricao);
    const regrasVisuais = Array.isArray(temaBase.regras_visuais)
      ? temaBase.regras_visuais.map((item) => asString(item)).filter(Boolean).slice(0, 5)
      : [];
    if (nome) lines.push(`- Tema base do app mobile: ${nome}`);
    if (descricao) lines.push(`- Descricao visual: ${descricao}`);
    if (regrasVisuais.length > 0) {
      lines.push("- Regras visuais:");
      for (const regra of regrasVisuais) lines.push(`  - ${regra}`);
    }
  }
  if (instrucaoGlobal) lines.push(`- Regra global: ${instrucaoGlobal}`);

  const perfisResumo = perfis
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      const perfil = asString(row.perfil);
      const tom = asString(row.tom);
      const palette = row.palette && typeof row.palette === "object"
        ? (row.palette as Record<string, unknown>)
        : {};
      const primary = asString(palette.primary);
      const secondary = asString(palette.secondary);
      const accent = asString(palette.accent);
      const background = asString(palette.background);
      const diretrizes = Array.isArray(row.diretrizes)
        ? row.diretrizes.map((entry) => asString(entry)).filter(Boolean).slice(0, 3)
        : [];
      if (!perfil) return "";
      const paletteSummary = [primary, secondary, accent, background].filter(Boolean).join(", ");
      const diretrizesSummary = diretrizes.length > 0 ? `, diretrizes: ${diretrizes.join(" | ")}` : "";
      return `${perfil}: tom "${tom || "equilibrado"}"${paletteSummary ? `, paleta (${paletteSummary})` : ""}${diretrizesSummary}`;
    })
    .filter(Boolean)
    .slice(0, 12);

  if (perfisResumo.length > 0) {
    lines.push("- Guia por perfil:");
    for (const perfilLine of perfisResumo) {
      lines.push(`  - ${perfilLine}`);
    }
  }

  if (lines.length === 0) return "";
  return `\n\nGUIA DE TEMA E TOM PARA PERSONALIZACAO\n${lines.join("\n")}`;
}

async function callGemini(params: {
  key: string;
  prompt: string;
  maxOutputTokens: number;
  responseSchema?: Record<string, unknown>;
  /** Material antes do prompt (anexos, vídeo, página do link). */
  partes?: ParteDoPedido[];
  /** Vídeo em resolução baixa: ~100 tokens por segundo em vez de ~300, o que cabe no tier free. */
  mediaResolution?: "MEDIA_RESOLUTION_LOW";
  deadline?: number;
}) {
  const { res: response, apiData } = await fetchGemini(params.key, {
    contents: [{ parts: [...(params.partes ?? []), { text: params.prompt }] }],
    generationConfig: {
      maxOutputTokens: params.maxOutputTokens,
      responseMimeType: "application/json",
      ...(params.responseSchema ? { responseSchema: params.responseSchema } : {}),
      ...(params.mediaResolution ? { mediaResolution: params.mediaResolution } : {}),
    },
  }, params.deadline);
  if (!response.ok) {
    throw geminiHttpError(response.status, apiData);
  }

  const candidate = Array.isArray((apiData as { candidates?: unknown }).candidates)
    ? ((apiData as { candidates: Array<Record<string, unknown>> }).candidates[0] ?? null)
    : null;
  const rawParts = (candidate?.content as { parts?: unknown } | undefined)?.parts;
  const parts: Array<Record<string, unknown>> = Array.isArray(rawParts) ? rawParts : [];
  const text = parts.map((part) => (typeof part.text === "string" ? part.text : "")).join("").trim();
  const finishReason = typeof candidate?.finishReason === "string" ? candidate.finishReason : null;
  return { text, finishReason };
}

function stripLeadingIndex(value: string): string {
  if (!value) return "";
  let out = value.trim();
  out = out.replace(/^(?:card|atividade|quest(?:ao|ão)|pergunta)\s*#?\s*\d+\s*[:.)-]\s*/i, "");
  out = out.replace(/^\d+\s*[:.)-]\s*/, "");
  out = out.replace(/^[ivxlcdm]+\s*[:.)-]\s*/i, "");
  return out.trim();
}

function ensureCardQuestionTitle(value: string): string {
  const clean = stripLeadingIndex(value).replace(/^pergunta\s*[:.)-]\s*/i, "").trim();
  if (!clean) return "";
  if (clean.endsWith("?")) return clean;
  return `${clean.replace(/[.!:;,\s]+$/g, "")}?`;
}

function ensureCardAnswerText(value: string): string {
  return stripLeadingIndex(value).replace(/^resposta\s*[:.)-]\s*/i, "").trim();
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeBy<T>(items: T[], keyFactory: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = keyFactory(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function normalizeDescription(raw: unknown): { descricao: string } {
  if (!raw || typeof raw !== "object") {
    return { descricao: "Resumo do topico em 2-3 frases com foco nos objetivos de aprendizagem." };
  }
  const descricao = asString((raw as Record<string, unknown>).descricao);
  if (!descricao) {
    return { descricao: "Resumo do topico em 2-3 frases com foco nos objetivos de aprendizagem." };
  }
  return { descricao };
}

/**
 * Cards e atividades do modo `content`, sem repetidas: nem entre si, nem com as
 * perguntas que o topico ja tem (`filtro`).
 *
 * Nao completa mais ate 10 com item generico ("Qual e o conceito central de
 * ...?", "Reconhecimento conceitual"): era o mesmo texto em toda geracao, ou
 * seja, pergunta repetida por construcao. Volta o que a IA gerou de novo.
 */
function normalizeCards(raw: unknown, filtro: FiltroDeRepetidas): { items: AiCard[]; repetidas: number } {
  const rows = Array.isArray(raw) ? raw : [];
  const parsed = rows
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const titulo = ensureCardQuestionTitle(asString(row.titulo));
      const descricao = ensureCardAnswerText(asString(row.descricao));
      if (!titulo || !descricao) return null;
      return { titulo, descricao };
    })
    .filter((item): item is AiCard => item !== null);

  const unique = dedupeBy(parsed, (card) => `${normalizeKey(card.titulo)}|${normalizeKey(card.descricao)}`);
  const novos = unique.filter((card) => filtro.aceitar(card.titulo)).slice(0, 30);
  return { items: novos, repetidas: unique.length - novos.length };
}

function normalizeAtividades(raw: unknown, filtro: FiltroDeRepetidas): { items: AiAtividade[]; repetidas: number } {
  const rows = Array.isArray(raw) ? raw : [];
  const allowed = new Set([
    "quiz",
    "essay",
    "questao",
    "dissertativa",
    "texto",
    "true_false",
    "verdadeiro_falso",
    "fill_blank",
    "multipla",
  ]);
  const parsed = rows
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const tipoRaw = asString(row.tipo).toLowerCase();
      if (!allowed.has(tipoRaw)) return null;

      const normalizedTipo: AiAtividade["tipo"] =
        tipoRaw === "quiz" || tipoRaw === "multipla"
          ? "quiz"
          : tipoRaw === "true_false" || tipoRaw === "verdadeiro_falso"
          ? "true_false"
          : tipoRaw === "fill_blank"
          ? "fill_blank"
          : "essay";

      const titulo = stripLeadingIndex(asString(row.titulo));
      const enunciado = stripLeadingIndex(asString(row.enunciado));
      const resposta = stripLeadingIndex(asString(row.resposta_correta));
      if (!titulo || !enunciado || !resposta) return null;
      const notaRaw = Number(row.nota_estabelecida);
      const notaEstabelecida =
        Number.isFinite(notaRaw) && notaRaw > 0 ? Math.round(notaRaw * 100) / 100 : null;

      const alternativasRaw = Array.isArray(row.alternativas)
        ? row.alternativas.map((alt) => asString(alt)).filter(Boolean).slice(0, 4)
        : null;

      let alternativas: string[] | null = null;
      if (normalizedTipo === "quiz") {
        alternativas = alternativasRaw && alternativasRaw.length > 0 ? alternativasRaw : null;
      } else if (normalizedTipo === "true_false") {
        alternativas = ["Verdadeiro", "Falso"];
      }

      const respostaCorrigida =
        normalizedTipo === "true_false"
          ? resposta === "Falso"
            ? "Falso"
            : "Verdadeiro"
          : normalizedTipo === "quiz" && alternativas && alternativas.length > 0
          ? alternativas.includes(resposta)
            ? resposta
            : alternativas[0]
          : normalizedTipo === "fill_blank"
          ? respostasDaLacuna(resposta) || resposta
          : resposta;

      return {
        titulo,
        enunciado,
        tipo: normalizedTipo,
        alternativas,
        resposta_correta: respostaCorrigida,
        nota_estabelecida: notaEstabelecida,
      };
    })
    .filter((item): item is AiAtividade => item !== null);

  const unique = dedupeBy(
    parsed,
    (atividade) =>
      `${normalizeKey(atividade.titulo)}|${normalizeKey(atividade.enunciado)}|${normalizeKey(
        atividade.resposta_correta,
      )}|${atividade.tipo}`,
  );
  const novas = unique.filter((atividade) => filtro.aceitar(atividade.enunciado)).slice(0, 20);
  return { items: novas, repetidas: unique.length - novas.length };
}

// Conferência da chave de serviço, a mesma de storage-redirect e storage-upload-url (ver
// pedidoDoServidor.ts). No escopo do módulo porque o cache de 5 min vive com ela.
const conferirServico = criarConferenciaDeServico(() => ({
  chaveDeServico: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
}));

serve(async (req) => {
  // Conta desde a chegada: autenticacao e leitura do corpo tambem gastam o relogio do worker.
  const startedAt = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // Com a chave de serviço no Authorization, o pedido é do servidor (worker da API) e só vale no
  // modo `desafios`: o modo está no corpo, então ele é lido aqui, uma vez, e reaproveitado abaixo.
  // Sem ela, o caminho do professor de sempre. Nem o header nem a chave vão para o log.
  // Só token com cara de chave de serviço vai à conferência (que pode perguntar ao Auth admin): o
  // JWT do professor segue direto para requireAuthenticatedUser, sem fetch a mais.
  const authorization = req.headers.get("Authorization");
  const servidor = pareceChaveDeServico(authorization) && (await conferirServico(authorization));
  let corpoDoServidor: RequestBody | null = null;
  if (servidor) {
    try {
      const lido: unknown = await req.json();
      corpoDoServidor = lido && typeof lido === "object" && !Array.isArray(lido) ? (lido as RequestBody) : null;
    } catch {
      corpoDoServidor = null;
    }
    const modoPedido = corpoDoServidor ? asString(corpoDoServidor.mode) || "all" : "";
    if (!corpoDoServidor || autorizar({ servidor: true, usuario: false, mode: modoPedido }) !== "ok") {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
  } else if (!(await requireAuthenticatedUser(req))) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  try {
    const body = corpoDoServidor ?? ((await req.json()) as RequestBody);
    const mode = asString(body.mode) || "all";
    const key = Deno.env.get("GEMINI_API_KEY");

    if (!key) {
      return jsonResponse(
        {
          error: "GEMINI_API_KEY not set",
          code: "gemini_not_configured",
          message: "A geracao por IA esta temporariamente indisponivel.",
        },
        503,
      );
    }

    const deadline = startedAt + REQUEST_BUDGET_MS;

    // Trilha em etapas, uma requisicao por etapa: o esqueleto e depois cada
    // topico. Tudo numa requisicao so estourava o tempo do worker.
    if (mode === "trail-skeleton") {
      const sources = normalizeSources(body);
      const ctx = buildTrailContext(body, sources);
      const topicos = await generateTrailSkeleton(ctx, body, key, deadline);
      return jsonResponse({ topicos });
    }

    if (mode === "trail-topic") {
      const topic = asTrailSkeletonTopic(body.topic);
      if (!topic) {
        throw new AiStructuredError("Topico do esqueleto ausente ou invalido.", "trail_topic_invalid", 400);
      }
      const totalTopics = clampInt(Number(body.totalTopics) || 1, 1, 20);
      const topicIndex = clampInt(Number(body.topicIndex) || 0, 0, totalTopics - 1);
      const sources = normalizeSources(body);
      const ctx = buildTrailContext(body, sources);
      const topico = await generateTrailTopicDetail(ctx, topic, topicIndex, totalTopics, key, deadline);
      return jsonResponse({ topico });
    }

    // Trilha inteira numa requisicao (legado; ver generateTrailTwoSteps)
    if (mode === "trail") {
      const sources = normalizeSources(body);
      const payload = await generateTrailTwoSteps(body, sources, key, deadline);
      return jsonResponse(payload);
    }

    // Modo description/content: contexto pedagogico + guia de tema + melhor de N tentativas.
    // `desafios` usa o mesmo contexto e o mesmo material do `content` (ramo logo abaixo).
    if (mode === "description" || mode === "content" || mode === "desafios") {
    const topicName = asString(body.topicName);
    const contents = asContentItems(body.contents);
    const fileContents = asString(body.fileContents);
    const fileNames = asStringArray(body.fileNames);
    const materialBlock = buildMaterialBlock(fileContents, fileNames);
    const materiaNome = asString(body.materiaNome);
    const materiaDescricao = asString(body.materiaDescricao);
    const classeNome = asString(body.classeNome);
    const topicoNome = asString(body.topicoNome) || topicName;
    const topicoDescricao = asString(body.topicoDescricao);
    const themeGuideBlock = buildThemeGuideBlock(body.personalizacaoThemeGuide);
    const contextBlock = buildContextBlock({
      materiaNome,
      materiaDescricao,
      classeNome,
      topicoNome,
      topicoDescricao,
    });
    const topicLabel = topicoNome || topicName;
    const orientacaoBlock = blocoDaOrientacao(orientacaoDoPedido(body.orientacao));
    const existentes = existentesDoPedido(body.existentes);
    const existentesBlock = blocoDosExistentes(existentes);

    const contentLines = contents
      .map((content) => {
        const header = `- [${content.tipo || "texto"}] ${content.titulo || "Sem titulo"}`;
        if (content.tipo === "texto" && content.conteudo) {
          return `${header}: ${content.conteudo.substring(0, MAX_CONTENT_SNIPPET)}`;
        }
        // Video e link: o endereco ajuda o modelo a situar o material anexado.
        if ((content.tipo === "video" || content.tipo === "link") && content.conteudo && !content.conteudo.includes("<")) {
          return `${header} (${content.conteudo.trim().substring(0, 300)})`;
        }
        return header;
      })
      .join("\n");
    const contentLinesBlock = contentLines || "- Sem conteudo textual informado.";

    if (mode === "description") {
      const prompt = `Voce e assistente pedagogico.
${contextBlock}
${themeGuideBlock}${orientacaoBlock}
Tarefa: gerar a descricao do topico de forma objetiva e acionavel.
Topico alvo: "${topicLabel}"
${topicoDescricao ? `Descricao atual do topico: "${topicoDescricao}"` : ""}
Conteudos de referencia:
${contentLinesBlock}${materialBlock}

Retorne JSON valido:
{"descricao":"resumo do modulo em 2-3 frases, objetivo e resultado esperado"}`;

      const call = await callGemini({
        key,
        prompt,
        // 700 nao era suficiente: com o guia de tema (buildThemeGuideBlock)
        // no prompt, o modelo as vezes gasta parte do orcamento de saida
        // antes do texto visivel, cortando a descricao no meio (finish_reason
        // MAX_TOKENS) e quebrando o parse de JSON (visto em producao).
        maxOutputTokens: 2048,
        responseSchema: DESCRIPTION_SCHEMA as unknown as Record<string, unknown>,
      });
      const parsed = parseGeminiJson(call.text);
      if (!parsed) {
        return jsonResponse(
          {
            error: "invalid_ai_response",
            finish_reason: call.finishReason,
            raw: call.text,
          },
          502,
        );
      }
      return jsonResponse(normalizeDescription(parsed));
    }

    // O material do conteudo vai junto do prompt: sem ele, video, link e PDF
    // geravam questoes so a partir do titulo.
    const relato: RelatoDoMaterial = { lido: [], naoLido: [] };
    const partesDoMaterial: ParteDoPedido[] = [];
    const anexosDoConteudo = lerAnexos(body.anexos);
    if (anexosDoConteudo.length > 0) {
      const montado = montarPartesDosAnexos(anexosDoConteudo);
      partesDoMaterial.push(...montado.partes);
      relato.lido.push(...anexosDoConteudo.map((a) => a.nome).filter((nome) => !montado.omitidos.includes(nome)));
      relato.naoLido.push(...montado.omitidos);
    }
    const linkPedido = asString(body.linkUrl);
    if (linkPedido) {
      const link = linkPublicoSeguro(linkPedido);
      const textoDaPagina = link ? await lerPaginaDoLink(link, deadline) : null;
      if (link && textoDaPagina) {
        partesDoMaterial.push({ text: `[Pagina do link ${link.href} (texto extraido)]\n${textoDaPagina}` });
        relato.lido.push(link.href);
      } else {
        relato.naoLido.push(linkPedido);
      }
    }
    const videoUrl = urlDoYouTube(body.videoUrl);
    let usarVideo = Boolean(videoUrl);
    // Com video ou PDF, cada tentativa reenvia o material inteiro: uma so,
    // para caber na cota do tier free. So texto continua com a melhor de N.
    const materialPesado = usarVideo || partesDoMaterial.some((parte) => "inlineData" in parte);
    // Pedido do servidor: uma tentativa só, para o teto diário do worker contar gerações.
    const tentativas = servidor || materialPesado ? 1 : CONTENT_GEN_ATTEMPTS;

    // Modo desafios: 2 de logica e 2 cruzadinhas por conteudo, num pedido separado do de cards e
    // atividades (falhar aqui nao derruba os cards). So propoe: quem grava e missao_desafio_criar,
    // quando o professor aplica. A grade e o filtro do que o banco recusaria estao em desafios.ts.
    if (mode === "desafios") {
      let melhor: DesafiosNormalizados | null = null;
      let ultimaChamada: Awaited<ReturnType<typeof callGemini>> | null = null;
      for (let attempt = 0; attempt < tentativas; attempt += 1) {
        const partes: ParteDoPedido[] = [
          ...(usarVideo && videoUrl ? [{ text: "[Video do conteudo (YouTube), a seguir]" }, { fileData: { fileUri: videoUrl } }] : []),
          ...partesDoMaterial,
        ];
        const avisoDoAnexo = partes.length > 0
          ? `\nO MATERIAL DESTE CONTEÚDO ESTÁ ANEXADO A ESTE PEDIDO (${[
            usarVideo ? "o vídeo" : "",
            anexosDoConteudo.length > 0 ? "os arquivos" : "",
            relato.lido.some((item) => /^https?:/i.test(item)) ? "a página do link" : "",
          ].filter(Boolean).join(", ")}).
Baseie os desafios no que está NELE: fatos, exemplos, termos e definições. Não se limite ao título.`
          : "";
        const prompt = promptDeDesafios({
          contexto: `${contextBlock}\n${themeGuideBlock}`,
          topico: topicLabel,
          descricaoDoTopico: topicoDescricao,
          conteudos: contentLinesBlock,
          material: `${materialBlock}${avisoDoAnexo}`,
          orientacao: orientacaoBlock,
          existentes: existentesBlock,
          regrasDeTermos: REGRAS_DE_TERMOS,
          idioma: IDIOMA,
          variacao: crypto.randomUUID(),
        });

        let call: Awaited<ReturnType<typeof callGemini>>;
        try {
          call = await callGemini({
            key,
            prompt,
            maxOutputTokens: 8192,
            responseSchema: DESAFIOS_SCHEMA as unknown as Record<string, unknown>,
            partes,
            ...(usarVideo ? { mediaResolution: "MEDIA_RESOLUTION_LOW" as const } : {}),
            deadline,
          });
        } catch (erro) {
          // Como no `content`: video recusado segue sem ele; falta de cota sobe.
          if (usarVideo && erro instanceof AiStructuredError && erro.code === "gemini_error") {
            console.warn("gemini: video do conteudo recusado nos desafios; seguindo sem ele", JSON.stringify(erro.details ?? {}).slice(0, 500));
            usarVideo = false;
            attempt -= 1;
            continue;
          }
          // Prazo ou cota numa tentativa extra: a proposta que ja veio vale mais que o erro.
          if (melhor) break;
          throw erro;
        }
        ultimaChamada = call;
        const parsed = parseGeminiJson(call.text);
        if (!parsed || typeof parsed !== "object") continue;

        // Filtro novo por tentativa: cada uma e uma proposta inteira, e so a melhor volta.
        // `topicName` aqui e o titulo do conteudo (TopicEditDrawer), o mesmo que missao_desafio_criar
        // poe no titulo da missao: a resposta que ele escreve esta a vista do aluno.
        const resultado = normalizarDesafios(
          parsed,
          criarFiltroDeRepetidas([...existentes.questoes, ...existentes.cards]),
          topicName || contents[0]?.titulo || "",
        );
        if (!melhor || resultado.desafios.length > melhor.desafios.length) melhor = resultado;
        if (melhor.desafios.length >= DESAFIOS_COMPLETOS) break;
      }

      if (!melhor) {
        return jsonResponse(
          {
            error: "invalid_ai_response",
            message: "Não foi possível gerar desafios a partir deste material. Tente de novo.",
            finish_reason: ultimaChamada?.finishReason ?? null,
            raw: ultimaChamada?.text ?? "",
          },
          502,
        );
      }
      return jsonResponse(melhor);
    }

    let bestCards: AiCard[] | null = null;
    let bestAtividades: AiAtividade[] | null = null;
    let bestScore = -1;
    let bestRepetidas = 0;

    for (let attempt = 0; attempt < tentativas; attempt += 1) {
      const partes: ParteDoPedido[] = [
        ...(usarVideo && videoUrl ? [{ text: "[Video do conteudo (YouTube), a seguir]" }, { fileData: { fileUri: videoUrl } }] : []),
        ...partesDoMaterial,
      ];
      const materialBlockAnexado = partes.length > 0
        ? `\nO MATERIAL DESTE CONTEUDO ESTA ANEXADO A ESTE PEDIDO (${[
          usarVideo ? "o video" : "",
          anexosDoConteudo.length > 0 ? "os arquivos" : "",
          relato.lido.some((item) => /^https?:/i.test(item)) ? "a pagina do link" : "",
        ].filter(Boolean).join(", ")}).
Baseie cards e atividades no que esta NELE: fatos, exemplos, termos, definicoes e a ordem em que e explicado.
Nao gere questao sobre o que o material nao cobre e nao se limite ao titulo.`
        : "";
      const nonce = crypto.randomUUID();
      const contentPrompt = `Voce e especialista em design instrucional.
Gere um pacote de estudo para o conteudo selecionado.

${contextBlock}
${themeGuideBlock}
Topico de trabalho: "${topicLabel}"
${topicoDescricao ? `Descricao do topico: "${topicoDescricao}"` : ""}
Conteudo selecionado (base obrigatoria):
${contentLinesBlock}${materialBlock}${materialBlockAnexado}
${orientacaoBlock}${existentesBlock}
Identificador de variacao desta tentativa: ${nonce}

Retorne JSON valido com:
- cards: entre 10 e 30 itens.
- atividades: entre 10 e 20 itens.

Regras obrigatorias:
- Cada atividade representa exatamente 1 questao.
- A lista de atividades deve ter progressao de dificuldade gradual da primeira para a ultima:
  inicio facil, meio intermediario, final avancado.
- Mantenha a ordem de dificuldade diretamente na ordem do array.
- Para tipo "quiz", inclua alternativas (2-4) e resposta correta coerente entre as alternativas.
- Para tipo "true_false", use alternativas ["Verdadeiro","Falso"] e resposta correta igual a uma delas.
- Para tipo "fill_blank", nao inclua alternativas e use resposta curta e objetiva.
${REGRAS_DE_TERMOS}
- Para tipo "essay", nao inclua alternativas e use resposta orientadora dissertativa.
- Use apenas estes tipos: "quiz", "true_false", "fill_blank", "essay".
- Nao repita cards (titulo/descricao) nem atividades (titulo/enunciado/resposta) dentro do mesmo array.
- Nenhuma pergunta pode repetir, nem com outras palavras, uma que o topico ja tem.
- Se detectar repeticao potencial, reescreva completamente o item.
- Em cards: "titulo" deve ser PERGUNTA e "descricao" deve ser RESPOSTA.
- Nao use indices, numeracao, prefixos como "Card 1", "Atividade 2", "Questao 3" em nenhum campo.
- ${IDIOMA}
- Retorne SOMENTE JSON valido (sem markdown).`;

      let call: Awaited<ReturnType<typeof callGemini>>;
      try {
        call = await callGemini({
          key,
          prompt: contentPrompt,
          maxOutputTokens: 9000,
          responseSchema: CONTENT_SCHEMA as unknown as Record<string, unknown>,
          partes,
          ...(usarVideo ? { mediaResolution: "MEDIA_RESOLUTION_LOW" as const } : {}),
          deadline,
        });
      } catch (erro) {
        // Video privado, removido, longo demais ou recusado: segue sem ele, com
        // o resto do material, e conta ao console que o video nao foi lido.
        // Falta de cota nao entra aqui: sem o video daria o mesmo 429.
        if (usarVideo && erro instanceof AiStructuredError && erro.code === "gemini_error") {
          console.warn("gemini: video do conteudo recusado; seguindo sem ele", JSON.stringify(erro.details ?? {}).slice(0, 500));
          usarVideo = false;
          relato.naoLido.push(videoUrl ?? "video");
          attempt -= 1;
          continue;
        }
        throw erro;
      }
      if (usarVideo && videoUrl && !relato.lido.includes(videoUrl)) relato.lido.push(videoUrl);
      const parsed = parseGeminiJson(call.text);
      if (!parsed || typeof parsed !== "object") {
        if (attempt === CONTENT_GEN_ATTEMPTS - 1) {
          return jsonResponse(
            {
              error: "invalid_ai_response",
              finish_reason: call.finishReason,
              raw: call.text,
            },
            502,
          );
        }
        continue;
      }

      const row = parsed as Record<string, unknown>;
      // Filtro novo por tentativa: cada uma e um pacote inteiro, e so a melhor volta.
      const cardsResult = normalizeCards(row.cards, criarFiltroDeRepetidas(existentes.cards));
      const atividadesResult = normalizeAtividades(row.atividades, criarFiltroDeRepetidas(existentes.questoes));
      const score = cardsResult.items.length + atividadesResult.items.length;
      if (score > bestScore) {
        bestScore = score;
        bestCards = cardsResult.items;
        bestAtividades = atividadesResult.items;
        bestRepetidas = cardsResult.repetidas + atividadesResult.repetidas;
      }

      if (cardsResult.items.length >= 10 && atividadesResult.items.length >= 10) {
        break;
      }
    }

    // bestScore <= 0 significa que NENHUMA tentativa produziu um item novo
    // vindo da IA. Quando foi tudo repetida, o professor precisa saber que o
    // topico ja cobre o que o material tem, nao que a IA falhou.
    if ((bestCards?.length ?? 0) === 0 && (bestAtividades?.length ?? 0) === 0 && bestRepetidas > 0) {
      return jsonResponse(
        {
          error: "ai_generation_only_repeated",
          message:
            "A IA so gerou perguntas que o topico ja tem. Mude a orientacao da IA ou o material e tente de novo.",
        },
        422,
      );
    }
    if (!bestCards || !bestAtividades || bestScore <= 0) {
      return jsonResponse(
        {
          error: "ai_generation_empty",
          message:
            "Nao foi possivel gerar cards/atividades baseados no material fornecido. Tente novamente.",
        },
        502,
      );
    }

    return jsonResponse({
      cards: bestCards,
      atividades: bestAtividades,
      material: relato,
      /** Perguntas que a IA gerou e a funcao descartou por repetirem as que ja existem. */
      repetidas_descartadas: bestRepetidas,
    });
    }

    // Modo legado (all): prompt unico com compatibilidade de cards/atividades
    const sources = normalizeSources(body);
    const prompt = buildStandardPrompt(body, sources);
    const callResult = await callGeminiJson({
      key,
      prompt,
      maxOutputTokens: 4096,
    });

    const parsed = callResult.parsed;
    if (!parsed || typeof parsed !== "object") {
      throw new AiStructuredError("Resposta da IA invalida.", "ai_invalid_payload");
    }

    const payload = withLegacyCompatibility(parsed as JsonRecord, mode as RequestBody["mode"]);
    return jsonResponse(payload);
  } catch (err) {
    if (err instanceof AiStructuredError) {
      return jsonResponse(
        { error: err.message, code: err.code, details: err.details },
        err.status,
      );
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
