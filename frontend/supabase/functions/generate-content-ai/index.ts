import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

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
  mode?: "all" | "content" | "description" | "trail";
  topicName?: string;
  topicDescription?: string;
  contents?: ContentItem[];
  sources?: AiSourceInput[];
  trailDescription?: string;
  numTopics?: number;
  topicNames?: string[];
  syllabus?: string;
  fileContents?: string;
  fileNames?: string[];
  // Contexto pedagogico usado nos modos description/content
  materiaNome?: string;
  materiaDescricao?: string;
  classeNome?: string;
  topicoNome?: string;
  topicoDescricao?: string;
  personalizacaoThemeGuide?: unknown;
}
type GeminiCallOptions = {
  key: string;
  prompt: string;
  maxOutputTokens: number;
  responseSchema?: JsonRecord;
  temperature?: number;
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

function normalizeTrailSkeleton(
  payload: unknown,
  desiredTopics: number,
  topicNames: string[] = [],
): TrailSkeletonTopic[] {
  const rawTopics = Array.isArray((payload as JsonRecord)?.topicos)
    ? ((payload as JsonRecord).topicos as unknown[])
    : [];

  const fallbackNames = topicNames.filter((item) => item.trim().length > 0);
  const topics: TrailSkeletonTopic[] = [];

  const maxTopics = clampInt(desiredTopics, 1, 20);
  const source = rawTopics.length > 0 ? rawTopics.slice(0, maxTopics) : Array.from({ length: maxTopics }, () => ({}));

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

  for (const attempt of attemptConfigs) {
    const res = await fetch(`${GEMINI_URL}?key=${options.key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: options.prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.25,
          maxOutputTokens: options.maxOutputTokens,
          responseMimeType: "application/json",
          ...(attempt.useSchema && options.responseSchema ? { responseSchema: options.responseSchema } : {}),
        },
      }),
    });

    const apiData = await res.json();
    if (!res.ok) {
      const reason = String((apiData as JsonRecord)?.error ? JSON.stringify((apiData as JsonRecord).error) : "");
      const schemaIssue =
        attempt.useSchema &&
        (reason.toLowerCase().includes("responseschema") ||
          reason.toLowerCase().includes("schema") ||
          reason.toLowerCase().includes("generationconfig"));

      const err = new AiStructuredError("Gemini API error", "gemini_error", 502, apiData);
      lastError = err;
      if (schemaIssue) continue;
      throw err;
    }

    const candidate = (apiData as JsonRecord)?.candidates?.[0] as JsonRecord | undefined;
    const finishReason = String(candidate?.finishReason ?? candidate?.finish_reason ?? "").toUpperCase();
    const rawText = String(
      ((candidate?.content as JsonRecord | undefined)?.parts as JsonRecord[] | undefined)?.[0]?.text ?? "{}",
    );

    if (finishReason === "MAX_TOKENS") {
      throw new AiStructuredError(
        "Resposta da IA truncada por limite de tokens. Reduza o volume da entrada ou gere em mais etapas.",
        "ai_truncated",
        422,
        { finishReason },
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
            minItems: 1,
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
    const conteudo = String(record.conteudo ?? "").trim();

    const cards = ensureObjectArray(record.cards).map((card, cardIndex) => {
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

    const atividades = ensureObjectArray(record.atividades).map((atividade, activityIndex) => {
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

      const resposta = String(atividade.resposta_correta ?? alternativas[0] ?? "Revisar o conteudo.").trim();

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
              enunciado: "Explique o conceito principal com suas palavras.",
              tipo: "questao",
              alternativas: null,
              resposta_correta: "Resposta aberta alinhada ao conteudo.",
              conteudo_ref: ref,
            },
          ];

    const midias = ensureObjectArray(record.midias).map((midia, mediaIndex) => ({
      tipo: normalizeMediaType(midia.tipo),
      titulo: String(midia.titulo ?? `Midia ${mediaIndex + 1}`).trim() || `Midia ${mediaIndex + 1}`,
      descricao: String(midia.descricao ?? "Material complementar.").trim(),
      roteiro: String(midia.roteiro ?? "").trim() || null,
      transcricao: String(midia.transcricao ?? "").trim() || null,
      url: String(midia.url ?? "").trim() || null,
      formato_arquivo: String(midia.formato_arquivo ?? "").trim() || null,
      sourceRef: String(midia.sourceRef ?? "").trim() || null,
    }));

    const mediaOutput =
      midias.length > 0
        ? midias
        : [
            {
              tipo: "documento",
              titulo: `Resumo de ${titulo}`,
              descricao: "Documento de apoio com os principais pontos deste conteudo.",
              roteiro: null,
              transcricao: null,
              url: null,
              formato_arquivo: "md",
              sourceRef: null,
            },
          ];

    return {
      ref,
      titulo,
      tipo,
      conteudo,
      sourceRef: String(record.sourceRef ?? "").trim() || null,
      cards: cardOutput,
      atividades: atividadeOutput,
      midias: mediaOutput,
    };
  });

  return normalized;
}

async function generateTrailTwoSteps(
  body: RequestBody,
  sources: AiSourceInput[],
  key: string,
): Promise<JsonRecord> {
  const trailDescription = body.trailDescription?.trim() || body.topicDescription?.trim() || body.topicName;
  const fileNames = (body.fileNames ?? []).map((item) => item.trim()).filter(Boolean);
  const sourceBlock = buildSourceBlock(sources, body.fileContents, fileNames);

  if (!sourceBlock && sources.length > 0) {
    throw new AiStructuredError(
      "Nao foi possivel extrair texto util das fontes enviadas. Envie texto, markdown ou material com texto legivel.",
      "source_extraction_failed",
    );
  }

  const topicNames = body.topicNames?.map((item) => item.trim()).filter(Boolean) ?? [];
  const desiredTopics = clampInt(
    fileNames.length > 0 ? fileNames.length : body.numTopics ?? Math.max(topicNames.length, 5),
    1,
    20,
  );
  const sourceGuard = sourceBlock
    ? "Use somente o material fornecido. Nao invente conceitos fora das fontes."
    : "Sem fontes externas: use apenas a descricao do curso para construir uma trilha coerente.";

  const skeletonPrompt = `Voce e especialista em design instrucional.
Idioma obrigatorio: portugues brasileiro.
${sourceGuard}

Disciplina/curso: "${trailDescription}"
Topicos desejados: ${desiredTopics}
${topicNames.length > 0 ? `Topicos sugeridos pelo professor:\n${topicNames.map((name, idx) => `${idx + 1}. ${name}`).join("\n")}\n` : ""}
${fileNames.length > 0 ? `Arquivos enviados pelo professor:\n${fileNames.map((name, idx) => `${idx + 1}. ${name}`).join("\n")}\n` : ""}
${body.syllabus?.trim() ? `Ementa complementar:\n${body.syllabus.trim().substring(0, 2500)}\n` : ""}
${sourceBlock}

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
- Gere exatamente ${desiredTopics} topicos quando houver material suficiente.
- Se houver arquivos, distribua em "arquivos_relacionados" sem repetir desnecessariamente.
- Evite ciclos em depende/next.
- Organize do basico ao avancado.`;

  const skeletonResult = await callGeminiJson({
    key,
    prompt: skeletonPrompt,
    maxOutputTokens: 4096,
    responseSchema: TRAIL_SKELETON_SCHEMA,
    temperature: 0.2,
  });

  const skeleton = normalizeTrailSkeleton(skeletonResult.parsed, desiredTopics, topicNames);
  const totalSignals = Math.max(fileNames.length, sources.length, body.fileContents?.trim() ? 1 : 0, 1);

  const detailedTopics: JsonRecord[] = [];
  for (let index = 0; index < skeleton.length; index += 1) {
    const topic = skeleton[index];
    const contentTarget = computeContentTarget(index, skeleton.length, totalSignals, topic.arquivos_relacionados.length);
    const relatedFilesHint =
      topic.arquivos_relacionados.length > 0
        ? `Arquivos prioritarios para este topico: ${topic.arquivos_relacionados.join(", ")}`
        : "Sem arquivo dedicado: use as fontes gerais.";

    const detailPrompt = `Voce e especialista em conteudo didatico multimidia.
Idioma obrigatorio: portugues brasileiro.
${sourceGuard}

Topico atual:
- Nome: ${topic.nome}
- Descricao: ${topic.descricao}
- Ordem: ${topic.ordem}
- Conteudos alvo para este topico: ${contentTarget}
- ${relatedFilesHint}

${sourceBlock}

Retorne SOMENTE JSON valido com:
{
  "conteudos": [
    {
      "ref": "content:1",
      "titulo": "Titulo do conteudo",
      "tipo": "texto",
      "conteudo": "Texto em markdown",
      "sourceRef": "legacy:1",
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
          "tipo": "video",
          "titulo": "Nome da midia",
          "descricao": "Descricao",
          "roteiro": "Roteiro curto",
          "transcricao": "Transcricao opcional",
          "url": "",
          "formato_arquivo": "mp4",
          "sourceRef": "legacy:1"
        }
      ]
    }
  ]
}

Regras obrigatorias:
- Gere exatamente ${contentTarget} conteudos para este topico.
- Para CADA conteudo, gere 2 cards, 1 atividade e pelo menos 1 midia.
- Tipos de atividade permitidos: quiz, questao, texto, true_false, fill_blank.
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
          maxOutputTokens: 4096,
          responseSchema: TRAIL_DETAIL_SCHEMA,
          temperature: 0.3,
        });
        detailPayload = detailResult.parsed;
        break;
      } catch (error) {
        lastDetailError = error;
        if (attempt >= 3) break;
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

    const normalizedContents = normalizeTrailDetails(detailPayload, topic, contentTarget);
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

    detailedTopics.push({
      nome: topic.nome,
      descricao: topic.descricao,
      ordem: topic.ordem,
      depende: topic.depende,
      next: topic.next,
      conteudos: normalizedContents,
      cards: topicCards,
      atividades: topicActivities,
    });
  }

  return { topicos: detailedTopics };
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
Idioma obrigatorio: portugues brasileiro.
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
Idioma obrigatorio: portugues brasileiro.
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
- Tipos de atividade permitidos: quiz, questao, texto, true_false, fill_blank.`;
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
const GEMINI_MODEL = "gemini-2.5-flash-lite";
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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
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
  temperature: number;
  responseSchema?: Record<string, unknown>;
}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${params.key}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: params.prompt }] }],
      generationConfig: {
        temperature: params.temperature,
        maxOutputTokens: params.maxOutputTokens,
        responseMimeType: "application/json",
        ...(params.responseSchema ? { responseSchema: params.responseSchema } : {}),
      },
    }),
  });

  const apiData = (await response.json()) as JsonObject;
  if (!response.ok) throw new Error(`gemini_http_error:${JSON.stringify(apiData)}`);

  const candidate = Array.isArray((apiData as { candidates?: unknown }).candidates)
    ? ((apiData as { candidates: Array<Record<string, unknown>> }).candidates[0] ?? null)
    : null;
  const parts = Array.isArray(candidate?.content && (candidate.content as { parts?: unknown }).parts)
    ? ((candidate.content as { parts: Array<Record<string, unknown>> }).parts ?? [])
    : [];
  const text = parts.map((part) => (typeof part.text === "string" ? part.text : "")).join("").trim();
  const finishReason = typeof candidate?.finishReason === "string" ? candidate.finishReason : null;
  return { text, finishReason };
}

function ensureMin<T>(items: T[], minItems: number, factory: (index: number) => T): T[] {
  const next = [...items];
  while (next.length < minItems) {
    next.push(factory(next.length));
  }
  return next;
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

function pickDifficulty(index: number): "facil" | "intermediaria" | "avancada" {
  if (index < 4) return "facil";
  if (index < 7) return "intermediaria";
  return "avancada";
}

function fallbackCard(index: number, topicName: string): AiCard {
  const label = topicName || "conteudo selecionado";
  const questionTemplates = [
    `Qual e o conceito central de ${label}`,
    `Como aplicar ${label} em um caso pratico`,
    `Qual erro comum deve ser evitado ao estudar ${label}`,
    `Qual diferenca principal aparece em ${label}`,
    `Qual etapa inicial e essencial em ${label}`,
    `Como validar o entendimento de ${label}`,
    `Qual exemplo representa melhor ${label}`,
    `Qual criterio define sucesso em ${label}`,
    `Como explicar ${label} para iniciantes`,
    `Qual relacao de ${label} com o objetivo do topico`,
  ];
  const answerTemplates = [
    "A resposta destaca a definicao principal e seu objetivo de aprendizagem.",
    "A aplicacao correta usa o conceito no contexto certo e com justificativa.",
    "O erro comum e confundir termos proximos sem verificar o contexto do material.",
    "A diferenca aparece no foco de uso, no criterio de avaliacao e no resultado esperado.",
    "A etapa inicial e revisar os fundamentos antes de executar qualquer atividade.",
    "A validacao ocorre ao resolver um caso e justificar a decisao com base no conteudo.",
    "O melhor exemplo e o que mostra entrada, processo e saida de forma objetiva.",
    "O sucesso e medido por coerencia conceitual e aplicacao pratica correta.",
    "A explicacao para iniciantes deve usar linguagem simples e exemplo direto.",
    "A relacao com o objetivo e garantir entendimento para aplicar o conteudo com autonomia.",
  ];
  const question = questionTemplates[index % questionTemplates.length];
  const answer = answerTemplates[index % answerTemplates.length];
  return {
    titulo: `${question}?`,
    descricao: answer,
  };
}

function fallbackAtividade(index: number, topicName: string): AiAtividade {
  const label = topicName || "conteudo";
  const difficulty = pickDifficulty(index);
  const easyTitles = [
    "Reconhecimento conceitual",
    "Compreensao inicial",
    "Fundamentos do tema",
    "Identificacao de conceitos",
  ];
  const midTitles = [
    "Aplicacao guiada",
    "Analise de contexto",
    "Interpretacao de caso",
  ];
  const hardTitles = [
    "Resolucao analitica",
    "Sintese argumentativa",
    "Transferencia de conhecimento",
  ];

  if (difficulty === "facil") {
    return {
      titulo: easyTitles[index % easyTitles.length],
      enunciado: `Identifique o conceito central de ${label} e escolha a alternativa que melhor o representa.`,
      tipo: "quiz",
      alternativas: [
        "Definicao correta do conceito",
        "Exemplo fora do contexto",
        "Informacao contraditoria",
        "Conclusao sem base no material",
      ],
      resposta_correta: "Definicao correta do conceito",
      nota_estabelecida: null,
    };
  }

  if (difficulty === "intermediaria") {
    return {
      titulo: midTitles[index % midTitles.length],
      enunciado: `Complete a lacuna com o termo adequado para aplicar ${label} em um caso pratico.`,
      tipo: "fill_blank",
      alternativas: null,
      resposta_correta: "Termo tecnico correto",
      nota_estabelecida: null,
    };
  }

  return {
    titulo: hardTitles[index % hardTitles.length],
    enunciado: `Resolva um problema aplicado de ${label}, justificando cada decisao com base no material estudado.`,
    tipo: "essay",
    alternativas: null,
    resposta_correta: "Resposta dissertativa orientada",
    nota_estabelecida: null,
  };
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

function normalizeCards(raw: unknown, topicName: string): { items: AiCard[]; sourceUniqueCount: number } {
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

  const unique = dedupeBy(parsed, (card) => `${normalizeKey(card.titulo)}|${normalizeKey(card.descricao)}`).slice(0, 30);
  const filled = ensureMin(unique, 10, (index) => fallbackCard(index, topicName));
  return { items: filled, sourceUniqueCount: unique.length };
}

function normalizeAtividades(raw: unknown, topicName: string): { items: AiAtividade[]; sourceUniqueCount: number } {
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
  ).slice(0, 20);

  const filled = ensureMin(unique, 10, (index) => fallbackAtividade(index, topicName));
  return { items: filled, sourceUniqueCount: unique.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = (await req.json()) as RequestBody;
    const mode = asString(body.mode) || "all";
    const key = Deno.env.get("GEMINI_API_KEY");

    if (!key) {
      return jsonResponse({ error: "GEMINI_API_KEY not set" }, 500);
    }

    // Geracao de trilha completa em duas etapas (esqueleto + detalhes + midias)
    if (mode === "trail") {
      const sources = normalizeSources(body);
      const payload = await generateTrailTwoSteps(body, sources, key);
      return jsonResponse(payload);
    }

    // Modo description/content: contexto pedagogico + guia de tema + melhor de N tentativas
    if (mode === "description" || mode === "content") {
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

    const contentLines = contents
      .map((content) => {
        const header = `- [${content.tipo || "texto"}] ${content.titulo || "Sem titulo"}`;
        if (content.tipo === "texto" && content.conteudo) {
          return `${header}: ${content.conteudo.substring(0, MAX_CONTENT_SNIPPET)}`;
        }
        return header;
      })
      .join("\n");
    const contentLinesBlock = contentLines || "- Sem conteudo textual informado.";

    if (mode === "description") {
      const prompt = `Voce e assistente pedagogico.
