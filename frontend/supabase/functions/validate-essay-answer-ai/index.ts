import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODEL = "gemini-3.6-flash";
// #195: menor de 18 (ou sem data de nascimento) nunca vai ao Gemini; so OpenAI.
const OPENAI_MODEL_DEFAULT = "gpt-4o-mini";
const MENSAGEM_IA_INDISPONIVEL =
  "A IA está indisponível agora. Tente de novo em alguns minutos — suas trilhas, questões e progresso continuam funcionando normalmente.";
const MAX_CONTENT_CHARS = 12000;
const MAX_TEXT_CHARS = 5000;

type JsonObject = Record<string, unknown>;

interface RequestBody {
  enunciado?: unknown;
  respostaAluno?: unknown;
  respostaProfessor?: unknown;
  conteudoBase?: unknown;
  notaEstabelecida?: unknown;
  materiaNome?: unknown;
  materiaDescricao?: unknown;
  classeNome?: unknown;
  topicoNome?: unknown;
  topicoDescricao?: unknown;
}

const ESSAY_EVAL_SCHEMA = {
  type: "OBJECT",
  required: ["nota_obtida", "percentual", "correta", "feedback", "pontos_fortes", "pontos_melhoria"],
  properties: {
    nota_obtida: { type: "NUMBER" },
    percentual: { type: "NUMBER" },
    correta: { type: "BOOLEAN" },
    feedback: { type: "STRING" },
    pontos_fortes: {
      type: "ARRAY",
      minItems: 1,
      maxItems: 5,
      items: { type: "STRING" },
    },
    pontos_melhoria: {
      type: "ARRAY",
      minItems: 1,
      maxItems: 5,
      items: { type: "STRING" },
    },
    observacao: { type: "STRING" },
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
type AuthClient = ReturnType<typeof createClient>;

async function requireAuthenticatedUser(req: Request): Promise<AuthClient | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!authHeader || !supabaseUrl || !supabaseAnonKey) return null;

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await authClient.auth.getUser();
  return !error && Boolean(data?.user) ? authClient : null;
}

