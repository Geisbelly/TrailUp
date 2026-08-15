// microservice/src/services/brainhexPdfClient.ts
//
// Cliente HTTP pro microservice externo BrainHexPDF
// (https://github.com/Geisbelly/BrainHexPDF), endpoint
// POST /api/v1/render-and-store. Gera a apresentação HTML interativa a
// partir do markdown já produzido pelo Gemini local (runPipeline) e sobe
// o arquivo no Supabase Storage com a service role key própria do
// BrainHexPDF — este cliente só registra o resultado, nunca faz upload.
//
// Nunca lança exceção: qualquer falha (rede, timeout, auth, resposta
// inválida) é logada e retorna null. Chamador trata como falha isolada,
// igual generateNaturalAudio hoje (ver server.ts:runPipeline).

import type { Logger } from "../lib/logger";
import type { BrainHexProfile } from "../constants/brainHex";

export interface RenderAndStoreResult {
  url:         string;
  storagePath: string;
  bucket:      string;
  slideCount:  number;
}

export interface RenderAndStoreParams {
  profile:     BrainHexProfile;
  sourceText:  string;
  bucket:      string;
  storagePath: string;
  classe?:     string;
  log:         Logger;
}

export function getConfig() {
  // Number(...) || default deixaria valores negativos (ex.: "-1") passar,
  // pois são truthy — o setTimeout dispararia quase instantaneamente e
  // abortaria toda chamada. Exige finito e estritamente positivo.
  const parsedTimeout = Number(process.env.BRAINHEXPDF_TIMEOUT_MS);
  return {
    baseUrl:   (process.env.BRAINHEXPDF_URL ?? "").trim().replace(/\/+$/, ""),
    secret:    (process.env.BRAINHEXPDF_SHARED_SECRET ?? "").trim(),
    timeoutMs: (Number.isFinite(parsedTimeout) && parsedTimeout > 0) ? parsedTimeout : 120_000,
  };
}

export async function renderAndStore(params: RenderAndStoreParams): Promise<RenderAndStoreResult | null> {
  const { profile, sourceText, bucket, storagePath, classe, log } = params;
  const { baseUrl, secret, timeoutMs } = getConfig();

  if (!baseUrl) {
    log.warn("BRAINHEXPDF_URL não configurada — pulando geração de apresentação HTML");
    return null;
  }

  const ac    = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/api/v1/render-and-store`, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-api-secret": secret } : {}),
      },
      body: JSON.stringify({
        targetProfile: profile,
        sourceText,
        classe: classe ?? "Turma-Geral",
        bucket,
        storagePath,
      }),
    });

    const json: any = await res.json().catch(() => null);

    if (!res.ok || !json || json.success !== true) {
      log.error("brainhexPdfClient: render-and-store falhou", {
        status: res.status,
        stage:  json?.stage,
        error:  json?.error,
      });
      return null;
    }

    if (!json.url || !json.storage_path || !json.bucket) {
      log.error("brainhexPdfClient: resposta sem campos obrigatórios", { json });
      return null;
    }

    return {
      url:         json.url,
      storagePath: json.storage_path,
      bucket:      json.bucket,
      slideCount:  Number(json.slide_count) || 0,
    };
  } catch (err: any) {
    log.error("brainhexPdfClient: erro de rede/timeout", {
      err:      err?.message ?? String(err),
      aborted:  ac.signal.aborted,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
