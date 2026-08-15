// Cliente HTTP do motor de apresentacao (BrainHexPDF, servico externo). Gera
// o deck (Gemini) e o HTML completo do lado de la, sobe o arquivo no
// Supabase Storage e devolve so a URL/path — o merge em
// conteudo_personalizado continua no microservice (mergePersonalizacaoMateriais).
// Ver docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md.

import { createLogger } from "../lib/logger";
import type { BrainHexProfile } from "../constants/brainHex";

const log = createLogger({ ctx: "brainhexpdf-client" });

export interface PresentationRenderFailure {
  stage: "render" | "upload";
  error: string;
}

export interface RenderAndUploadPresentationResult {
  presentationUrl: string | null;
  failure: PresentationRenderFailure | null;
}

export interface RenderAndUploadPresentationParams {
  markdown: string;
  topic: string;
  profile: BrainHexProfile;
  bucket: string;
  presentationPath: string;
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
      }),
      signal: ac.signal,
    });

    const body: any = await response.json().catch(() => null);

    if (!response.ok || !body || body.success !== true) {
      const stage: "render" | "upload" = body?.stage === "upload" ? "upload" : "render";
      const errMsg = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
      log.error("render-and-store falhou", { status: response.status, stage, error: errMsg });
      return { presentationUrl: null, failure: { stage, error: truncateError(errMsg) } };
    }

    if (typeof body.url !== "string" || !body.url) {
      return {
        presentationUrl: null,
        failure: { stage: "upload", error: "resposta sem url publica" },
      };
    }

    return { presentationUrl: body.url, failure: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("render-and-store erro de rede/timeout", { err: error });
    return { presentationUrl: null, failure: { stage: "upload", error: truncateError(message) } };
  } finally {
    clearTimeout(timer);
  }
}