// #195: adulto confirmado (menor === false) segue no Gemini. Menor, data de
// nascimento desconhecida (null) ou erro na consulta -> rota de menor (OpenAI).
// Fail-closed: na duvida, trata como menor.
async function alunoEhAdultoConfirmado(authClient: AuthClient): Promise<boolean> {
  try {
    const { data, error } = await authClient.rpc("aluno_meu_consentimento");
    if (error || !data || typeof data !== "object") return false;
    return (data as { menor?: unknown }).menor === false;
  } catch {
    return false;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function parseOptionalPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const normalized = typeof value === "string" ? value.replace(",", ".").trim() : value;
  if (normalized === "") return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function stripCodeFence(value: string): string {
  return value.replace(/^\uFEFF/, "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractJsonCandidate(value: string): string | null {
  const cleaned = value.trim();
  const firstObject = cleaned.indexOf("{");
  const firstArray = cleaned.indexOf("[");
  const start =
    firstObject >= 0 && firstArray >= 0 ? Math.min(firstObject, firstArray) : Math.max(firstObject, firstArray);
  if (start < 0) return null;

  const opening = cleaned[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === opening) depth += 1;
    if (ch === closing) depth -= 1;
    if (depth === 0) return cleaned.slice(start, i + 1);
  }

  return null;
}

function parseAiJson(text: string): unknown | null {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const candidate = extractJsonCandidate(cleaned);
    if (!candidate) return null;
    try {
      return JSON.parse(stripCodeFence(candidate));
    } catch {
      return null;
    }
  }
}

function normalizeList(value: unknown, fallback: string): string[] {
  const rows = Array.isArray(value) ? value : [];
  const items = rows
    .map((entry) => asString(entry))
    .filter(Boolean)
    .slice(0, 5);

  if (items.length > 0) return items;
  return [fallback];
}

function normalizeEvaluation(raw: unknown, notaMaxima: number) {
  const notaMax = round2(clamp(asNumber(notaMaxima, 100), 0.1, 1000));
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const notaRaw = round2(asNumber(row.nota_obtida, 0));
  const notaObtida = clamp(notaRaw, 0, notaMax);

  const percentualRaw = asNumber(row.percentual, notaMax > 0 ? (notaObtida / notaMax) * 100 : 0);
  const percentual = round2(clamp(percentualRaw, 0, 100));

  const correta = typeof row.correta === "boolean" ? row.correta : percentual >= 60;
  const feedback =
    asString(row.feedback) ||
    "Resposta analisada pela IA. Revise os pontos fortes e os pontos de melhoria para evoluir.";
  const observacao = asString(row.observacao);

  return {
    nota_obtida: notaObtida,
    nota_maxima: notaMax,
    percentual,
    correta,
    feedback,
    pontos_fortes: normalizeList(row.pontos_fortes, "A resposta demonstra entendimento parcial do tema."),
    pontos_melhoria: normalizeList(row.pontos_melhoria, "Aprofunde a justificativa com base no conteudo."),
    ...(observacao ? { observacao } : {}),
  };
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
  return `\nCONTEXTO PEDAGOGICO\n${lines.join("\n")}`;
}

async function callGemini(params: {
  key: string;
  prompt: string;
  maxOutputTokens: number;
  temperature: number;
  responseSchema?: Record<string, unknown>;
}) {
  // Chave no header, nao na URL (#195): URL vai parar em log.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": params.key },
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

// Rota de menor (#195): OpenAI com store:false (nada guardado na conta para
// distill/evals). Sem fallback para o Gemini.
async function callOpenAI(params: {
  key: string;
  prompt: string;
  maxOutputTokens: number;
  temperature: number;
}) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.key}` },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL_DEFAULT") || OPENAI_MODEL_DEFAULT,
      store: false,
      temperature: params.temperature,
      max_tokens: params.maxOutputTokens,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: params.prompt }],
    }),
  });
  const apiData = (await response.json().catch(() => ({}))) as JsonObject;
  if (!response.ok) throw new Error(`openai_http_error:${response.status}`);
  const choice = Array.isArray((apiData as { choices?: unknown }).choices)
    ? ((apiData as { choices: Array<Record<string, unknown>> }).choices[0] ?? null)
    : null;
  const message = choice?.message as { content?: unknown } | undefined;
  const text = typeof message?.content === "string" ? message.content.trim() : "";
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
  return { text, finishReason };
}

function iaIndisponivel(): Response {
  return jsonResponse({ error: "ia_indisponivel", mensagem: MENSAGEM_IA_INDISPONIVEL }, 503);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authClient = await requireAuthenticatedUser(req);
  if (!authClient) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  try {
    const body = (await req.json()) as RequestBody;
    const enunciado = asString(body.enunciado).substring(0, MAX_TEXT_CHARS);
    const respostaAluno = asString(body.respostaAluno).substring(0, MAX_TEXT_CHARS);
    const respostaProfessor = asString(body.respostaProfessor).substring(0, MAX_TEXT_CHARS);
    const conteudoBase = asString(body.conteudoBase).substring(0, MAX_CONTENT_CHARS);
    const notaInformada = parseOptionalPositiveNumber(body.notaEstabelecida);
    const notaEstabelecida = round2(clamp(notaInformada ?? 100, 0.1, 1000));

    if (!enunciado) return jsonResponse({ error: "missing_enunciado" }, 400);
    if (!respostaAluno) return jsonResponse({ error: "missing_resposta_aluno" }, 400);

    const rotaDeMenor = !(await alunoEhAdultoConfirmado(authClient));
    const key = rotaDeMenor ? Deno.env.get("OPENAI_API_KEY") : Deno.env.get("GEMINI_API_KEY");
    if (!key) {
      if (rotaDeMenor) return iaIndisponivel();
      return jsonResponse({ error: "GEMINI_API_KEY not set" }, 500);
    }

    const contextBlock = buildContextBlock({
      materiaNome: asString(body.materiaNome),
      materiaDescricao: asString(body.materiaDescricao),
      classeNome: asString(body.classeNome),
      topicoNome: asString(body.topicoNome),
      topicoDescricao: asString(body.topicoDescricao),
    });

    const prompt = `Voce e um avaliador pedagogico rigoroso e justo.
Avaliacao de questao dissertativa com nota maxima ${notaEstabelecida.toFixed(2)}.
${contextBlock}

ENUNCIADO COMPLETO:
${enunciado}

RESPOSTA ESPERADA / CRITERIO DO PROFESSOR:
${respostaProfessor || "Nao informado. Considere apenas enunciado e conteudo base."}

CONTEUDO BASE PARA CORRECAO:
${conteudoBase || "Nao informado."}

RESPOSTA DO ALUNO:
${respostaAluno}

Regras obrigatorias:
- Avalie aderencia ao enunciado, precisao conceitual e qualidade da argumentacao.
- A nota_obtida deve ficar entre 0 e ${notaEstabelecida.toFixed(2)}.
- percentual deve ficar entre 0 e 100.
- correta deve ser true somente se a resposta atingir nivel satisfatorio (normalmente >= 60%).
- feedback deve ser objetivo e acionavel.
- pontos_fortes e pontos_melhoria com 1 a 5 itens cada.
- Retorne SOMENTE JSON valido (sem markdown).`;

    let call: { text: string; finishReason: string | null };
    if (rotaDeMenor) {
      try {
        call = await callOpenAI({ key, prompt, maxOutputTokens: 1800, temperature: 0.2 });
      } catch {
        return iaIndisponivel();
      }
    } else {
      call = await callGemini({
        key,
        prompt,
        maxOutputTokens: 1800,
        temperature: 0.2,
        responseSchema: ESSAY_EVAL_SCHEMA as unknown as Record<string, unknown>,
      });
    }

    const parsed = parseAiJson(call.text);
    if (!parsed) {
      if (rotaDeMenor) return iaIndisponivel();
      return jsonResponse(
        {
          error: "invalid_ai_response",
          finish_reason: call.finishReason,
          raw: call.text,
        },
        500,
      );
    }

    return jsonResponse(normalizeEvaluation(parsed, notaEstabelecida));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
