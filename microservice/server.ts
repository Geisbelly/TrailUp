import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { randomUUID } from "crypto";
import {
  processMediaWithGemini,
  generateLongNaturalAudio,
  generateLongConversationalAudio,
  splitProcessedContentIntoParts,
  regenerateChapterContent,
  regenerateSlideContent,
  regenerateDocumentMarkdown,
  resolveAudioPartConcurrency,
  type ContentPart,
} from "./src/services/geminiService";
import { settleWithConcurrency } from "./src/lib/boundedConcurrency";
import type { ApiKeysConfig, SlideContent } from "./src/types";
import { BrainHexProfile, BRAIN_HEX_CONFIG } from "./src/constants/brainHex";
import {
  buildPresentationDesignPlan,
  type PresentationDesignPlan,
  type PresentationThemeInput,
} from "./src/constants/presentationThemes";
import { GUARDIAN_VOICE_PROFILES } from "./src/constants/guardianVoices";
import {
  isSupabaseConfigured,
  uploadBuffer,
  mergePersonalizacaoMateriais,
  saveMateriaisGerados,
  markPersonalizacaoFailed,
  recoverStaleJobs,
  startJobHeartbeat,
  fetchPersonalizacaoMateriais,
  downloadStorageText,
  MaterialEntry,
  type GenerationFence,
  type MaterialPart,
  type PersistedMaterialsMerge,
} from "./src/services/supabaseService";
import { createLogger, type Logger } from "./src/lib/logger";
import { renderAndUploadPresentationViaBrainHexPdf } from "./src/services/brainHexPdfClient";
import { validatePersonalizarBody } from "./src/lib/validators";
import type { ContentBlock } from "./src/lib/validators";
import { createRateLimiter } from "./src/lib/rateLimit";
import { createDedupedTimeoutRunner } from "./src/lib/dedupedTimeoutRunner";
import { createConcurrencyGate } from "./src/lib/concurrencyGate";
import {
  CONTENT_ENRICHMENT_PROVIDER,
  MEDIA_PIPELINE_VERSION,
  PRESENTATION_DESIGN_VERSION,
  PRESENTATION_ENGINE_VERSION,
  PRESENTATION_SCHEMA_VERSION,
  buildPresentationVersionMetadata,
  getRenderGitCommit,
  versionStoragePath,
} from "./src/constants/pipelineVersions";

export {
  CONTENT_ENRICHMENT_PROVIDER,
  MEDIA_PIPELINE_VERSION,
  PRESENTATION_DESIGN_VERSION,
  PRESENTATION_ENGINE_VERSION,
  PRESENTATION_SCHEMA_VERSION,
} from "./src/constants/pipelineVersions";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

// ─── Core: archive to Supabase ────────────────────────────────────────────────

export type PresentationFailureStage = "render" | "upload";

export interface PresentationFailure {
  stage: PresentationFailureStage;
  error: string;
}

export function buildPresentationMaterialMetadata(params: {
  generationKey: string;
  presentationUrl: string | null;
  bucket: string;
  failure: PresentationFailure | null;
  updatedAt?: string;
}): MaterialEntry["metadata"] {
  return {
    status: params.presentationUrl ? "completed" : "failed",
    media_kind: "apresentacao",
    ...buildPresentationVersionMetadata(params.generationKey),
    updated_at: params.updatedAt ?? now(),
    ...(params.presentationUrl ? { bucket: params.bucket } : {}),
    ...(params.failure
      ? {
          error_stage: params.failure.stage,
          error: params.failure.error,
        }
      : {}),
  };
}

