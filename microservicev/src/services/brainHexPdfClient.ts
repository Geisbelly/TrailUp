// Cliente HTTP do motor de apresentacao (BrainHexPDF, servico externo). Gera
// o deck (Gemini) e o HTML completo do lado de la, sobe o arquivo no
// Supabase Storage e grava o resultado direto no banco (RPC
// merge_personalizacao_materiais_v2 + materiais_gerados) quando recebe os
// dados de fencing - ver docs/superpowers/specs/
// 2026-08-16-brainhexpdf-direct-db-write-design.md. `dbWritten` na resposta
// indica se o BrainHexPDF conseguiu persistir; quando false (falha de
// transporte), o caller precisa gravar o fallback ele mesmo.

import { createLogger } from "../lib/logger";
import type { BrainHexProfile } from "../constants/brainHex";
import type { GenerationFence } from "./supabaseService";

const log = createLogger({ ctx: "brainhexpdf-client" });

// Espelha os stages reais que o BrainHexPDF reporta (server.ts la, endpoint
// /api/v1/render-and-store): validate, generate, render, upload, e um
// "unknown" de contingencia. "network" e nosso proprio - cobre erro de
// rede/timeout daqui, quando nao houve resposta nenhuma do servidor pra
// reportar um stage.
export type PresentationRenderStage =
  | "validate"
  | "generate"
  | "render"
  | "upload"
  | "network"
  | "unknown";

export interface PresentationRenderFailure {
  stage: PresentationRenderStage;
  error: string;
}

const KNOWN_REMOTE_STAGES: readonly string[] = ["validate", "generate", "render", "upload", "unknown"];

function normalizeRemoteStage(rawStage: unknown): PresentationRenderStage {
  return typeof rawStage === "string" && KNOWN_REMOTE_STAGES.includes(rawStage)
    ? (rawStage as PresentationRenderStage)
    : "unknown";
}

export interface RenderAndUploadPresentationResult {
  presentationUrl: string | null;
  failure: PresentationRenderFailure | null;
  dbWritten: boolean;
  // So preenchido quando a chamada foi feita SEM attachments do professor -
  // o BrainHexPDF gerou uma ilustracao por IA pra pelo menos 1 subtopico.
  // runPipeline (server.ts) usa isso como fallback de imagem no
  // markdown/audio quando nao ha imagem do professor - ver
  // docs/superpowers/specs/2026-08-24-imagem-gerada-fallback-markdown-audio-design.md.
  generatedImagesBySubtopic?: Record<string, string>;
}

export interface PresentationVersionMetadata {
  engine: string;
  schema: string;
  design_system: string;
  media_pipeline_version: string;
}

export interface PresentationImageAttachment {
  data: string; // base64, sem prefixo data URI
  mimeType: string;
  name: string;
}

export interface RenderAndUploadPresentationParams {
  markdown: string;
  topic: string;
  profile: BrainHexProfile;
  bucket: string;
  presentationPath: string;
  // Ausentes quando o chamador nao tem onde persistir (ex.: modo preview,
  // ver /api/v1/archive em server.ts, que chama com personalizacaoId: null
  // de proposito) - o BrainHexPDF ainda gera e sobe o deck normalmente,
  // so nao grava nada no banco (dbWritten sempre false nesse caso).
  personalizacaoId?: number;
  fence?: GenerationFence;
  versionMetadata?: PresentationVersionMetadata;
  ordem?: number;
  totalPartes?: number;
  titulo?: string;
  // Imagens do material de referencia do professor (subconjunto de
  // fetchFontesAsFileData filtrado por mimeType de imagem em server.ts) -
  // o BrainHexPDF usa pra deixar o Gemini escolher, por slide, uma imagem
  // real em vez de inventar um diagrama generico.
  attachments?: PresentationImageAttachment[];
}

export interface BrainHexPdfClientDeps {
  fetchImpl?: typeof fetch;
}

function truncateError(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 1200) || "brainhexpdf_error";
}

function resolveTimeoutMs(): number {
  return Number(process.env.BRAINHEXPDF_TIMEOUT_MS) || 120_000;
}

export async function renderAndUploadPresentationViaBrainHexPdf(
  params: RenderAndUploadPresentationParams,
  deps: BrainHexPdfClientDeps = {},
): Promise<RenderAndUploadPresentationResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiUrl = (process.env.BRAINHEXPDF_API_URL ?? "").trim();
  if (!apiUrl) {
    return {
      presentationUrl: null,
      failure: { stage: "render", error: "BRAINHEXPDF_API_URL nao configurado" },
      dbWritten: false,
    };
  }

  const apiSecret = (process.env.BRAINHEXPDF_API_SECRET ?? "").trim();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), resolveTimeoutMs());

  try {
    const response = await fetchImpl(`${apiUrl.replace(/\/+$/, "")}/api/v1/render-and-store`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiSecret ? { "x-api-secret": apiSecret } : {}),
      },
      body: JSON.stringify({
        targetProfile: params.profile,
        topic: params.topic,
        sourceText: params.markdown,
        bucket: params.bucket,
        storagePath: params.presentationPath,
        ...(params.attachments && params.attachments.length > 0
          ? {
              attachments: params.attachments.map((a) => ({
                dataBase64: a.data,
                mimeType: a.mimeType,
                name: a.name,
              })),
            }
          : {}),
        ...(params.personalizacaoId !== undefined && params.fence && params.versionMetadata
          ? {
              personalizacaoId: params.personalizacaoId,
              cicloId: params.fence.cicloId,
              sourceHash: params.fence.sourceHash,
              presentationVersionMetadata: params.versionMetadata,
              ordem: params.ordem ?? 1,
              totalPartes: params.totalPartes ?? 1,
              titulo: params.titulo,
            }
          : {}),
      }),
      signal: ac.signal,
    });

    const body: any = await response.json().catch(() => null);

    if (!response.ok || !body || body.success !== true) {
      const stage = normalizeRemoteStage(body?.stage);
      const errMsg = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
      log.error("render-and-store falhou", { status: response.status, stage, error: errMsg });
      return {
        presentationUrl: null,
        failure: { stage, error: truncateError(errMsg) },
        dbWritten: body?.dbWritten === true,
      };
    }

    if (typeof body.url !== "string" || !body.url) {
      return {
        presentationUrl: null,
        failure: { stage: "upload", error: "resposta sem url publica" },
        dbWritten: body?.dbWritten === true,
      };
    }

    const generatedImagesBySubtopic =
      body.generatedImagesBySubtopic && typeof body.generatedImagesBySubtopic === "object"
        ? (body.generatedImagesBySubtopic as Record<string, string>)
        : undefined;

    return {
      presentationUrl: body.url,
      failure: null,
      dbWritten: body?.dbWritten === true,
      ...(generatedImagesBySubtopic ? { generatedImagesBySubtopic } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("render-and-store erro de rede/timeout", { err: error });
    return { presentationUrl: null, failure: { stage: "network", error: truncateError(message) }, dbWritten: false };
  } finally {
    clearTimeout(timer);
  }
}