${contextBlock}
${themeGuideBlock}
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
        maxOutputTokens: 700,
        temperature: 0.3,
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
          500,
        );
      }
      return jsonResponse(normalizeDescription(parsed));
    }

    let bestCards: AiCard[] | null = null;
    let bestAtividades: AiAtividade[] | null = null;
    let bestScore = -1;

    for (let attempt = 0; attempt < CONTENT_GEN_ATTEMPTS; attempt += 1) {
      const nonce = crypto.randomUUID();
      const contentPrompt = `Voce e especialista em design instrucional.
Gere um pacote de estudo para o conteudo selecionado.

${contextBlock}
${themeGuideBlock}
Topico de trabalho: "${topicLabel}"
${topicoDescricao ? `Descricao do topico: "${topicoDescricao}"` : ""}
Conteudo selecionado (base obrigatoria):
${contentLinesBlock}${materialBlock}
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
- Para tipo "essay", nao inclua alternativas e use resposta orientadora dissertativa.
- Use apenas estes tipos: "quiz", "true_false", "fill_blank", "essay".
- Nao repita cards (titulo/descricao) nem atividades (titulo/enunciado/resposta) dentro do mesmo array.
- Se detectar repeticao potencial, reescreva completamente o item.
- Em cards: "titulo" deve ser PERGUNTA e "descricao" deve ser RESPOSTA.
- Nao use indices, numeracao, prefixos como "Card 1", "Atividade 2", "Questao 3" em nenhum campo.
- Responda em portugues do Brasil.
- Retorne SOMENTE JSON valido (sem markdown).`;

      const call = await callGemini({
        key,
        prompt: contentPrompt,
        maxOutputTokens: 9000,
        temperature: Math.min(0.8, 0.35 + attempt * 0.15),
      });
      const parsed = parseGeminiJson(call.text);
      if (!parsed || typeof parsed !== "object") {
        if (attempt === CONTENT_GEN_ATTEMPTS - 1) {
          return jsonResponse(
            {
              error: "invalid_ai_response",
              finish_reason: call.finishReason,
              raw: call.text,
            },
            500,
          );
        }
        continue;
      }

      const row = parsed as Record<string, unknown>;
      const cardsResult = normalizeCards(row.cards, topicLabel);
      const atividadesResult = normalizeAtividades(row.atividades, topicLabel);
      const score = cardsResult.sourceUniqueCount + atividadesResult.sourceUniqueCount;
      if (score > bestScore) {
        bestScore = score;
        bestCards = cardsResult.items;
        bestAtividades = atividadesResult.items;
      }

      if (cardsResult.sourceUniqueCount >= 10 && atividadesResult.sourceUniqueCount >= 10) {
        break;
      }
    }

    if (!bestCards || !bestAtividades) {
      bestCards = ensureMin([], 10, (index) => fallbackCard(index, topicLabel));
      bestAtividades = ensureMin([], 10, (index) => fallbackAtividade(index, topicLabel));
    }

    return jsonResponse({
      cards: bestCards,
      atividades: bestAtividades,
    });
    }

    // Modo legado (all): prompt unico com compatibilidade de cards/atividades
    const sources = normalizeSources(body);
    const prompt = buildStandardPrompt(body, sources);
    const callResult = await callGeminiJson({
      key,
      prompt,
      maxOutputTokens: 4096,
      temperature: 0.3,
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
