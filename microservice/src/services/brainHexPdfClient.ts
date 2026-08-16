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

export interface PresentationRenderFailure {
  stage: "render" | "upload";
  error: string;
}

export interface RenderAndUploadPresentationResult {
  presentationUrl: string | null;
  failure: PresentationRenderFailure | null;
  dbWritten: boolean;
}

export interface PresentationVersionMetadata {
  engine: string;
  schema: string;
  design_system: string;
  media_pipeline_version: string;
}

export interface RenderAndUploadPresentationParams {
  markdown: string;
  topic: string;
  profile: BrainHexProfile;
  bucket: string;
  presentationPath: string;
  personalizacaoId: number;
  fence: GenerationFence;
  versionMetadata: PresentationVersionMetadata;
  ordem: number;
  totalPartes: number;
  titulo: string;
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
        personalizacaoId: params.personalizacaoId,
        cicloId: params.fence.cicloId,
        sourceHash: params.fence.sourceHash,
        presentationVersionMetadata: params.versionMetadata,
        ordem: params.ordem,
        totalPartes: params.totalPartes,
        titulo: params.titulo,
      }),
      signal: ac.signal,
    });

    const body: any = await response.json().catch(() => null);

    if (!response.ok || !body || body.success !== true) {
      const stage: "render" | "upload" = body?.stage === "upload" ? "upload" : "render";
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

    return { presentationUrl: body.url, failure: null, dbWritten: body?.dbWritten === true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("render-and-store erro de rede/timeout", { err: error });
    return { presentationUrl: null, failure: { stage: "upload", error: truncateError(message) }, dbWritten: false };
  } finally {
    clearTimeout(timer);
  }
}
