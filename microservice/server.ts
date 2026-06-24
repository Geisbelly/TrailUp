import "dotenv/config";
import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import {
  processMediaWithGemini,
  generateNaturalAudio,
  generateSlideImage,
} from "./src/services/geminiService";
import { BrainHexProfile } from "./src/constants/brainHex";
import {
  isSupabaseConfigured,
  uploadBuffer,
  mergePersonalizacaoMateriais,
  saveMateriaisGerados,
  markPersonalizacaoFailed,
  recoverStaleJobs,
  startJobHeartbeat,
  MaterialEntry,
} from "./src/services/supabaseService";
import { generateSlidesPDF } from "./src/services/pdfService";
import { createLogger, type Logger } from "./src/lib/logger";
import { enrichSlidesWithImages } from "./src/lib/slideEnricher";
import { validatePersonalizarBody } from "./src/lib/validators";
import { createRateLimiter } from "./src/lib/rateLimit";

const log = createLogger({ ctx: "brainhex" });

// Augmenta o tipo Request com nosso logger por-request e requestId.
declare module "express-serve-static-core" {
  interface Request {
    log:       Logger;
    requestId: string;
  }
}

const VALID_PROFILES: BrainHexProfile[] = [
  "mastermind", "seeker", "survivor", "daredevil", "conqueror", "socializer", "achiever",
];