export async function archiveToSupabase(params: {
  profile:         BrainHexProfile;
  storagePath:     string;
  bucket:          string;
  refId:           string;
  markdown:        string;
  audioScript:     string;
  presentationTheme: PresentationDesignPlan;
  mp3Base64:       string | null;
  wavBase64:       string | null;
  personalizacaoId: number | null;
  fence?:           GenerationFence;
  log?:            Logger;
}): Promise<{
  audioMp3Url: string | null;
  markdownUrl: string | null;
  presentationUrl: string | null;
  presentationFailure: PresentationFailure | null;
  persisted: PersistedMaterialsMerge | null;
}> {
  const {
    profile,
    storagePath,
    bucket,
    refId,
    markdown,
    audioScript,
    presentationTheme,
    mp3Base64,
    wavBase64,
    personalizacaoId,
    fence,
  } = params;
  const lg = params.log ?? log;
  let persisted: PersistedMaterialsMerge | null = null;

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

  // Apresentacao: gerada pelo BrainHexPDF (deck + HTML), usando o markdown
  // ja sintetizado como conteudo-fonte (mesmo texto que virou material de
  // estudo) e a primeira linha nao vazia do markdown (sem marcadores de
  // heading) como topico.
  const presentationPath = `${storagePath}/apresentacao/material-${refId}.html`;
  const presentationTopic = markdown
    .split("\n")
    .find((l) => l.trim())
    ?.replace(/^#+\s*/, "")
    .trim() ?? "Aula";
  const presentationResult = await renderAndUploadPresentationViaBrainHexPdf({
    markdown,
    topic: presentationTopic,
    profile,
    bucket,
    presentationPath,
  });
  const presentationUrl = presentationResult.presentationUrl;
  if (presentationResult.failure) {
    lg.error("falha na apresentacao", {
      stage: presentationResult.failure.stage,
      error: presentationResult.failure.error,
    });
  } else {
    lg.info("apresentacao upload", { status: "ok" });
  }

  // Persiste metadados no banco (somente quando chamado pelo ApiTraiUp)
  if (personalizacaoId !== null) {
    if (!fence) {
      throw new Error("generation fence ausente para persistir personalizacao");
    }
    const audioStatus  = audioMp3Url  ? "completed" : "failed";
    const mdStatus     = markdownUrl  ? "completed" : "failed";
    // "texto" era um duplicata de roteiro/markdown no payload - ninguem le
    // payload.texto pro audio (mobile so le payload.roteiro) e pro markdown
    // e so um fallback que nunca dispara (payload.markdown sempre vem
    // junto). Payload menor ajuda o merge_personalizacao_materiais_v2 a
    // caber no teto de statement_timeout em topicos com muitos blocos.
    const audioPayloadObj = { roteiro: audioScript };
    const mdPayloadObj    = { markdown };
    // slides fica vazio de proposito: o deck agora e renderizado por inteiro
    // pelo BrainHexPDF (arquivo_url) - nao ha mais slides estruturados
    // equivalentes pra sintetizar aqui, e um array nao-vazio faria o mobile
    // (normalizeRichPresentationSlides) montar um render nativo por engano
    // em vez de abrir o HTML completo. Ver
    // docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md.
    const apresentacaoPayloadObj = {
      slides: [] as never[],
      abertura: markdown.split("\n").find((l) => l.trim()) ?? "",
      tema_visual: presentationTheme,
    };

    const updates: Record<string, MaterialEntry> = {
      audio: {
        payload:      audioPayloadObj,
        metadata:     { status: audioStatus, media_kind: "audio", generation_key: fence.generationKey, updated_at: now(), ...(audioMp3Url ? { bucket } : {}) },
        arquivo_url:  audioMp3Url,
        storage_path: audioMp3Url ? audioPath : null,
        bucket, mime_type: audioMime,
      },
      markdown: {
        payload:      mdPayloadObj,
        metadata:     { status: mdStatus, media_kind: "markdown", generation_key: fence.generationKey, updated_at: now(), ...(markdownUrl ? { bucket } : {}) },
        arquivo_url:  markdownUrl,
        storage_path: markdownUrl ? mdPath : null,
        bucket, mime_type: "text/markdown; charset=utf-8",
      },
      apresentacao: {
        payload:      apresentacaoPayloadObj,
        metadata: buildPresentationMaterialMetadata({
          generationKey: fence.generationKey,
          presentationUrl,
          bucket,
          failure: presentationResult.failure,
        }),
        arquivo_url:  presentationUrl,
        storage_path: presentationUrl ? presentationPath : null,
        ...(presentationUrl ? { bucket, mime_type: "text/html; charset=utf-8" } : {}),
      },
    };

    persisted = await mergePersonalizacaoMateriais(personalizacaoId, updates, fence);

    const historySaved = await saveMateriaisGerados(
      personalizacaoId,
      persisted,
      fence,
      Object.keys(updates),
    );

    if (historySaved) {
      lg.info("materiais persistidos", { generationKey: fence.generationKey });
    } else {
      lg.warn("historico materiais_gerados nao persistido", {
        generationKey: fence.generationKey,
      });
    }
  }

  return {
    audioMp3Url,
    markdownUrl,
    presentationUrl,
    presentationFailure: presentationResult.failure,
    persisted,
  };
}

/**
 * Versao multi-parte de archiveToSupabase, usada pelo pipeline de
 * personalizacao (runPipeline). A sintese continua sendo UMA so (sem
 * duplicar topicos - ver mergeContentBlocksIntoOne), mas a ENTREGA vira N
 * arquivos sequenciais por midia (splitProcessedContentIntoParts), porque
 * um unico arquivo monolitico ja estourou o limite de upload do Supabase
 * Storage numa apresentacao grande. Cada media_kind fica "completed" so se
 * TODAS as suas partes subiram - mesma semantica de tudo-ou-nada de antes,
 * so que agregada entre partes em vez de um arquivo so.
 *
 * O endpoint /api/v1/archive (uso avulso, sem personalizacao) continua na
 * versao single-file (archiveToSupabase) - nao precisa dessa divisao.
 */
export async function archiveMultiPartToSupabase(params: {
  profile:         BrainHexProfile;
  storagePath:     string;
  bucket:          string;
  refId:           string;
  parts:           Array<ContentPart & { mp3Base64: string | null; wavBase64: string | null }>;
  presentationTheme: PresentationDesignPlan;
  personalizacaoId: number | null;
  fence?:           GenerationFence;
  log?:            Logger;
}): Promise<{
  audioMp3Url: string | null;
  markdownUrl: string | null;
  presentationUrl: string | null;
  presentationFailure: PresentationFailure | null;
  persisted: PersistedMaterialsMerge | null;
}> {
  const { profile, storagePath, bucket, refId, parts, presentationTheme, personalizacaoId, fence } = params;
  const lg = params.log ?? log;
  const multiPart = parts.length > 1;

  const audioParts: MaterialPart[] = [];
  const markdownParts: MaterialPart[] = [];
  const presentationParts: MaterialPart[] = [];
  let firstPresentationFailure: PresentationFailure | null = null;
  let anyAudioIsMp3 = false;

  for (const part of parts) {
    const suffix = multiPart ? `-parte-${String(part.ordem).padStart(2, "0")}` : "";

    const audioPayload = part.mp3Base64 ?? part.wavBase64;
    const audioExt = part.mp3Base64 ? "mp3" : "wav";
    const audioMime = part.mp3Base64 ? "audio/mpeg" : "audio/wav";
    if (part.mp3Base64) anyAudioIsMp3 = true;
    const audioPath = `${storagePath}/audio/material-${refId}${suffix}.${audioExt}`;
    let audioUrl: string | null = null;
    if (audioPayload) {
      try {
        const audioBytes = Buffer.from(audioPayload, "base64");
        audioUrl = await uploadBuffer(bucket, audioPath, audioBytes, audioMime);
        lg.info("áudio upload", { status: audioUrl ? "ok" : "falhou", ext: audioExt, parte: part.ordem });
      } catch (e) {
        lg.error("falha no upload de áudio", { err: e, parte: part.ordem });
      }
    }
    audioParts.push({
      ordem: part.ordem,
      titulo: part.titulo,
      arquivo_url: audioUrl,
      storage_path: audioUrl ? audioPath : null,
    });

    const mdPath = `${storagePath}/markdown/material-${refId}${suffix}.md`;
    let mdUrl: string | null = null;
    if (part.markdown) {
      try {
        const mdBytes = Buffer.from(part.markdown, "utf-8");
        mdUrl = await uploadBuffer(bucket, mdPath, mdBytes, "text/markdown; charset=utf-8");
        lg.info("markdown upload", { status: mdUrl ? "ok" : "falhou", parte: part.ordem });
      } catch (e) {
        lg.error("falha no upload de markdown", { err: e, parte: part.ordem });
      }
    }
    markdownParts.push({
      ordem: part.ordem,
      titulo: part.titulo,
      arquivo_url: mdUrl,
      storage_path: mdUrl ? mdPath : null,
    });

    const presentationPath = `${storagePath}/apresentacao/material-${refId}${suffix}.html`;
    const presentationResult = await renderAndUploadPresentationViaBrainHexPdf({
      markdown: part.markdown,
      topic: part.titulo,
      profile,
      bucket,
      presentationPath,
    });
    if (presentationResult.failure) {
      firstPresentationFailure = firstPresentationFailure ?? presentationResult.failure;
      lg.error("falha na apresentacao", {
        stage: presentationResult.failure.stage,
        error: presentationResult.failure.error,
        parte: part.ordem,
      });
    } else {
      lg.info("apresentacao upload", { status: "ok", parte: part.ordem });
    }
    presentationParts.push({
      ordem: part.ordem,
      titulo: part.titulo,
      arquivo_url: presentationResult.presentationUrl,
      storage_path: presentationResult.presentationUrl ? presentationPath : null,
    });
  }

  const audioMp3Url = audioParts[0]?.arquivo_url ?? null;
  const markdownUrl = markdownParts[0]?.arquivo_url ?? null;
  const presentationUrl = presentationParts[0]?.arquivo_url ?? null;
  let persisted: PersistedMaterialsMerge | null = null;

  if (personalizacaoId !== null) {
    if (!fence) {
      throw new Error("generation fence ausente para persistir personalizacao");
    }
    const allAudioOk = audioParts.every((p) => p.arquivo_url !== null);
    const allMdOk = markdownParts.every((p) => p.arquivo_url !== null);
    // So a parte 1 vai inline no payload (evita depender do upload no
    // Storage estar disponivel pra exibir algo de imediato - mesma logica
    // de antes). Concatenar TODAS as partes aqui inflaria de novo o JSONB
    // que quase estourou o timeout do merge; partes 2+ o mobile busca sob
    // demanda pelo arquivo_url de "partes" conforme o aluno navega.
    const firstMarkdown = parts[0]?.markdown ?? "";
    const firstAudioScript = parts[0]?.audioScript ?? "";

    const updates: Record<string, MaterialEntry> = {
      audio: {
        payload: { roteiro: firstAudioScript },
        metadata: {
          status: allAudioOk ? "completed" : "failed",
          media_kind: "audio",
          generation_key: fence.generationKey,
          updated_at: now(),
          ...(audioMp3Url ? { bucket } : {}),
        },
        arquivo_url: audioMp3Url,
        storage_path: audioParts[0]?.storage_path ?? null,
        bucket,
        mime_type: anyAudioIsMp3 ? "audio/mpeg" : "audio/wav",
        partes: audioParts,
      },
      markdown: {
        payload: { markdown: firstMarkdown },
        metadata: {
          status: allMdOk ? "completed" : "failed",
          media_kind: "markdown",
          generation_key: fence.generationKey,
          updated_at: now(),
          ...(markdownUrl ? { bucket } : {}),
        },
        arquivo_url: markdownUrl,
        storage_path: markdownParts[0]?.storage_path ?? null,
        bucket,
        mime_type: "text/markdown; charset=utf-8",
        partes: markdownParts,
      },
      apresentacao: {
        // slides fica vazio de proposito - ver comentario equivalente em
        // archiveToSupabase (mesma razao: evita que o mobile sintetize um
        // render nativo em vez de abrir o HTML completo do BrainHexPDF).
        payload: {
          slides: [] as never[],
          tema_visual: presentationTheme,
        },
        metadata: buildPresentationMaterialMetadata({
          generationKey: fence.generationKey,
          presentationUrl,
          bucket,
          failure: firstPresentationFailure,
        }),
        arquivo_url: presentationUrl,
        storage_path: presentationParts[0]?.storage_path ?? null,
        ...(presentationUrl ? { bucket, mime_type: "text/html; charset=utf-8" } : {}),
        partes: presentationParts,
      },
    };

    persisted = await mergePersonalizacaoMateriais(personalizacaoId, updates, fence);

    const historySaved = await saveMateriaisGerados(
      personalizacaoId,
      persisted,
      fence,
      Object.keys(updates),
    );

    if (historySaved) {
      lg.info("materiais persistidos", { generationKey: fence.generationKey });
    } else {
      lg.warn("historico materiais_gerados nao persistido", {
        generationKey: fence.generationKey,
      });
    }
  }

  return {
    audioMp3Url,
    markdownUrl,
    presentationUrl,
    presentationFailure: firstPresentationFailure,
    persisted,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface FonteItem {
  url:       string;
  mime_type: string;
  tipo:      string;
}

// SSRF: permite fontes apontando para localhost/redes privadas. NUNCA em prod.
const ALLOW_PRIVATE_FONTE_URLS = process.env.ALLOW_PRIVATE_FONTE_URLS === "true";

// Timeout duro para um job de personalização. Default 30min — cobre o pior
// caso de PPTX grande + Gemini lento + a chamada HTTP ao BrainHexPDF (gera o
// deck + renderiza o HTML + sobe no Storage) demorando por parte.
// Configurável via env se um deck muito grande ainda estourar isso.
const MAX_JOB_DURATION_MS  = Number(process.env.MAX_JOB_DURATION_MS)  || 30 * 60 * 1000;
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
  contentBlocks:    ContentBlock[];
  presentationTheme: PresentationThemeInput;
  guidancePrompt?:  string;
  storagePath:      string;
  bucket:           string;
  refId:            string;
  fence:            GenerationFence;
  log:              Logger;
}): Promise<void> {
  const {
    profile,
    personalizacaoId,
    fontes,
    contentBlocks,
    presentationTheme,
    guidancePrompt,
    storagePath,
    bucket,
    refId,
    fence,
    log: jobLog,
  } = params;

  if (!isSupabaseConfigured()) {
    const msg = "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não configurados no servidor";
    jobLog.error(msg);
    throw new Error(msg);
  }

  if (fontes.length === 0 && contentBlocks.length === 0) {
    const msg = "fontes e blocos vazios — nenhum conteúdo enviado para processar";
    jobLog.warn(msg);
    throw new Error(msg);
  }

  // Heartbeat ativo durante todo o pipeline — garante que recoverStaleJobs
  // não vai matar este job por inatividade aparente em updated_at.
  const stopHeartbeat = startJobHeartbeat(
    personalizacaoId,
    HEARTBEAT_INTERVAL_MS,
    fence,
  );

  try {
    await runPipeline(
      personalizacaoId,
      profile,
      fontes,
      contentBlocks,
      presentationTheme,
      storagePath,
      bucket,
      refId,
      fence,
      jobLog,
      guidancePrompt,
    );
  } finally {
    stopHeartbeat();
  }
}

const personalizacaoJobRunnerInternal = createDedupedTimeoutRunner<string, void>();

async function runPersonalizacaoJobWithTimeout(
  params: Parameters<typeof runPersonalizacaoJob>[0],
): Promise<void> {
  const activeKey = `${params.personalizacaoId}:${params.fence.generationKey}`;
  return personalizacaoJobRunnerInternal.run(
    activeKey,
    () => runPersonalizacaoJob(params),
    {
      timeoutMs: MAX_JOB_DURATION_MS,
      onReuse: () => params.log.warn("personalizar reutilizando execucao ainda ativa"),
    },
  );
}

// Verdadeiro quando `entry` esta completed E pertence a mesma generationKey
// da tentativa atual - a mesma checagem ja usada no failedFormats de
// runPipeline, extraida pra decidir SE vale a pena pular a regeneracao via
// Gemini de audio/markdown (ver retryApresentacaoOnly abaixo).
function isMaterialCompletedForGeneration(
  entry: MaterialEntry | null | undefined,
  generationKey: string,
): boolean {
  return entry?.metadata?.status === "completed" && entry?.metadata?.generation_key === generationKey;
}

// Reconstroi as partes de markdown ja persistidas (ver ContentPart) sem
// chamar o Gemini de novo - so o texto e necessario pra retentar a
// apresentacao (renderAndUploadPresentationViaBrainHexPdf so consome
// markdown/topic/profile). A parte 1 vem inline em materiais.markdown.
// payload.markdown (ver archiveMultiPartToSupabase); partes 2+ so existem
// no arquivo .md subido no Storage, entao precisam ser baixadas. Se
// qualquer parte nao puder ser recuperada (bucket/storage_path ausente,
// download falhou), retorna null - o chamador deve cair pra regeneracao
// completa em vez de arriscar uma apresentacao incompleta ou fora de
// ordem.
export async function reconstructMarkdownPartsFromMaterials(
  markdownEntry: MaterialEntry | null | undefined,
  deps: { downloadText?: typeof downloadStorageText } = {},
): Promise<Array<{ ordem: number; titulo: string; markdown: string }> | null> {
  const downloadText = deps.downloadText ?? downloadStorageText;
  const partes = markdownEntry?.partes;
  const bucket = markdownEntry?.bucket;
  if (!Array.isArray(partes) || partes.length === 0 || !bucket) return null;

  const inlineMarkdown =
    typeof markdownEntry?.payload?.markdown === "string" ? (markdownEntry.payload.markdown as string) : null;

  const reconstructed: Array<{ ordem: number; titulo: string; markdown: string }> = [];
  for (const parte of partes) {
    if (!parte.storage_path) return null;
    const text = parte.ordem === 1 && inlineMarkdown ? inlineMarkdown : await downloadText(bucket, parte.storage_path);
    if (!text) return null;
    reconstructed.push({ ordem: parte.ordem, titulo: parte.titulo, markdown: text });
  }
  return reconstructed;
}

// Retenta so a apresentacao (BrainHexPDF), reaproveitando markdown ja
// concluido em vez de regenerar audio+markdown via Gemini de novo - mesmo
// laco de apresentacao de archiveMultiPartToSupabase, mas o merge so toca
// a chave "apresentacao" (audio/markdown persistidos permanecem intactos,
// ja que mergePersonalizacaoMateriais so atualiza as chaves presentes em
// updates). deps permite injetar fakes em teste sem tocar rede/Supabase de
// verdade.
export async function retryApresentacaoOnly(
  params: {
    profile: BrainHexProfile;
    storagePath: string;
    bucket: string;
    refId: string;
    parts: Array<{ ordem: number; titulo: string; markdown: string }>;
    presentationTheme: PresentationDesignPlan;
    personalizacaoId: number;
    fence: GenerationFence;
    log?: Logger;
  },
  deps: {
    renderAndUpload?: typeof renderAndUploadPresentationViaBrainHexPdf;
    mergeMateriais?: typeof mergePersonalizacaoMateriais;
  } = {},
): Promise<{ presentationUrl: string | null; persisted: PersistedMaterialsMerge | null }> {
  const { profile, storagePath, bucket, refId, parts, presentationTheme, personalizacaoId, fence } = params;
  const lg = params.log ?? log;
  const renderAndUpload = deps.renderAndUpload ?? renderAndUploadPresentationViaBrainHexPdf;
  const mergeMateriais = deps.mergeMateriais ?? mergePersonalizacaoMateriais;
  const multiPart = parts.length > 1;

  const presentationParts: MaterialPart[] = [];
  let firstPresentationFailure: PresentationFailure | null = null;

  for (const part of parts) {
    const suffix = multiPart ? `-parte-${String(part.ordem).padStart(2, "0")}` : "";
    const presentationPath = `${storagePath}/apresentacao/material-${refId}${suffix}.html`;
    const presentationResult = await renderAndUpload({
      markdown: part.markdown,
      topic: part.titulo,
      profile,
      bucket,
      presentationPath,
    });
    if (presentationResult.failure) {
      firstPresentationFailure = firstPresentationFailure ?? presentationResult.failure;
      lg.error("falha na apresentacao (retry apresentacao-only)", {
        stage: presentationResult.failure.stage,
        error: presentationResult.failure.error,
        parte: part.ordem,
      });
    } else {
      lg.info("apresentacao upload (retry apresentacao-only)", { status: "ok", parte: part.ordem });
    }
    presentationParts.push({
      ordem: part.ordem,
      titulo: part.titulo,
      arquivo_url: presentationResult.presentationUrl,
      storage_path: presentationResult.presentationUrl ? presentationPath : null,
    });
  }

  const presentationUrl = presentationParts[0]?.arquivo_url ?? null;
  const updates: Record<string, MaterialEntry> = {
    apresentacao: {
      // slides fica vazio de proposito - ver comentario equivalente em
      // archiveMultiPartToSupabase.
      payload: { slides: [] as never[], tema_visual: presentationTheme },
      metadata: buildPresentationMaterialMetadata({
        generationKey: fence.generationKey,
        presentationUrl,
        bucket,
        failure: firstPresentationFailure,
      }),
      arquivo_url: presentationUrl,
      storage_path: presentationParts[0]?.storage_path ?? null,
      ...(presentationUrl ? { bucket, mime_type: "text/html; charset=utf-8" } : {}),
      partes: presentationParts,
    },
  };

  const persisted = await mergeMateriais(personalizacaoId, updates, fence);
  return { presentationUrl, persisted };
}

async function runPipeline(
  personalizacaoId: number,
  profile: BrainHexProfile,
  fontes: FonteItem[],
  contentBlocks: ContentBlock[],
  presentationTheme: PresentationThemeInput,
  storagePath: string,
  bucket: string,
  refId: string,
  fence: GenerationFence,
  jobLog: Logger,
  guidancePrompt?: string,
): Promise<void> {
  const fallbackSubject =
    contentBlocks.find((block) => block.tema.trim())?.tema
    || contentBlocks.find((block) => block.topico.trim())?.topico
    || "Conteúdo de estudo";
  const presentationPlan = buildPresentationDesignPlan(
    profile,
    presentationTheme,
    fallbackSubject,
  );

  // 0. Evita regenerar audio/markdown via Gemini quando ja estao completed
  // pra esta MESMA generationKey e so a apresentacao falhou (ex.: TLS/rede
  // no BrainHexPDF) - producao mostrou audio/markdown sendo regenerados do
  // zero (estourando rate-limit de TTS) so pra tentar de novo uma
  // apresentacao que falha por um motivo nao relacionado ao conteudo. Se a
  // reconstrucao do markdown ja persistido falhar por qualquer motivo, cai
  // pro pipeline completo abaixo (nunca arrisca uma apresentacao
  // incompleta/fora de ordem).
  const existingMateriais = await fetchPersonalizacaoMateriais(personalizacaoId);
  const audioJaCompleto = isMaterialCompletedForGeneration(existingMateriais?.audio, fence.generationKey);
  const markdownJaCompleto = isMaterialCompletedForGeneration(existingMateriais?.markdown, fence.generationKey);
  const apresentacaoJaCompleta = isMaterialCompletedForGeneration(existingMateriais?.apresentacao, fence.generationKey);
  if (audioJaCompleto && markdownJaCompleto && !apresentacaoJaCompleta) {
    const reconstructedParts = await reconstructMarkdownPartsFromMaterials(existingMateriais?.markdown);
    if (reconstructedParts) {
      jobLog.info("apresentacao-only: reaproveitando audio/markdown ja concluidos", {
        generationKey: fence.generationKey,
      });
      const archived = await retryApresentacaoOnly({
        profile,
        storagePath,
        bucket,
        refId,
        parts: reconstructedParts,
        presentationTheme: presentationPlan,
        personalizacaoId,
        fence,
        log: jobLog,
      });
      if (!archived.persisted) {
        throw new Error("merge persistido ausente para a personalizacao");
      }
      const failedFormatsRetry = ["audio", "markdown", "apresentacao"].filter((mediaKind) => {
        const metadata = archived.persisted?.materiais?.[mediaKind]?.metadata;
        return (
          metadata?.status !== "completed"
          || metadata?.generation_key !== fence.generationKey
        );
      });
      if (failedFormatsRetry.length > 0) {
        throw new Error(`midias obrigatorias nao geradas: ${failedFormatsRetry.join(", ")}`);
      }
      if (archived.persisted.status !== "pronto") {
        throw new Error(`status persistido inesperado: ${archived.persisted.status}`);
      }
      return;
    }
    jobLog.warn("apresentacao-only: nao foi possivel reconstruir markdown ja gerado, regenerando tudo", {
      generationKey: fence.generationKey,
    });
  }

  // 1. Download das fontes
  const filesData = await fetchFontesAsFileData(fontes);
  if (filesData.length === 0 && contentBlocks.length === 0) {
    const msg = "todas as fontes falharam no download (verifique as URLs e permissões)";
    jobLog.warn(msg);
    throw new Error(msg);
  }

  // 2. Texto + slides via Gemini (multi-arquivo)
  const resultado = await processMediaWithGemini(
    filesData,
    profile,
    contentBlocks,
    presentationPlan,
    guidancePrompt,
  );

  // 3. Divide o resultado JA sintetizado (uma so vez, sem duplicar topicos -
  // ver mergeContentBlocksIntoOne) em partes entregaveis. Cada parte vira 1
  // chamada ao BrainHexPDF pra gerar a apresentacao daquele trecho - mesmas
  // fronteiras de markdown/audioScript/apresentacao, sem particionamento
  // separado (ver docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md).
  const parts = splitProcessedContentIntoParts({
    markdown: resultado.markdown,
    audioScript: resultado.audioScript,
    slides: resultado.slides,
  });

  const voiceProfile = GUARDIAN_VOICE_PROFILES[profile];
  const voice = voiceProfile.voice;
  const secondaryGuideName = BRAIN_HEX_CONFIG[profile]?.secondaryGuideName;
  const secondaryVoice = voiceProfile.secondaryVoice;
  const generatePartAudio = (audioScript: string) =>
    secondaryGuideName && secondaryVoice
      ? generateLongConversationalAudio(
          audioScript,
          {
            name: BRAIN_HEX_CONFIG[profile].guideName,
            voice,
            direction: voiceProfile.direction,
          },
          {
            name: secondaryGuideName,
            voice: secondaryVoice,
            direction: voiceProfile.secondaryDirection,
          },
        )
      : generateLongNaturalAudio(audioScript, voice, voiceProfile.direction);

  // settleWithConcurrency preserva a regra existente de sucesso parcial (uma
  // parte de audio falhando nao derruba as outras - mesma semantica de
  // Promise.allSettled), mas limita quantas partes geram audio ao mesmo
  // tempo. Disparar todas de uma vez (Promise.allSettled puro, sem teto)
  // estourava RPM do free tier do Gemini (~10 req/min por conta) mesmo com
  // rotacao de chave correta - a rajada em si e o problema, nao so a chave
  // usada. A apresentacao de cada parte e gerada dentro de
  // archiveMultiPartToSupabase (chamada ao BrainHexPDF por parte) - corte
  // seco: falha lá derruba a apresentacao inteira, sem fallback (ver design).
  const audioSettled = await settleWithConcurrency(
    parts,
    resolveAudioPartConcurrency(process.env.CONTENT_GENERATION_AUDIO_PART_CONCURRENCY),
    (part) => generatePartAudio(part.audioScript),
  );

  const audioByPart = audioSettled.map((result, index) => {
    if (result.status === "fulfilled") {
      return { mp3Base64: result.value.mp3 ?? null, wavBase64: result.value.wav ?? null };
    }
    jobLog.error("falha no áudio de uma parte", { parte: index + 1, err: result.reason });
    return { mp3Base64: null, wavBase64: null };
  });

  const partsWithAudio = parts.map((part, index) => ({
    ...part,
    mp3Base64: audioByPart[index]?.mp3Base64 ?? null,
    wavBase64: audioByPart[index]?.wavBase64 ?? null,
  }));

  // 4. Persiste tudo no Supabase (apresentacao gerada via BrainHexPDF por parte)
  const archived = await archiveMultiPartToSupabase({
    profile,
    storagePath,
    bucket,
    refId,
    parts: partsWithAudio,
    presentationTheme: presentationPlan,
    personalizacaoId,
    fence,
    log:              jobLog,
  });
  if (!archived.persisted) {
    throw new Error("merge persistido ausente para a personalizacao");
  }
  const failedFormats = ["audio", "markdown", "apresentacao"].filter((mediaKind) => {
    const metadata = archived.persisted?.materiais?.[mediaKind]?.metadata;
    return (
      metadata?.status !== "completed"
      || metadata?.generation_key !== fence.generationKey
    );
  });
  if (failedFormats.length > 0) {
    throw new Error(`midias obrigatorias nao geradas: ${failedFormats.join(", ")}`);
  }
  if (archived.persisted.status !== "pronto") {
    throw new Error(`status persistido inesperado: ${archived.persisted.status}`);
  }
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

// ─── App factory (exported for testing) ──────────────────────────────────────

export interface AppOptions {
  apiSharedSecret?:      string;
  rateLimitWindowMs?:    number;
  rateLimitMax?:         number;
  jsonLimit?:            string;
  corsOrigin?:           string;
  allowPrivateFonteUrls?: boolean;
  personalizacaoJobRunner?: typeof runPersonalizacaoJobWithTimeout;
  renderGitCommit?:       string | null;
  /**
   * Teto de jobs de /api/personalizar rodando ao mesmo tempo neste processo
   * (varias chamadas concorrentes ao BrainHexPDF por deck, somadas ao
   * processamento de fontes/audio em memoria, ja causaram crash-loop em
   * producao quando varios decks eram gerados juntos). Excesso fica na fila
   * (FIFO) do gate, nao é rejeitado.
   */
  maxConcurrentPersonalizacaoJobs?: number;
  /**
   * Quando true, o 404 catch-all não é registrado aqui — o middleware da SPA
   * (Vite em dev / dist em prod) é montado depois, em startServer (async).
   */
  enableSpa?:            boolean;
}

export function buildApp(opts: AppOptions = {}): express.Application {
  const {
    apiSharedSecret,
    rateLimitWindowMs   = 60_000,
    rateLimitMax        = 30,
    jsonLimit           = "50mb",
    corsOrigin,
    allowPrivateFonteUrls = false,
    personalizacaoJobRunner = runPersonalizacaoJobWithTimeout,
    renderGitCommit = getRenderGitCommit(),
    enableSpa           = false,
    maxConcurrentPersonalizacaoJobs = Number(process.env.PERSONALIZACAO_MAX_CONCURRENT_JOBS) || 2,
  } = opts;

  const personalizacaoJobGate = createConcurrencyGate(maxConcurrentPersonalizacaoJobs);

  const corsOpts = corsOrigin
    ? { origin: corsOrigin.split(",").map((o) => o.trim()) }
    : undefined; // sem env → libera tudo (compat)
  const app = express();
  app.use(cors(corsOpts));
  app.use(express.json({ limit: jsonLimit }));

  // Rate limit por IP (sliding window in-process). Aplicado a TUDO exceto
  // /api/health (usado por probes que podem exceder). Protege contra
  // TrailUp comprometido / bug de loop bombardeando Gemini ($$$).
  const limiter = createRateLimiter({ windowMs: rateLimitWindowMs, max: rateLimitMax });

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

  // Middleware opt-in: só ativo se apiSharedSecret estiver definido.
  // Aplicado apenas em endpoints que disparam custo (Gemini), nunca em /api/health.
  function requireSecret(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!apiSharedSecret) return next();
    const provided = req.header("x-api-secret") ?? req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== apiSharedSecret) {
      return res.status(401).json({ error: "auth obrigatória — header x-api-secret ausente ou inválido" });
    }
    return next();
  }

  // ── Health ───────────────────────────────────────────────────────
  app.get("/api/health", async (req, res) => {
    res.status(200).json({
      status:   "ok",
      message:  "TrailUp Alchemy Microservice is online!",
      supabase: isSupabaseConfigured(),
      auth:     Boolean(apiSharedSecret),
      media_pipeline_version: MEDIA_PIPELINE_VERSION,
      presentation_engine_version: PRESENTATION_ENGINE_VERSION,
      presentation_schema: PRESENTATION_SCHEMA_VERSION,
      presentation_design_version: PRESENTATION_DESIGN_VERSION,
      content_enrichment_provider: CONTENT_ENRICHMENT_PROVIDER,
      render_git_commit: renderGitCommit,
    });
  });

  // ── POST /api/v1/regenerate/* — regeneração com prompt de melhoria ──
  //
  // Usados pelo console do professor para corrigir/expandir um material já
  // gerado (capítulo, slide ou documento completo) a partir de um prompt de
  // melhoria livre, opcionalmente combinado com uma diretriz de expansão
  // geral (expansion_prompt). keys_config permite usar chaves proprias da
  // chamada em vez das variaveis de ambiente do servidor.
  function parseKeysConfig(raw: unknown): ApiKeysConfig | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const obj = raw as Record<string, unknown>;
    const geminiKeys = Array.isArray(obj.geminiKeys)
      ? obj.geminiKeys.filter((k): k is string => typeof k === "string")
      : undefined;
    const openAIKey = typeof obj.openAIKey === "string" ? obj.openAIKey : undefined;
    if (!geminiKeys && !openAIKey) return undefined;
    return { geminiKeys, openAIKey };
  }

  app.post("/api/v1/regenerate/chapter", requireSecret, async (req, res) => {
    try {
      const { chapter, improvement_prompt: improvementPrompt, profile, expansion_prompt: expansionPrompt, keys_config } = req.body ?? {};
      if (!chapter || typeof chapter.markdown !== "string" || typeof chapter.audioScript !== "string") {
        return res.status(400).json({ error: "chapter.markdown e chapter.audioScript são obrigatórios" });
      }
      if (typeof improvementPrompt !== "string" || !improvementPrompt.trim()) {
        return res.status(400).json({ error: "improvement_prompt é obrigatório" });
      }
      if (typeof profile !== "string") {
        return res.status(400).json({ error: "profile é obrigatório" });
      }
      const result = await regenerateChapterContent(
        { markdown: chapter.markdown, audioScript: chapter.audioScript },
        improvementPrompt,
        profile as BrainHexProfile,
        { expansionPrompt, keysConfig: parseKeysConfig(keys_config) },
      );
      res.json(result);
    } catch (error: any) {
      req.log.error("regenerate chapter erro", { err: error });
      res.status(500).json({ error: error?.message || "Falha ao regenerar capítulo" });
    }
  });

  app.post("/api/v1/regenerate/slide", requireSecret, async (req, res) => {
    try {
      const { slide, improvement_prompt: improvementPrompt, profile, expansion_prompt: expansionPrompt, keys_config } = req.body ?? {};
      if (!slide || typeof slide !== "object") {
        return res.status(400).json({ error: "slide é obrigatório" });
      }
      if (typeof improvementPrompt !== "string" || !improvementPrompt.trim()) {
        return res.status(400).json({ error: "improvement_prompt é obrigatório" });
      }
      if (typeof profile !== "string") {
        return res.status(400).json({ error: "profile é obrigatório" });
      }
      const result = await regenerateSlideContent(
        slide as SlideContent,
        improvementPrompt,
        profile as BrainHexProfile,
        { expansionPrompt, keysConfig: parseKeysConfig(keys_config) },
      );
      res.json(result);
    } catch (error: any) {
      req.log.error("regenerate slide erro", { err: error });
      res.status(500).json({ error: error?.message || "Falha ao regenerar slide" });
    }
  });

  app.post("/api/v1/regenerate/document", requireSecret, async (req, res) => {
    try {
      const { markdown, improvement_prompt: improvementPrompt, profile, expansion_prompt: expansionPrompt, keys_config } = req.body ?? {};
      if (typeof markdown !== "string" || !markdown.trim()) {
        return res.status(400).json({ error: "markdown é obrigatório" });
      }
      if (typeof improvementPrompt !== "string" || !improvementPrompt.trim()) {
        return res.status(400).json({ error: "improvement_prompt é obrigatório" });
      }
      if (typeof profile !== "string") {
        return res.status(400).json({ error: "profile é obrigatório" });
      }
      const result = await regenerateDocumentMarkdown(
        markdown,
        improvementPrompt,
        profile as BrainHexProfile,
        { expansionPrompt, keysConfig: parseKeysConfig(keys_config) },
      );
      res.json(result);
    } catch (error: any) {
      req.log.error("regenerate document erro", { err: error });
      res.status(500).json({ error: error?.message || "Falha ao regenerar documento" });
    }
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
  // monta o HTML da apresentação e persiste markdown + mp3 + apresentação no Storage.
  app.post("/api/v1/archive", requireSecret, async (req, res) => {
    req.log.info("archive request received");

    try {
      const {
        profile,
        class_name,
        processed,
        mp3Base64,
        wavBase64,
        presentation_theme: requestedPresentationTheme,
      } = req.body;

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
      const presentationPlan = buildPresentationDesignPlan(
        profile as BrainHexProfile,
        requestedPresentationTheme
          ?? processed.presentation_theme
          ?? {},
        processed.slides?.[0]?.title
          ?? processed.slides?.[0]?.titulo
          ?? class_name,
      );

      const result = await archiveToSupabase({
        profile:          profile as BrainHexProfile,
        storagePath,
        bucket,
        refId,
        markdown:         processed.markdown ?? "",
        audioScript:      processed.audioScript ?? "",
        presentationTheme: presentationPlan,
        mp3Base64:        mp3Base64 ?? null,
        wavBase64:        wavBase64 ?? null,
        personalizacaoId: null,
      });

      if (result.presentationFailure) {
        return res.status(502).json({
          success: false,
          error: result.presentationFailure.error,
          error_stage: result.presentationFailure.stage,
          audioMp3Url: result.audioMp3Url,
          markdownUrl: result.markdownUrl,
          presentationUrl: null,
        });
      }

      return res.json({
        success:     true,
        audioMp3Url: result.audioMp3Url,
        markdownUrl: result.markdownUrl,
        presentationUrl: result.presentationUrl,
        supabase_paths: {
          markdown:     result.markdownUrl      ? `${storagePath}/markdown/material-${refId}.md`      : null,
          audio:        result.audioMp3Url      ? `${storagePath}/audio/material-${refId}.mp3`        : null,
          apresentacao: result.presentationUrl  ? `${storagePath}/apresentacao/material-${refId}.html` : null,
        },
      });
    } catch (err: any) {
      req.log.error("archive endpoint error", { err });
      return res.status(500).json({ error: err.message || "Falha no arquivamento." });
    }
  });

  // ── POST /api/personalizar — ApiTraiUp ─────────────────────────
  //
  // ApiTraiUp envia URLs brutas de fontes. O servidor baixa os arquivos,
  // processa com Gemini (array) e persiste mídias no Supabase.
  app.post("/api/personalizar", requireSecret, async (req, res) => {
    // Validação centralizada — inclui SSRF protection para fontes URLs.
    const v = validatePersonalizarBody(req.body, { allowPrivateFonteUrls });
    if (v.ok === false) {
      return res.status(400).json({ error: v.error });
    }
    const {
      profile,
      personalizacao_id: personalizacaoId,
      fontes,
      content_blocks: contentBlocks,
      classe_id,
      topico_id,
      conteudo_id,
      ciclo_id,
      source_hash,
      generation_key,
      required_media_pipeline_version: requiredMediaPipelineVersion,
      required_presentation_engine_version: requiredPresentationEngineVersion,
      required_presentation_design_version: requiredPresentationDesignVersion,
      presentation_theme: presentationTheme,
      wait_for_completion: waitForCompletion,
      guidance_prompt: guidancePrompt,
    } = v.value;

    const incompatibleVersions: Array<{
      component:
        | "media_pipeline"
        | "presentation_engine"
        | "presentation_design";
      required: string;
      actual: string;
    }> = [];
    if (
      requiredMediaPipelineVersion
      && requiredMediaPipelineVersion !== MEDIA_PIPELINE_VERSION
    ) {
      incompatibleVersions.push({
        component: "media_pipeline",
        required: requiredMediaPipelineVersion,
        actual: MEDIA_PIPELINE_VERSION,
      });
    }
    if (
      requiredPresentationEngineVersion
      && requiredPresentationEngineVersion !== PRESENTATION_ENGINE_VERSION
    ) {
      incompatibleVersions.push({
        component: "presentation_engine",
        required: requiredPresentationEngineVersion,
        actual: PRESENTATION_ENGINE_VERSION,
      });
    }
    if (
      requiredPresentationDesignVersion
      && requiredPresentationDesignVersion !== PRESENTATION_DESIGN_VERSION
    ) {
      incompatibleVersions.push({
        component: "presentation_design",
        required: requiredPresentationDesignVersion,
        actual: PRESENTATION_DESIGN_VERSION,
      });
    }
    if (incompatibleVersions.length > 0) {
      return res.status(409).json({
        status: "incompatible_version",
        error: "versao requerida incompativel com o pipeline implantado",
        incompatible_versions: incompatibleVersions,
        media_pipeline_version: MEDIA_PIPELINE_VERSION,
        presentation_engine_version: PRESENTATION_ENGINE_VERSION,
        presentation_design_version: PRESENTATION_DESIGN_VERSION,
      });
    }

    const classeId    = String(classe_id ?? 0);
    const topicoId    = String(topico_id ?? 0);
    const conteudoId  = conteudo_id === undefined ? null : String(conteudo_id);
    const cicloStr    = String(ciclo_id ?? "").trim();
    const sourceHash  = String(source_hash ?? "").trim();
    const generationKey = String(generation_key ?? "").trim();
    if (!cicloStr || !sourceHash || !generationKey) {
      return res.status(409).json({
        error: "ciclo_id, source_hash e generation_key sao obrigatorios para gerar midias",
      });
    }
    if (generationKey !== `${cicloStr}:${sourceHash}`) {
      return res.status(400).json({
        error: "generation_key inconsistente com ciclo_id/source_hash",
      });
    }
    const fence: GenerationFence = {
      cicloId: cicloStr,
      sourceHash,
      generationKey,
    };
    const refId       = `${personalizacaoId}_${cicloStr.slice(0, 8)}`;
    const contentStorageSegment = conteudoId ? `/conteudo-${conteudoId}` : "";
    const storagePath = versionStoragePath(
      `brainhex/${profile}/classe-${classeId}/topico-${topicoId}${contentStorageSegment}`,
      generationKey,
    );
    const bucket      = "conteudo_aluno";

    // No modo confiavel a conexao fica aberta ate a persistencia terminar.
    // Isso evita que a hospedagem suspenda o processo no meio do background.
    const jobLog = req.log.child({ personalizacaoId, profile });

    const executeJob = async () => {
      const startedAt = Date.now();
      try {
        jobLog.info("personalizar start", {
          fontes:           fontes.length,
          contentBlocks:    contentBlocks.length,
          supabase:         isSupabaseConfigured(),
          timeoutMs:        MAX_JOB_DURATION_MS,
          generationKey,
        });

        // Timeout duro — protege contra Gemini/upload travados que rodariam
        // para sempre. Nota: Promise.race não cancela o trabalho de fato (o
        // SDK Gemini não expõe AbortSignal aqui), apenas para de esperar e
        // marca falha. Memória é recuperada quando o processo for reciclado.
        await personalizacaoJobRunner({
          profile: profile as BrainHexProfile,
          personalizacaoId,
          fontes:  fontes as FonteItem[],
          contentBlocks,
          presentationTheme,
          guidancePrompt,
          storagePath,
          bucket,
          refId,
          fence,
          log:     jobLog,
        });
        jobLog.info("personalizar concluído", { durationMs: Date.now() - startedAt });
      } catch (err: any) {
        jobLog.error("personalizar erro", { durationMs: Date.now() - startedAt, err });
        await markPersonalizacaoFailed(
          personalizacaoId,
          err?.message ?? String(err),
          fence,
        );
        throw err;
      }
    };

    if (waitForCompletion) {
      try {
        await personalizacaoJobGate.run(executeJob);
        return res.status(200).json({
          status: "completed",
          personalizacao_id: personalizacaoId,
          media_pipeline_version: MEDIA_PIPELINE_VERSION,
          presentation_engine_version: PRESENTATION_ENGINE_VERSION,
          presentation_design_version: PRESENTATION_DESIGN_VERSION,
          content_enrichment_provider: CONTENT_ENRICHMENT_PROVIDER,
        });
      } catch (err: any) {
        return res.status(500).json({
          status: "failed",
          personalizacao_id: personalizacaoId,
          error: err?.message ?? String(err),
        });
      }
    }

    res.status(202).json({
      status: "processing",
      personalizacao_id: personalizacaoId,
      media_pipeline_version: MEDIA_PIPELINE_VERSION,
      presentation_engine_version: PRESENTATION_ENGINE_VERSION,
      presentation_design_version: PRESENTATION_DESIGN_VERSION,
      content_enrichment_provider: CONTENT_ENRICHMENT_PROVIDER,
    });
    setImmediate(() => {
      void personalizacaoJobGate.run(executeJob).catch(() => undefined);
    });
  });

  // 404 default para rotas não-/api/* — registrado só quando a SPA não está
  // montada. Com enableSpa, o catch-all é o middleware da SPA (ver startServer).
  if (!enableSpa) {
    app.use((_req, res) => res.status(404).json({ error: "rota não encontrada" }));
  }

  return app;
}

// ─── Server entrypoint ────────────────────────────────────────────────────────

async function startServer() {
  const PORT              = Number(process.env.PORT) || 3000;
  const API_SHARED_SECRET = process.env.API_SHARED_SECRET;

  // SPA de demonstração (BrainHex) embutida no mesmo processo. Liga por padrão;
  // desligue com API_ONLY=true para boot rápido só com endpoints /api/*.
  const ENABLE_SPA = process.env.API_ONLY !== "true";

  const app = buildApp({
    apiSharedSecret:       API_SHARED_SECRET,
    rateLimitWindowMs:     Number(process.env.RATE_WINDOW_MS) || 60_000,
    rateLimitMax:          Number(process.env.RATE_MAX)       || 30,
    jsonLimit:             process.env.JSON_LIMIT ?? "50mb",
    corsOrigin:            process.env.CORS_ORIGIN,
    allowPrivateFonteUrls: ALLOW_PRIVATE_FONTE_URLS,
    enableSpa:             ENABLE_SPA,
  });

  // ── SPA (Vite em dev / dist estático em prod) ──────────────────────────────
  if (ENABLE_SPA) {
    if (process.env.NODE_ENV !== "production") {
      const viteModule = await import("vite");
      const vite = await viteModule.createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      log.info("SPA de demo montada (Vite middleware) — desative com API_ONLY=true");
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
      log.info("SPA de demo servida de dist/", { distPath });
    }
  }

  if (!API_SHARED_SECRET) {
    if (process.env.NODE_ENV === "production") {
      log.error("API_SHARED_SECRET é obrigatório em produção — defina a variável de ambiente e reinicie");
      process.exit(1);
    }
    log.warn("API_SHARED_SECRET não configurado — endpoints abertos (defina em produção)");
  }

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

// Guard: auto-inicia apenas quando executado diretamente (não importado em testes)
if (require.main === module) {
  startServer().catch((err) => {
    log.error("falha fatal ao iniciar servidor", { err });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    log.error("unhandledRejection", { reason });
  });
}