const VOICE_MAP: Record<BrainHexProfile, "Puck" | "Charon" | "Kore" | "Fenrir" | "Zephyr"> = {
  mastermind: "Charon",
  seeker:     "Puck",
  survivor:   "Fenrir",
  daredevil:  "Zephyr",
  conqueror:  "Kore",
  socializer: "Kore",
  achiever:   "Puck",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

/** Gera até 6 imagens para os slides (com intervalo para respeitar rate-limit) */
async function generateSlidesImages(slides: any[]): Promise<string[]> {
  const images: string[] = [];
  const max = Math.min(slides.length, 6);
  for (let i = 0; i < max; i++) {
    try {
      if (i > 0) await new Promise((r) => setTimeout(r, 3000));
      images.push((await generateSlideImage(slides[i].imagePrompt)) ?? "");
    } catch (e) {
      log.error("imagem slide falhou", { slide: i, err: e });
      images.push("");
    }
  }
  return images;
}

// enrichSlidesWithImages extraído para src/lib/slideEnricher.ts (testado).

// ─── Core: archive to Supabase ────────────────────────────────────────────────

async function archiveToSupabase(params: {
  profile:         BrainHexProfile;
  storagePath:     string;
  bucket:          string;
  refId:           string;
  markdown:        string;
  audioScript:     string;
  slides:          any[];             // slides COM imagem_referencia
  mp3Base64:       string | null;
  wavBase64:       string | null;
  personalizacaoId: number | null;
  log?:            Logger;
}): Promise<{ audioMp3Url: string | null; markdownUrl: string | null; pdfUrl: string | null }> {
  const { profile, storagePath, bucket, refId, markdown, audioScript, slides, mp3Base64, wavBase64, personalizacaoId } = params;
  const lg = params.log ?? log;

  // Cada upload é isolado: uma falha não impede os demais nem o merge final.
  // Isso evita órfãos no Storage (arquivo subiu mas banco não sabe) e permite
  // sucesso parcial — o `mergePersonalizacaoMateriais` cuida do status agregado.

  // Áudio: prefere MP3, usa WAV como fallback
  const audioPayload = mp3Base64 ?? wavBase64;
  const audioExt     = mp3Base64 ? "mp3" : "wav";
  const audioMime    = mp3Base64 ? "audio/mpeg" : "audio/wav";
  const audioPath    = `${storagePath}/audio/material-${refId}.${audioExt}`;
  let audioMp3Url: string | null = null;
  if (audioPayload) {
    try {
      const audioBytes = Buffer.from(audioPayload, "base64");
      audioMp3Url      = await uploadBuffer(bucket, audioPath, audioBytes, audioMime);
      lg.info("áudio upload", { status: audioMp3Url ? "ok" : "falhou", ext: audioExt });
    } catch (e) {
      lg.error("falha no upload de áudio", { err: e });
    }
  }

  // Markdown — charset=utf-8 preserva PT-BR (acentos, ç, ã, etc.)
  const mdPath = `${storagePath}/markdown/material-${refId}.md`;
  let markdownUrl: string | null = null;
  if (markdown) {
    try {
      const mdBytes = Buffer.from(markdown, "utf-8");
      markdownUrl   = await uploadBuffer(bucket, mdPath, mdBytes, "text/markdown; charset=utf-8");
      lg.info("markdown upload", { status: markdownUrl ? "ok" : "falhou" });
    } catch (e) {
      lg.error("falha no upload de markdown", { err: e });
    }
  }

  // PDF dos slides (layout 2 painéis: imagem esquerda, conteúdo direita)
  const pdfPath = `${storagePath}/apresentacao/material-${refId}.pdf`;
  let pdfUrl: string | null = null;
  try {
    const pdfBytes = await generateSlidesPDF(slides, profile);
    pdfUrl         = await uploadBuffer(bucket, pdfPath, pdfBytes, "application/pdf");
    lg.info("pdf upload", { status: pdfUrl ? "ok" : "falhou" });
  } catch (e) {
    lg.error("falha ao gerar/enviar PDF", { err: e });
  }

  // Persiste metadados no banco (somente quando chamado pelo ApiTraiUp)
  if (personalizacaoId !== null) {
    const audioStatus  = audioMp3Url  ? "completed" : "failed";
    const mdStatus     = markdownUrl  ? "completed" : "failed";
    const pdfStatus    = pdfUrl       ? "completed" : "failed";
    const audioPayloadObj = { roteiro: audioScript, texto: audioScript };
    const mdPayloadObj    = { texto: markdown, markdown };
    const pdfPayloadObj   = { slides, abertura: markdown.split("\n").find((l) => l.trim()) ?? "" };

    const updates: Record<string, MaterialEntry> = {
      audio: {
        payload:      audioPayloadObj,
        metadata:     { status: audioStatus, media_kind: "audio",        updated_at: now(), ...(audioMp3Url ? { bucket } : {}) },
        arquivo_url:  audioMp3Url,
        storage_path: audioMp3Url ? audioPath : null,
        bucket, mime_type: audioMime,
      },
      markdown: {
        payload:      mdPayloadObj,
        metadata:     { status: mdStatus, media_kind: "markdown",        updated_at: now(), ...(markdownUrl ? { bucket } : {}) },
        arquivo_url:  markdownUrl,
        storage_path: markdownUrl ? mdPath : null,
        bucket, mime_type: "text/markdown; charset=utf-8",
      },
      apresentacao: {
        payload:      pdfPayloadObj,
        metadata:     { status: pdfStatus, media_kind: "apresentacao",   updated_at: now(), ...(pdfUrl ? { bucket } : {}) },
        arquivo_url:  pdfUrl,
        storage_path: pdfUrl ? pdfPath : null,
        ...(pdfUrl ? { bucket, mime_type: "application/pdf" } : {}),
      },
    };

    await mergePersonalizacaoMateriais(personalizacaoId, updates);

    await saveMateriaisGerados(
      personalizacaoId,
      Object.entries(updates).map(([tipo, entry]) => ({
        tipo,
        payload:      entry.payload ?? null,
        arquivo_url:  entry.arquivo_url,
        storage_path: entry.storage_path,
        metadata:     { ...entry.metadata },
      }))
    );

    lg.info("materiais persistidos");
  }

  return { audioMp3Url, markdownUrl, pdfUrl };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface FonteItem {
  url:       string;
  mime_type: string;
  tipo:      string;
}

// SSRF: permite fontes apontando para localhost/redes privadas. NUNCA em prod.
const ALLOW_PRIVATE_FONTE_URLS = process.env.ALLOW_PRIVATE_FONTE_URLS === "true";

// Timeout duro para um job de personalização. Default 15min — cobre o pior
// caso de PPTX grande + Gemini lento + 6 imagens. Configurável via env.
const MAX_JOB_DURATION_MS  = Number(process.env.MAX_JOB_DURATION_MS)  || 15 * 60 * 1000;
// Heartbeat atualiza updated_at periodicamente durante o job, permitindo
// threshold de recovery agressivo sem matar jobs longos em execução.
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS) || 30 * 1000;
// Recovery: qualquer job processando_midias parado há mais que isto = órfão.
// Default 5x o heartbeat (margem para clock skew / latência Supabase).
const STALE_JOB_THRESHOLD_MS = Number(process.env.STALE_JOB_THRESHOLD_MS) || HEARTBEAT_INTERVAL_MS * 5;

// Pipeline completo de uma personalização. Extraído do handler para permitir
// timeout via Promise.race e facilitar leitura.
async function runPersonalizacaoJob(params: {
  profile:          BrainHexProfile;
  personalizacaoId: number;
  fontes:           FonteItem[];
  storagePath:      string;
  bucket:           string;
  refId:            string;
  log:              Logger;
}): Promise<void> {
  const { profile, personalizacaoId, fontes, storagePath, bucket, refId, log: jobLog } = params;

  if (!isSupabaseConfigured()) {
    const msg = "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não configurados no servidor";
    jobLog.error(msg);
    await markPersonalizacaoFailed(personalizacaoId, msg);
    return;
  }

  if (fontes.length === 0) {
    const msg = "fontes vazias — nenhum arquivo enviado para processar";
    jobLog.warn(msg);
    await markPersonalizacaoFailed(personalizacaoId, msg);
    return;
  }

  // Heartbeat ativo durante todo o pipeline — garante que recoverStaleJobs
  // não vai matar este job por inatividade aparente em updated_at.
  const stopHeartbeat = startJobHeartbeat(personalizacaoId, HEARTBEAT_INTERVAL_MS);

  try {
    await runPipeline(personalizacaoId, profile, fontes, storagePath, bucket, refId, jobLog);
  } finally {
    stopHeartbeat();
  }
}

async function runPipeline(
  personalizacaoId: number,
  profile: BrainHexProfile,
  fontes: FonteItem[],
  storagePath: string,
  bucket: string,
  refId: string,
  jobLog: Logger,
): Promise<void> {
  // 1. Download das fontes
  const filesData = await fetchFontesAsFileData(fontes);
  if (filesData.length === 0) {
    const msg = "todas as fontes falharam no download (verifique as URLs e permissões)";
    jobLog.warn(msg);
    await markPersonalizacaoFailed(personalizacaoId, msg);
    return;
  }

  // 2. Texto + slides via Gemini (multi-arquivo)
  const resultado = await processMediaWithGemini(filesData, profile);

  // 3. Áudio (wav + mp3) — falha isolada não interrompe o job
  const voice = VOICE_MAP[profile] ?? "Kore";
  let wavBase64: string | null = null;
  let mp3Base64: string | null = null;
  try {
    const a = await generateNaturalAudio(resultado.audioScript, voice);
    wavBase64 = a.wav ?? null;
    mp3Base64 = a.mp3 ?? null;
  } catch (e) {
    jobLog.error("falha no áudio", { err: e });
  }

  // 4. Imagens dos slides
  const images           = await generateSlidesImages(resultado.slides);
  const slidesComImagens = enrichSlidesWithImages(resultado.slides, images);

  // 5. Persiste tudo no Supabase
  await archiveToSupabase({
    profile,
    storagePath,
    bucket,
    refId,
    markdown:         resultado.markdown,
    audioScript:      resultado.audioScript,
    slides:           slidesComImagens,
    mp3Base64,
    wavBase64,
    personalizacaoId,
    log:              jobLog,
  });
}

// Limite de tamanho por fonte: protege contra URL pública servindo conteúdo
// gigante (OOM, lentidão, custo). Pré-check via Content-Length quando
// disponível + stream com aborto se cumulativo exceder durante leitura.
const MAX_FONTE_BYTES = Number(process.env.MAX_FONTE_SIZE_MB ?? 100) * 1024 * 1024;
const FONTE_FETCH_TIMEOUT_MS = Number(process.env.FONTE_FETCH_TIMEOUT_MS) || 30_000;

async function downloadFonteStreamed(url: string): Promise<Buffer | null> {
  const ac    = new AbortController();
  const timer = setTimeout(() => ac.abort(), FONTE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: ac.signal });
    if (!response.ok) {
      log.error("download falhou", { status: response.status, url });
      return null;
    }

    // Pré-check via Content-Length (rejeita antes de baixar 1 byte)
    const cl = Number(response.headers.get("content-length") ?? -1);
    if (cl > MAX_FONTE_BYTES) {
      log.warn("fonte excede limite (Content-Length)", { url, contentLength: cl, maxBytes: MAX_FONTE_BYTES });
      ac.abort();
      return null;
    }

    // Stream com aborto se cumulativo exceder.
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_FONTE_BYTES) {
        log.warn("fonte excede limite (stream)", { url, total, maxBytes: MAX_FONTE_BYTES });
        ac.abort();
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFontesAsFileData(
  fontes: FonteItem[]
): Promise<{ data: string; mimeType: string; name: string }[]> {
  const results: { data: string; mimeType: string; name: string }[] = [];
  for (const fonte of fontes) {
    if (!fonte.url) continue;
    try {
      const buffer = await downloadFonteStreamed(fonte.url);
      if (!buffer) continue;
      const base64 = buffer.toString("base64");
      const name   = fonte.url.split("/").pop()?.split("?")[0] ?? "arquivo";
      results.push({ data: base64, mimeType: fonte.mime_type, name });
    } catch (err) {
      log.error("erro ao baixar fonte", { url: fonte.url, err });
    }
  }
  return results;
}

// ─── Server ───────────────────────────────────────────────────────────────────

async function startServer() {
  const app  = express();
  const PORT = Number(process.env.PORT) || 3000;
  const JSON_LIMIT = process.env.JSON_LIMIT ?? "50mb";
  const CORS_ORIGIN = process.env.CORS_ORIGIN;          // ex: "https://trailup.app,https://admin.trailup.app"
  const API_SHARED_SECRET = process.env.API_SHARED_SECRET; // opt-in: protege endpoints custosos

  const corsOpts = CORS_ORIGIN
    ? { origin: CORS_ORIGIN.split(",").map((o) => o.trim()) }
    : undefined; // sem env → libera tudo (compat)
  app.use(cors(corsOpts));
  app.use(express.json({ limit: JSON_LIMIT }));

  // Rate limit por IP (sliding window in-process). Aplicado a TUDO exceto
  // /api/health (usado por probes que podem exceder). Protege contra
  // TrailUp comprometido / bug de loop bombardeando Gemini ($$$).
  const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS) || 60_000;
  const RATE_MAX       = Number(process.env.RATE_MAX)       || 30;
  const limiter = createRateLimiter({ windowMs: RATE_WINDOW_MS, max: RATE_MAX });

  app.use((req, res, next) => {
    if (req.path === "/api/health") return next();
    const key = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    const { allowed, remaining, resetMs } = limiter.check(key);
    res.setHeader("x-ratelimit-remaining", String(remaining));
    if (!allowed) {
      res.setHeader("retry-after", String(Math.ceil(resetMs / 1000)));
      return res.status(429).json({ error: "rate limit excedido", retryAfterMs: resetMs });
    }
    return next();
  });

  // Request middleware: gera requestId, attacha req.log com contexto, loga
  // método/path/status/duração na conclusão, e ecoa o requestId no header
  // de resposta (TrailUp pode armazenar para correlação cross-service).
  app.use((req, res, next) => {
    // Aceita requestId vindo do upstream (TrailUp pode propagar o seu),
    // senão gera um novo. Validamos formato pra não permitir header arbitrário.
    const inbound = req.header("x-request-id");
    req.requestId = inbound && /^[\w.-]{1,128}$/.test(inbound) ? inbound : randomUUID();
    req.log = log.child({ requestId: req.requestId, method: req.method, path: req.path });
    res.setHeader("x-request-id", req.requestId);

    const startedAt = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const fields = { status: res.statusCode, durationMs };
      // 5xx = error, 4xx = warn, restante = info
      if (res.statusCode >= 500)      req.log.error("request done", fields);
      else if (res.statusCode >= 400) req.log.warn("request done",  fields);
      else                            req.log.info("request done",  fields);
    });

    next();
  });

  // Middleware opt-in: só ativo se API_SHARED_SECRET estiver definido.
  // Aplicado apenas em endpoints que disparam custo (Gemini), nunca em /api/health.
  function requireSecret(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!API_SHARED_SECRET) return next();
    const provided = req.header("x-api-secret") ?? req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== API_SHARED_SECRET) {
      return res.status(401).json({ error: "auth obrigatória — header x-api-secret ausente ou inválido" });
    }
    return next();
  }

  if (!API_SHARED_SECRET) {
    log.warn("API_SHARED_SECRET não configurado — endpoints abertos (defina em produção)");
  }

  // ── Health ───────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status:   "ok",
      message:  "TrailUp Alchemy Microservice is online!",
      supabase: isSupabaseConfigured(),
      auth:     Boolean(API_SHARED_SECRET),
    });
  });

  // ── POST /api/v1/archive — Frontend (JSON body) ──────────────────
  //
  // Chamado pelo frontend depois de:
  //   1. processMediaWithGemini (texto + slides)
  //   2. generateNaturalAudio (wav + mp3)
  //
  // Body: { profile, class_name, processed, mp3Base64, wavBase64?,
  //         slideImages? (opcional — se o frontend já os gerou) }
  //
  // O servidor gera imagens dos slides via Gemini (se não foram enviadas),
  // monta o PDF com layout 2-painéis e persiste markdown + mp3 + pdf no Storage.
  app.post("/api/v1/archive", requireSecret, async (req, res) => {
    req.log.info("archive request received");

    try {
      const { profile, class_name, processed, mp3Base64, wavBase64, slideImages: clientImages } = req.body;

      if (!profile || !class_name || !processed) {
        return res.status(400).json({ error: "profile, class_name e processed são obrigatórios." });
      }
      if (!VALID_PROFILES.includes(profile as BrainHexProfile)) {
        return res.status(400).json({ error: "profile inválido." });
      }
      if (!isSupabaseConfigured()) {
        return res.status(503).json({ error: "Supabase não configurado no servidor." });
      }

      const safeClassName = String(class_name).replace(/[^a-z0-9_\-]/gi, "-").toLowerCase();
      const refId         = String(Date.now());
      const storagePath   = `brainhex/${profile}/classe-${safeClassName}`;
      const bucket        = "conteudo_aluno";

      // Imagens dos slides:
      // - Se o frontend enviou (slideImages array de base64), usa diretamente.
      // - Caso contrário, gera server-side usando os imagePrompts dos slides.
      let images: string[];
      if (Array.isArray(clientImages) && clientImages.length > 0) {
        images = clientImages;
      } else {
        req.log.info("gerando imagens dos slides server-side");
        images = await generateSlidesImages(processed.slides || []);
      }

      const slidesComImagens = enrichSlidesWithImages(processed.slides || [], images);

      const result = await archiveToSupabase({
        profile:          profile as BrainHexProfile,
        storagePath,
        bucket,
        refId,
        markdown:         processed.markdown ?? "",
        audioScript:      processed.audioScript ?? "",
        slides:           slidesComImagens,
        mp3Base64:        mp3Base64 ?? null,
        wavBase64:        wavBase64 ?? null,
        personalizacaoId: null,
      });

      return res.json({
        success:     true,
        audioMp3Url: result.audioMp3Url,
        markdownUrl: result.markdownUrl,
        pdfUrl:      result.pdfUrl,
        supabase_paths: {
          markdown:     result.markdownUrl  ? `${storagePath}/markdown/material-${refId}.md`          : null,
          audio:        result.audioMp3Url  ? `${storagePath}/audio/material-${refId}.mp3`           : null,
          apresentacao: result.pdfUrl       ? `${storagePath}/apresentacao/material-${refId}.pdf`    : null,
        },
      });
    } catch (err: any) {
      req.log.error("archive endpoint error", { err });
      return res.status(500).json({ error: err.message || "Falha no arquivamento." });
    }
  });

  // ── POST /api/personalizar — ApiTraiUp (fire-and-forget, 202) ───
  //
  // ApiTraiUp envia URLs brutas de fontes. O servidor baixa os arquivos,
  // processa com Gemini (array) e persiste mídias no Supabase.
  app.post("/api/personalizar", requireSecret, (req, res) => {
    // Validação centralizada — inclui SSRF protection para fontes URLs.
    const v = validatePersonalizarBody(req.body, { allowPrivateFonteUrls: ALLOW_PRIVATE_FONTE_URLS });
    if (v.ok === false) {
      return res.status(400).json({ error: v.error });
    }
    const { profile, personalizacao_id: personalizacaoId, fontes, classe_id, topico_id, ciclo_id } = v.value;

    const classeId    = String(classe_id ?? 0);
    const topicoId    = String(topico_id ?? 0);
    const cicloStr    = String(ciclo_id ?? "");
    const refId       = `${personalizacaoId}_${cicloStr.slice(0, 8)}`;
    const storagePath = `brainhex/${profile}/classe-${classeId}/topico-${topicoId}`;
    const bucket      = "conteudo_aluno";

    // 202 imediato — processa em background
    res.status(202).json({ status: "processing", personalizacao_id: personalizacaoId });

    // Logger por job: herda requestId/method/path do req.log e adiciona
    // contexto do job (personalizacaoId, profile). Permite correlacionar
    // a request 202 com toda a execução async via grep requestId=...
    const jobLog = req.log.child({ personalizacaoId, profile });

    setImmediate(async () => {
      const startedAt = Date.now();
      try {
        jobLog.info("personalizar start", {
          fontes:           fontes.length,
          supabase:         isSupabaseConfigured(),
          timeoutMs:        MAX_JOB_DURATION_MS,
        });

        // Timeout duro — protege contra Gemini/upload travados que rodariam
        // para sempre. Nota: Promise.race não cancela o trabalho de fato (o
        // SDK Gemini não expõe AbortSignal aqui), apenas para de esperar e
        // marca falha. Memória é recuperada quando o processo for reciclado.
        const work = runPersonalizacaoJob({
          profile: profile as BrainHexProfile,
          personalizacaoId,
          fontes:  fontes as FonteItem[],
          storagePath,
          bucket,
          refId,
          log:     jobLog,
        });
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`job timeout após ${MAX_JOB_DURATION_MS}ms`)), MAX_JOB_DURATION_MS).unref()
        );
        await Promise.race([work, timeout]);

        jobLog.info("personalizar concluído", { durationMs: Date.now() - startedAt });
      } catch (err: any) {
        jobLog.error("personalizar erro", { durationMs: Date.now() - startedAt, err });
        await markPersonalizacaoFailed(personalizacaoId, err?.message ?? String(err));
      }
    });
  });

  // 404 default para rotas não-/api/* — este é um microsserviço puramente
  // backend (frontend foi removido, ver commit de cleanup).
  app.use((_req, res) => res.status(404).json({ error: "rota não encontrada" }));

  const server = app.listen(PORT, "0.0.0.0", () => {
    log.info("server up", { port: PORT, supabase: isSupabaseConfigured() });
    if (!isSupabaseConfigured()) {
      log.warn("supabase não configurado (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)");
    }

    // Recovery não-bloqueante de jobs órfãos (processos crashados).
    // Heartbeat (HEARTBEAT_INTERVAL_MS) garante que jobs vivos sempre tenham
    // updated_at fresco; qualquer job sem heartbeat há > STALE_JOB_THRESHOLD_MS
    // é com altíssima probabilidade órfão.
    if (isSupabaseConfigured()) {
      recoverStaleJobs(STALE_JOB_THRESHOLD_MS)
        .then((n) => n > 0 && log.info("jobs órfãos recuperados no startup", { count: n, thresholdMs: STALE_JOB_THRESHOLD_MS }))
        .catch((err) => log.error("erro em recoverStaleJobs", { err }));
    }
  });

  // Sem este handler, erros como EADDRINUSE viram unhandled 'error' event
  // no Server e derrubam o processo com stack trace pouco útil.
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      log.error("porta já em uso — outro processo brainhex rodando?", { port: PORT });
    } else {
      log.error("erro no servidor", { err });
    }
    process.exit(1);
  });

  // Graceful shutdown — para de aceitar requests novos, mas deixa background
  // jobs em setImmediate terminarem (até timeout). Em produção, considere
  // uma fila durável para garantir entrega de personalizações em andamento.
  const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 30_000;
  const shutdown = (signal: string) => {
    log.info("shutdown sinal recebido", { signal });
    server.close((err) => {
      if (err) {
        log.error("erro ao fechar servidor", { err });
        process.exit(1);
      }
      log.info("encerrado");
      process.exit(0);
    });
    setTimeout(() => {
      log.warn("shutdown timeout — forçando saída", { timeoutMs: SHUTDOWN_TIMEOUT_MS });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

startServer().catch((err) => {
  log.error("falha fatal ao iniciar servidor", { err });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection", { reason });
});
