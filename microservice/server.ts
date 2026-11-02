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
  restyleImageWithGemini,
  generateAudioScriptsWithGemini,
  type ContentPart,
} from "./src/services/geminiService";
import {
  audioSegmentsFromChapters,
  joinAudioBlocks,
  resolveAudioJunctionConfig,
} from "./src/utils/audioJunction";
import {
  audioFailedOnlyForQuota,
  audioPlanFromJunction,
  buildAudioCheckpointEntry,
  buildAudioMaterialEntry,
  buildMarkdownMaterialEntry,
  imageUrlsFromMarkdown,
  planMediaResume,
  reusablePresentationPartes,
  SEM_COTA_TTS_MARKER,
  type AudioPartPlan,
  type PresentationVersions,
} from "./src/services/mediaResume";
import { settleWithConcurrency } from "./src/lib/boundedConcurrency";
import {
  deriveImagesForMedia,
  extractAttachmentsFromMarkdown,
  insertImagesIntoMarkdown,
  selectAttachmentsForMarkdown,
} from "./src/utils/markdownImages";
import { replaceAsciiDiagramsWithSvg } from "./src/utils/asciiDiagram";
import { describeError, summarizeAudioFailures, type AudioPartFailure } from "./src/utils/audioFailure";
import {
  resolveAudioSecondRoundConfig,
  retryFailedAudioParts,
  type AudioSecondRoundConfig,
  type AudioSecondRoundOutcome,
} from "./src/utils/audioSecondRound";
import { applyProfileRestyle } from "./src/utils/profileImageRestyle";
import { estimateAudioDurationSec } from "./src/utils/audioDuration";
import { computeImageCues, type ImageCue } from "./src/utils/audioImageCues";
import { computeAggregatedApresentacaoEntry } from "./src/lib/materialsMerge";
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
import {
  renderAndUploadPresentationViaBrainHexPdf,
  type RenderAndUploadPresentationResult,
  type PresentationRenderStage,
} from "./src/services/brainHexPdfClient";
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
  getBuildCommit,
} from "./src/constants/pipelineVersions";
import { versionStoragePath } from "./src/constants/generationStorage";

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

export type PresentationFailureStage = PresentationRenderStage;

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
  // Override pro caso multi-parte: o status agregado (computeAggregatedApresentacaoEntry)
  // pode ser "failed" mesmo com presentationUrl != null (o headline e a
  // parte 1, que pode ter tido sucesso enquanto outra parte falhou) - sem
  // isso, o status ficaria "completed" so por causa da parte 1.
  status?: string;
}): MaterialEntry["metadata"] {
  return {
    status: params.status ?? (params.presentationUrl ? "completed" : "failed"),
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

  if (personalizacaoId !== null && !fence) {
    throw new Error("generation fence ausente para persistir personalizacao");
  }

  // Sem personalizacaoId (ex.: preview via /api/v1/archive), o BrainHexPDF
  // ainda gera e sobe o deck normalmente - so nao recebe dados de fencing,
  // entao nao tem como gravar no banco (dbWritten fica false, o caller
  // abaixo trata como se sempre precisasse do fallback, que so roda dentro
  // do "if (personalizacaoId !== null)" mesmo assim).
  const presentationResult = await renderAndUploadPresentationViaBrainHexPdf({
    markdown,
    topic: presentationTopic,
    profile,
    bucket,
    presentationPath,
    ...(personalizacaoId !== null && fence
      ? {
          personalizacaoId,
          fence,
          versionMetadata: {
            engine: PRESENTATION_ENGINE_VERSION,
            schema: PRESENTATION_SCHEMA_VERSION,
            design_system: PRESENTATION_DESIGN_VERSION,
            media_pipeline_version: MEDIA_PIPELINE_VERSION,
          },
          ordem: 1,
          totalPartes: 1,
          titulo: presentationTopic,
        }
      : {}),
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
      // apresentacao SO entra aqui quando o BrainHexPDF nao conseguiu gravar
      // ele mesmo (dbWritten:false - falha de transporte) - no caminho
      // feliz, quem grava essa chave e o proprio BrainHexPDF via
      // persistApresentacaoResult (ver
      // docs/superpowers/specs/2026-08-16-brainhexpdf-direct-db-write-design.md).
      ...(presentationResult.dbWritten
        ? {}
        : {
            apresentacao: {
              payload: apresentacaoPayloadObj,
              metadata: buildPresentationMaterialMetadata({
                generationKey: fence.generationKey,
                presentationUrl,
                bucket,
                failure: presentationResult.failure,
              }),
              arquivo_url: presentationUrl,
              storage_path: presentationUrl ? presentationPath : null,
              ...(presentationUrl ? { bucket, mime_type: "text/html; charset=utf-8" } : {}),
            },
          }),
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
 * Dispara a geracao de audio (por parte) e o render+upload da apresentacao
 * via BrainHexPDF (por parte) CONCORRENTEMENTE entre si e entre partes.
 * Antes, o pipeline esperava todo o audio terminar antes de comecar a
 * chamar o BrainHexPDF, e ainda chamava uma parte por vez em serie dentro
 * de archiveMultiPartToSupabase - para decks com varias partes, isso somava
 * o tempo de audio + N chamadas de rede sequenciais (timeout de ate 120s
 * cada). Aqui as duas frentes (audio de todas as partes, apresentacao de
 * todas as partes) comecam juntas; renderPresentation nunca rejeita (ver
 * renderAndUploadPresentationViaBrainHexPdf), so retorna failure no result.
 */
export async function runAudioAndPresentationInParallel<
  TAudio,
  TPart extends { ordem: number } = ContentPart,
>(
  parts: TPart[],
  deps: {
    generateAudio: (audioScript: string) => Promise<TAudio>;
    renderPresentation: (part: TPart) => Promise<RenderAndUploadPresentationResult>;
    // Partes de audio, quando nao sao as mesmas da apresentacao: a etapa de
    // juncao (audioJunction.ts) agrupa o roteiro por tamanho de TTS, nao pelo
    // tamanho do texto, e a retomada sintetiza so as que faltam (#652).
    // Ausente = o audio de cada parte de `parts`.
    audioParts?: Array<{ audioScript: string }>;
    // Teto de quantas partes geram audio ao mesmo tempo - disparar todas de
    // uma vez estourava RPM do free tier do Gemini (~10 req/min por conta)
    // mesmo com rotacao de chave correta. settleWithConcurrency preserva a
    // mesma semantica de sucesso parcial do Promise.allSettled que isto
    // usava antes (uma parte falhando nao derruba as outras), so limitando
    // quantas rodam ao mesmo tempo. A apresentacao continua sem teto - o
    // gargalo de rate limit e so no Gemini TTS.
    audioConcurrency: number;
    // Segunda rodada so nas partes de audio que falharam (#777) - ver
    // audioSecondRound.ts. Ausente = sem segunda rodada. Roda dentro da
    // frente do audio, entao a apresentacao continua em paralelo.
    audioSecondRound?: AudioSecondRoundConfig;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<{
  audioSettled: PromiseSettledResult<TAudio>[];
  audioSecondRound: AudioSecondRoundOutcome;
  presentationResults: RenderAndUploadPresentationResult[];
}> {
  const audioParts = deps.audioParts
    ?? parts.map((part) => ({ audioScript: String((part as { audioScript?: unknown }).audioScript ?? "") }));
  const generatePart = (part: { audioScript: string }) => deps.generateAudio(part.audioScript);
  const [audio, presentationResults] = await Promise.all([
    settleWithConcurrency(audioParts, deps.audioConcurrency, generatePart).then((settled) =>
      deps.audioSecondRound
        ? retryFailedAudioParts({
            parts: audioParts,
            settled,
            generate: generatePart,
            config: deps.audioSecondRound,
            sleep: deps.sleep,
          })
        : { settled, outcome: { status: "not_needed" } as AudioSecondRoundOutcome },
    ),
    Promise.all(parts.map((part) => deps.renderPresentation(part))),
  ]);
  return { audioSettled: audio.settled, audioSecondRound: audio.outcome, presentationResults };
}

/**
 * Versao multi-parte de archiveToSupabase. Desde a #652 o runPipeline NAO usa
 * mais esta funcao: ele grava texto e roteiro antes do TTS (checkpoint) e
 * retoma so o que falta (mediaResume.ts). Fica exportada e testada ate alguem
 * decidir remove-la. A sintese continua sendo UMA so (sem
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
  storagePath:     string;
  bucket:          string;
  refId:           string;
  parts:           Array<ContentPart & { mp3Base64: string | null; wavBase64: string | null }>;
  // Ja resolvidos ANTES de chamar esta funcao (ver runAudioAndPresentationInParallel)
  // - concorrente com a geracao de audio, nao mais chamado aqui em serie.
  // Alinhado 1:1 por indice com `parts`.
  presentationResults: RenderAndUploadPresentationResult[];
  presentationTheme: PresentationDesignPlan;
  personalizacaoId: number | null;
  fence?:           GenerationFence;
  audioCoverImageUrl?: string;
  audioImageCues?: ImageCue[];
  /** Falhas de sintese por parte, vindas de quem gerou o audio - sem isso o
   * material fica "failed" sem motivo nenhum e o professor ve so "Falhou". */
  audioFailures?:  AudioPartFailure[];
  log?:            Logger;
}): Promise<{
  audioMp3Url: string | null;
  markdownUrl: string | null;
  presentationUrl: string | null;
  presentationFailure: PresentationFailure | null;
  persisted: PersistedMaterialsMerge | null;
}> {
  const { storagePath, bucket, refId, parts, presentationResults, presentationTheme, personalizacaoId, fence, audioCoverImageUrl, audioImageCues } = params;
  const falhasDeAudio: AudioPartFailure[] = [...(params.audioFailures ?? [])];
  const lg = params.log ?? log;
  const multiPart = parts.length > 1;

  if (personalizacaoId !== null && !fence) {
    throw new Error("generation fence ausente para persistir personalizacao");
  }

  const audioParts: MaterialPart[] = [];
  const markdownParts: MaterialPart[] = [];
  const presentationParts: MaterialPart[] = [];
  let firstPresentationFailure: PresentationFailure | null = null;
  let anyPresentationFallbackNeeded = false;
  let anyAudioIsMp3 = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
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
        falhasDeAudio.push({ ordem: part.ordem, motivo: `upload: ${describeError(e)}` });
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
    // Ja resolvido ANTES de chamar esta funcao (concorrente com a geracao de
    // audio - ver runAudioAndPresentationInParallel/runPipeline), incluindo
    // o fencing pro BrainHexPDF gravar direto no banco quando aplicavel.
    const presentationResult = presentationResults[i];
    if (!presentationResult.dbWritten) {
      anyPresentationFallbackNeeded = true;
    }
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
      failed: presentationResult.presentationUrl === null,
      ...(presentationResult.presentationUrl === null && presentationResult.failure
        ? { failure: presentationResult.failure }
        : {}),
    });
  }

  const audioMp3Url = audioParts[0]?.arquivo_url ?? null;
  const markdownUrl = markdownParts[0]?.arquivo_url ?? null;
  const presentationUrl = presentationParts[0]?.arquivo_url ?? null;
  let persisted: PersistedMaterialsMerge | null = null;

  if (personalizacaoId !== null) {
    // fence garantido pela checagem no topo da funcao (antes do loop) - o
    // TS nao ve essa relacao entre variaveis, entao asserta aqui.
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
        payload: {
          roteiro: firstAudioScript,
          ...(audioCoverImageUrl ? { capaUrl: audioCoverImageUrl } : {}),
          ...(audioImageCues && audioImageCues.length > 0 ? { imageCues: audioImageCues } : {}),
        },
        metadata: {
          status: allAudioOk ? "completed" : "failed",
          media_kind: "audio",
          generation_key: fence.generationKey,
          updated_at: now(),
          // A API le failure_reason e mostra no card do formato
          // (_material_error). Sem isso, "Falhou" nao dizia se foi cota,
          // modelo indisponivel ou bug.
          ...(allAudioOk ? {} : { failure_reason: summarizeAudioFailures(falhasDeAudio, parts.length) }),
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
      // apresentacao SO entra aqui quando pelo menos 1 parte precisou do
      // fallback (o BrainHexPDF nao conseguiu gravar ele mesmo - falha de
      // transporte) - no caminho feliz, quem grava essa chave e o proprio
      // BrainHexPDF via persistApresentacaoResult, parte a parte. Ver
      // docs/superpowers/specs/2026-08-16-brainhexpdf-direct-db-write-design.md.
      ...(anyPresentationFallbackNeeded
        ? {
            apresentacao: (() => {
              let aggregated: { partes: MaterialPart[]; status: string; headline: { arquivo_url: string | null; storage_path: string | null } } = {
                partes: [],
                status: "pending",
                headline: { arquivo_url: null, storage_path: null },
              };
              for (const p of presentationParts) {
                aggregated = computeAggregatedApresentacaoEntry(aggregated.partes, p, parts.length, aggregated.status);
              }
              // slides fica vazio de proposito - ver comentario equivalente
              // em archiveToSupabase (mesma razao: evita que o mobile
              // sintetize um render nativo em vez de abrir o HTML completo
              // do BrainHexPDF).
              return {
                payload: {
                  slides: [] as never[],
                  tema_visual: presentationTheme,
                },
                metadata: buildPresentationMaterialMetadata({
                  generationKey: fence.generationKey,
                  presentationUrl: aggregated.headline.arquivo_url,
                  bucket,
                  failure: firstPresentationFailure,
                  status: aggregated.status,
                }),
                arquivo_url: aggregated.headline.arquivo_url,
                storage_path: aggregated.headline.storage_path,
                ...(aggregated.headline.arquivo_url ? { bucket, mime_type: "text/html; charset=utf-8" } : {}),
                partes: aggregated.partes,
              };
            })(),
          }
        : {}),
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

// Desde a #652 o runPipeline retoma a apresentacao por conta propria (so as
// partes que faltam, em paralelo com o audio) e nao chama mais esta funcao.
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
  let anyPresentationFallbackNeeded = false;

  for (const part of parts) {
    const suffix = multiPart ? `-parte-${String(part.ordem).padStart(2, "0")}` : "";
    const presentationPath = `${storagePath}/apresentacao/material-${refId}${suffix}.html`;
    const presentationResult = await renderAndUpload({
      markdown: part.markdown,
      topic: part.titulo,
      profile,
      bucket,
      presentationPath,
      // Recupera as imagens do professor do proprio markdown persistido: esta
      // retentativa nao passa por fetchFontesAsFileData, entao sem isso o
      // deck refeito ia sem attachment nenhum e perdia todas as imagens do
      // material base (caia no fallback de IA/SVG mesmo tendo imagem).
      attachments: extractAttachmentsFromMarkdown(part.markdown),
      personalizacaoId,
      fence,
      versionMetadata: {
        engine: PRESENTATION_ENGINE_VERSION,
        schema: PRESENTATION_SCHEMA_VERSION,
        design_system: PRESENTATION_DESIGN_VERSION,
        media_pipeline_version: MEDIA_PIPELINE_VERSION,
      },
      ordem: part.ordem,
      totalPartes: parts.length,
      titulo: part.titulo,
    });
    if (!presentationResult.dbWritten) {
      anyPresentationFallbackNeeded = true;
    }
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
      failed: presentationResult.presentationUrl === null,
      ...(presentationResult.presentationUrl === null && presentationResult.failure
        ? { failure: presentationResult.failure }
        : {}),
    });
  }

  const presentationUrl = presentationParts[0]?.arquivo_url ?? null;

  // O BrainHexPDF ja gravou ele mesmo, parte a parte (persistApresentacaoResult)
  // - nada a fazer aqui. So cai no fallback quando alguma parte nao
  // conseguiu (falha de transporte).
  if (!anyPresentationFallbackNeeded) {
    return { presentationUrl, persisted: null };
  }

  let aggregated: { partes: MaterialPart[]; status: string; headline: { arquivo_url: string | null; storage_path: string | null } } = {
    partes: [],
    status: "pending",
    headline: { arquivo_url: null, storage_path: null },
  };
  for (const p of presentationParts) {
    aggregated = computeAggregatedApresentacaoEntry(aggregated.partes, p, parts.length, aggregated.status);
  }

  const updates: Record<string, MaterialEntry> = {
    apresentacao: {
      // slides fica vazio de proposito - ver comentario equivalente em
      // archiveMultiPartToSupabase.
      payload: { slides: [] as never[], tema_visual: presentationTheme },
      metadata: buildPresentationMaterialMetadata({
        generationKey: fence.generationKey,
        presentationUrl: aggregated.headline.arquivo_url,
        bucket,
        failure: firstPresentationFailure,
        status: aggregated.status,
      }),
      arquivo_url: aggregated.headline.arquivo_url,
      storage_path: aggregated.headline.storage_path,
      ...(aggregated.headline.arquivo_url ? { bucket, mime_type: "text/html; charset=utf-8" } : {}),
      partes: aggregated.partes,
    },
  };

  const persisted = await mergeMateriais(personalizacaoId, updates, fence);
  return { presentationUrl, persisted };
}

const PRESENTATION_VERSIONS: PresentationVersions = {
  engine: PRESENTATION_ENGINE_VERSION,
  media_pipeline_version: MEDIA_PIPELINE_VERSION,
  design_system: PRESENTATION_DESIGN_VERSION,
};

function partSuffix(ordem: number, totalPartes: number): string {
  return totalPartes > 1 ? `-parte-${String(ordem).padStart(2, "0")}` : "";
}

/** Sobe o texto de cada parte. Falha de upload deixa so aquela parte sem arquivo. */
async function uploadMarkdownParts(
  parts: Array<{ ordem: number; titulo: string; markdown: string }>,
  ctx: { storagePath: string; bucket: string; refId: string; log: Logger },
): Promise<MaterialPart[]> {
  const partes: MaterialPart[] = [];
  for (const part of parts) {
    const mdPath = `${ctx.storagePath}/markdown/material-${ctx.refId}${partSuffix(part.ordem, parts.length)}.md`;
    let url: string | null = null;
    try {
      url = await uploadBuffer(ctx.bucket, mdPath, Buffer.from(part.markdown, "utf-8"), "text/markdown; charset=utf-8");
      ctx.log.info("markdown upload", { status: url ? "ok" : "falhou", parte: part.ordem });
    } catch (e) {
      ctx.log.error("falha no upload de markdown", { err: e, parte: part.ordem });
    }
    partes.push({ ordem: part.ordem, titulo: part.titulo, arquivo_url: url, storage_path: url ? mdPath : null });
  }
  return partes;
}

/**
 * Entrada da apresentacao para o merge, SO quando alguma parte renderizada
 * agora nao conseguiu gravar pelo BrainHexPDF (falha de transporte). No caminho
 * feliz quem grava e o proprio BrainHexPDF, parte a parte - ver
 * docs/superpowers/specs/2026-08-16-brainhexpdf-direct-db-write-design.md.
 * As partes ja prontas de uma tentativa anterior entram na agregacao.
 */
export function buildPresentationFallbackEntry(params: {
  keptPartes: MaterialPart[];
  rendered: Array<{ ordem: number; titulo: string; path: string; result: RenderAndUploadPresentationResult }>;
  totalPartes: number;
  presentationTheme: PresentationDesignPlan;
  generationKey: string;
  bucket: string;
}): MaterialEntry | null {
  if (params.rendered.every((r) => r.result.dbWritten)) return null;
  let firstFailure: PresentationFailure | null = null;
  let aggregated: { partes: MaterialPart[]; status: string; headline: { arquivo_url: string | null; storage_path: string | null } } = {
    partes: params.keptPartes,
    status: "pending",
    headline: { arquivo_url: params.keptPartes[0]?.arquivo_url ?? null, storage_path: params.keptPartes[0]?.storage_path ?? null },
  };
  for (const { ordem, titulo, path: presentationPath, result } of params.rendered) {
    if (result.failure) firstFailure = firstFailure ?? result.failure;
    aggregated = computeAggregatedApresentacaoEntry(
      aggregated.partes,
      {
        ordem,
        titulo,
        arquivo_url: result.presentationUrl,
        storage_path: result.presentationUrl ? presentationPath : null,
        failed: result.presentationUrl === null,
        ...(result.presentationUrl === null && result.failure ? { failure: result.failure } : {}),
      },
      params.totalPartes,
      aggregated.status,
    );
  }
  return {
    // slides fica vazio de proposito - ver comentario equivalente em
    // archiveToSupabase (o mobile abre o HTML completo do BrainHexPDF).
    payload: { slides: [] as never[], tema_visual: params.presentationTheme },
    metadata: buildPresentationMaterialMetadata({
      generationKey: params.generationKey,
      presentationUrl: aggregated.headline.arquivo_url,
      bucket: params.bucket,
      failure: firstFailure,
      status: aggregated.status,
    }),
    arquivo_url: aggregated.headline.arquivo_url,
    storage_path: aggregated.headline.storage_path,
    ...(aggregated.headline.arquivo_url ? { bucket: params.bucket, mime_type: "text/html; charset=utf-8" } : {}),
    partes: aggregated.partes,
  };
}

/**
 * Pipeline de uma personalizacao (#652): NOVA TENTATIVA NAO REGERA TUDO.
 *
 * 0. Le o que ja esta pronto NESTA geracao (mediaResume.ts).
 * 1. Texto: reaproveita as partes ja subidas; so gera (Gemini) quando nao ha.
 *    Gerado, o texto e o roteiro de cada parte de audio sao gravados ANTES do
 *    TTS e dos decks (checkpoint) - a proxima tentativa parte dali.
 * 2. Audio: a etapa de juncao (audioJunction.ts) agrupa o roteiro dos blocos
 *    em partes do tamanho de uma chamada de TTS, limpa o que nao e fala e
 *    corta so em fronteira de frase. Sintetiza so as partes sem arquivo.
 * 3. Apresentacao: renderiza so as partes que faltam, em paralelo com o audio.
 * 4. Um merge so no fim com o que mudou.
 */
export async function runPipeline(
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

  // 0. O que ja esta pronto nesta geracao.
  const existingMateriais = await fetchPersonalizacaoMateriais(personalizacaoId);
  const resume = planMediaResume(existingMateriais, {
    storagePath,
    generationKey: fence.generationKey,
    versions: PRESENTATION_VERSIONS,
  });
  if (resume.audioDone && resume.markdownDone && resume.apresentacaoDone) {
    jobLog.info("retomada: as tres midias ja estao prontas nesta geracao", { generationKey: fence.generationKey });
    return;
  }

  const voiceProfile = GUARDIAN_VOICE_PROFILES[profile];
  const voice = voiceProfile.voice;
  const secondaryGuideName = BRAIN_HEX_CONFIG[profile]?.secondaryGuideName;
  const secondaryVoice = voiceProfile.secondaryVoice;
  const isDialogue = Boolean(secondaryGuideName && secondaryVoice);
  const scriptStyle = isDialogue
    ? { speakers: [BRAIN_HEX_CONFIG[profile].guideName, secondaryGuideName as string] }
    : {};
  const junctionConfig = resolveAudioJunctionConfig();
  const planAudio = (chapters: Array<{ markdown?: string; audioScript: string }>): AudioPartPlan[] =>
    audioPlanFromJunction(joinAudioBlocks(audioSegmentsFromChapters(chapters), junctionConfig, scriptStyle));

  // 1. Texto.
  let textParts: Array<{ ordem: number; titulo: string; markdown: string }> | null = null;
  let markdownPartes: MaterialPart[] = [];
  let writeMarkdown = false;
  let audioPlan: AudioPartPlan[] = [];
  let audioScriptError: unknown = null;
  let imageAttachments: Array<{ data: string; mimeType: string; name: string; url: string; sourceText?: string; sourceOrder?: number }> = [];
  let attachmentsFor: (markdown: string) => Array<{ data: string; mimeType: string; name: string; url: string }> =
    (markdown) => extractAttachmentsFromMarkdown(markdown);

  const reconstructed = resume.markdownPartes
    ? await reconstructMarkdownPartsFromMaterials(existingMateriais?.markdown)
    : null;
  const resumed = Boolean(reconstructed && (resume.audioDone || resume.storedAudio || contentBlocks.length > 0));

  if (resumed && reconstructed && resume.markdownPartes) {
    textParts = reconstructed;
    markdownPartes = resume.markdownPartes;
    // Texto do checkpoint (pending): vira completed no merge final.
    writeMarkdown = !resume.markdownDone;
    if (resume.storedAudio && !resume.audioDone) {
      audioPlan = resume.storedAudio;
    } else if (!resume.audioDone) {
      // Material gravado antes do checkpoint: o texto esta pronto, so o
      // roteiro precisa ser refeito - nunca o texto inteiro.
      jobLog.info("retomada: sem roteiro guardado, refazendo so o roteiro do áudio");
      try {
        audioPlan = planAudio(await generateAudioScriptsWithGemini(profile, contentBlocks, guidancePrompt));
        await mergePersonalizacaoMateriais(
          personalizacaoId,
          { audio: buildAudioCheckpointEntry({ plan: audioPlan, generationKey: fence.generationKey, bucket }) },
          fence,
        );
      } catch (err) {
        jobLog.error("retomada: roteiro do áudio não foi refeito", { err });
        audioScriptError = err;
      }
    }
  } else {
    if (reconstructed) {
      jobLog.warn("retomada: material antigo sem blocos de conteúdo; gerando o texto de novo");
    } else if (resume.markdownPartes) {
      jobLog.warn("retomada: não foi possível baixar o texto já gerado; gerando de novo");
    }

    // 1a. Download das fontes
    const filesData = await fetchFontesAsFileData(fontes);
    if (filesData.length === 0 && contentBlocks.length === 0) {
      const msg = "todas as fontes falharam no download (verifique as URLs e permissões)";
      jobLog.warn(msg);
      throw new Error(msg);
    }

    // Subconjunto de filesData que o BrainHexPDF pode usar como imagem real
    // de referencia num slide - o restante (pdf, docx, audio, etc.) so serve
    // pra processMediaWithGemini sintetizar texto/audio.
    imageAttachments = filesData
      .filter((f) => f.mimeType.startsWith("image/"))
      .map((f) => ({ data: f.data, mimeType: f.mimeType, name: f.name, url: f.url }));

    // 1b. Texto + roteiro via Gemini (multi-arquivo)
    const resultado = await processMediaWithGemini(
      filesData,
      profile,
      contentBlocks,
      presentationPlan,
      guidancePrompt,
    );

    // Professor as vezes anexa um .pptx/.docx em vez de uma imagem avulsa -
    // sem isso, as imagens de dentro do arquivo (o "conteudo base" de
    // verdade) nunca viravam imageAttachments e o pipeline inteiro caia pro
    // fallback de IA/SVG generico. Anexos avulsos (acima) sempre vem
    // primeiro na lista.
    if (resultado.extractedMedia && resultado.extractedMedia.length > 0) {
      imageAttachments = [
        ...imageAttachments,
        ...resultado.extractedMedia.map((m) => ({
          data: m.data,
          mimeType: m.mimeType,
          name: m.name,
          url: `data:${m.mimeType};base64,${m.data}`,
          // Contexto de origem: e o que permite colocar cada imagem na secao do
          // mesmo assunto, em vez de distribuir por rodizio (imageTextGraph.ts).
          sourceText: m.sourceText,
          sourceOrder: m.sourceOrder,
        })),
      ];
    }

    // CAMADA 2 da adaptacao da imagem ao perfil: reilustra a imagem do professor
    // no clima do Guardiao. Desligada por padrao (PROFILE_IMAGE_RESTYLE) e com
    // teto por material - ver profileImageRestyle.ts pro custo. Falha aqui
    // nunca derruba o material: a imagem original fica.
    const restyleResult = await applyProfileRestyle(imageAttachments, {
      profile,
      assunto: fallbackSubject,
      restyle: restyleImageWithGemini,
      onAviso: (mensagem, detalhe) => jobLog.warn(`reilustracao por perfil: ${mensagem}`, { err: detalhe }),
    });
    if (restyleResult.reilustradas > 0 || restyleResult.interrompidoPor) {
      jobLog.info("reilustracao por perfil", {
        reilustradas: restyleResult.reilustradas,
        total: imageAttachments.length,
        ...(restyleResult.interrompidoPor ? { interrompidoPor: restyleResult.interrompidoPor } : {}),
      });
    }
    imageAttachments = restyleResult.imagens as typeof imageAttachments;

    // Diagramas em arte ASCII viram SVG de verdade, embutido no markdown como
    // imagem - console, mobile e deck renderizam igual (flowDiagram/laneDiagram).
    resultado.markdown = replaceAsciiDiagramsWithSvg(resultado.markdown, {
      accentColor: BRAIN_HEX_CONFIG[profile]?.color,
    });

    // Distribui as imagens do professor pelo markdown ANTES de dividir em
    // partes - cada parte carrega as imagens que caem dentro da sua fatia
    // (ver docs/superpowers/specs/2026-08-22-reaproveitamento-imagens-midias-design.md).
    resultado.markdown = insertImagesIntoMarkdown(resultado.markdown, imageAttachments);

    // Partes do TEXTO (e de cada deck): por heading de nivel 2, ate ~4.500
    // caracteres de markdown cada (ver splitProcessedContentIntoParts).
    textParts = splitProcessedContentIntoParts({
      markdown: resultado.markdown,
      audioScript: resultado.audioScript,
      slides: resultado.slides,
    });
    const imagens = imageAttachments;
    attachmentsFor = (markdown) => selectAttachmentsForMarkdown(markdown, imagens);

    // Partes do AUDIO: etapa de juncao, independente das partes do texto.
    if (!resume.audioDone) {
      audioPlan = planAudio(
        resultado.chapters && resultado.chapters.length > 0
          ? resultado.chapters
          : [{ markdown: resultado.markdown, audioScript: resultado.audioScript }],
      );
    }

    // Checkpoint: texto e roteiro gravados antes do TTS e dos decks.
    markdownPartes = await uploadMarkdownParts(textParts, { storagePath, bucket, refId, log: jobLog });
    writeMarkdown = true;
    if (markdownPartes.every((parte) => parte.arquivo_url)) {
      const checkpoint: Record<string, MaterialEntry> = {
        markdown: buildMarkdownMaterialEntry({
          partes: markdownPartes,
          firstMarkdown: textParts[0]?.markdown ?? "",
          generationKey: fence.generationKey,
          bucket,
          checkpoint: true,
        }),
      };
      if (audioPlan.length > 0) {
        checkpoint.audio = buildAudioCheckpointEntry({ plan: audioPlan, generationKey: fence.generationKey, bucket });
      }
      await mergePersonalizacaoMateriais(personalizacaoId, checkpoint, fence);
      jobLog.info("checkpoint: texto e roteiro gravados", {
        partesTexto: textParts.length,
        partesAudio: audioPlan.length,
      });
    }
  }

  if (!textParts) throw new Error("texto do material ausente");
  const totalPartes = textParts.length;

  // 2 e 3. Audio e apresentacao, so o que falta, em paralelo.
  const keptPresentation = resume.apresentacaoDone || !resumed
    ? []
    : reusablePresentationPartes(existingMateriais?.apresentacao, storagePath, PRESENTATION_VERSIONS, totalPartes);
  const keptOrdens = new Set(keptPresentation.map((parte) => parte.ordem));
  const toRender = resume.apresentacaoDone ? [] : textParts.filter((part) => !keptOrdens.has(part.ordem));
  const toSynthesize = audioPlan.filter((part) => !part.pronta);
  const presentationPathFor = (ordem: number) =>
    `${storagePath}/apresentacao/material-${refId}${partSuffix(ordem, totalPartes)}.html`;

  jobLog.info("midias a gerar", {
    texto: resumed ? "reaproveitado" : "gerado",
    audio: `${toSynthesize.length}/${audioPlan.length} partes`,
    apresentacao: `${toRender.length}/${resume.apresentacaoDone ? 0 : totalPartes} partes`,
  });

  const generatePartAudio = (audioScript: string) =>
    isDialogue
      ? generateLongConversationalAudio(
          audioScript,
          { name: BRAIN_HEX_CONFIG[profile].guideName, voice, direction: voiceProfile.direction },
          { name: secondaryGuideName as string, voice: secondaryVoice!, direction: voiceProfile.secondaryDirection },
        )
      : generateLongNaturalAudio(audioScript, voice, voiceProfile.direction);

  // O audio usa settleWithConcurrency com teto de partes simultaneas -
  // disparar todas de uma vez estourava RPM do free tier do Gemini. A
  // apresentacao (uma chamada ao BrainHexPDF por parte) roda junto.
  const { audioSettled, audioSecondRound, presentationResults } = await runAudioAndPresentationInParallel(toRender, {
    generateAudio: generatePartAudio,
    audioParts: toSynthesize.map((part) => ({ audioScript: part.roteiro })),
    audioConcurrency: resolveAudioPartConcurrency(process.env.CONTENT_GENERATION_AUDIO_PART_CONCURRENCY),
    audioSecondRound: resolveAudioSecondRoundConfig(),
    renderPresentation: (part) =>
      renderAndUploadPresentationViaBrainHexPdf({
        markdown: part.markdown,
        topic: part.titulo,
        profile,
        bucket,
        // So as imagens desta parte, nao a lista inteira: com todas, cada
        // parte reencontrava a mesma imagem e ela terminava em todo slide.
        attachments: attachmentsFor(part.markdown),
        presentationPath: presentationPathFor(part.ordem),
        // Fencing pro BrainHexPDF gravar direto no banco, parte a parte - ver
        // docs/superpowers/specs/2026-08-16-brainhexpdf-direct-db-write-design.md.
        personalizacaoId,
        fence,
        versionMetadata: {
          engine: PRESENTATION_ENGINE_VERSION,
          schema: PRESENTATION_SCHEMA_VERSION,
          design_system: PRESENTATION_DESIGN_VERSION,
          media_pipeline_version: MEDIA_PIPELINE_VERSION,
        },
        ordem: part.ordem,
        totalPartes,
        titulo: part.titulo,
      }),
  });

  const ordensDe = (positions: number[]) => positions.map((position) => toSynthesize[position - 1]?.ordem ?? position);
  if (audioSecondRound.status === "ran") {
    jobLog.info("segunda rodada de áudio", {
      partes: ordensDe(audioSecondRound.retriedParts),
      recuperadas: ordensDe(audioSecondRound.recoveredParts),
    });
  } else if (audioSecondRound.status === "skipped") {
    jobLog.warn("segunda rodada de áudio não feita", {
      motivo: audioSecondRound.reason,
      partes: ordensDe(audioSecondRound.failedParts),
    });
  }

  // Sobe cada parte de audio pronta.
  const synthesized = new Map<number, MaterialPart>();
  const audioFailures: AudioPartFailure[] = [];
  const audioFailureReasons: unknown[] = [];
  let firstAudio: { wav: string; mp3: string | null } | null = null;
  for (let index = 0; index < toSynthesize.length; index++) {
    const plan = toSynthesize[index];
    const result = audioSettled[index];
    if (result.status === "rejected") {
      jobLog.error("falha no áudio de uma parte", { parte: plan.ordem, err: result.reason });
      // O motivo VAI JUNTO do material (metadata.failure_reason): e o que o
      // professor le no console em vez de "Falhou" pelado.
      audioFailures.push({ ordem: plan.ordem, motivo: describeError(result.reason) });
      audioFailureReasons.push(result.reason);
      continue;
    }
    if (plan.ordem === 1) firstAudio = result.value;
    const isMp3 = Boolean(result.value.mp3);
    const audioPath = `${storagePath}/audio/material-${refId}${partSuffix(plan.ordem, audioPlan.length)}.${isMp3 ? "mp3" : "wav"}`;
    try {
      const url = await uploadBuffer(
        bucket,
        audioPath,
        Buffer.from((result.value.mp3 ?? result.value.wav) as string, "base64"),
        isMp3 ? "audio/mpeg" : "audio/wav",
      );
      jobLog.info("áudio upload", { status: url ? "ok" : "falhou", parte: plan.ordem });
      if (url) {
        synthesized.set(plan.ordem, { ordem: plan.ordem, titulo: plan.titulo, arquivo_url: url, storage_path: audioPath });
      } else {
        audioFailures.push({ ordem: plan.ordem, motivo: "upload: sem URL" });
        audioFailureReasons.push(new Error("upload: sem URL"));
      }
    } catch (e) {
      jobLog.error("falha no upload de áudio", { err: e, parte: plan.ordem });
      audioFailures.push({ ordem: plan.ordem, motivo: `upload: ${describeError(e)}` });
      audioFailureReasons.push(e);
    }
  }

  // Imagem do audio (capa e minutagem por secao) - so na 1a parte, mesma
  // limitacao ja aceita antes (docs/superpowers/specs/2026-08-22-audio-image-cues-design.md).
  let firstMarkdown = textParts[0]?.markdown ?? "";
  const previousAudioPayload = (existingMateriais?.audio?.payload ?? {}) as Record<string, unknown>;
  let audioPayloadExtras: Record<string, unknown> = {};
  if (!resumed) {
    // Sem imagem do professor, reusa a MESMA imagem gerada por IA que os
    // slides da parte 1 usaram (so existe agora, depois do deck) - ver
    // docs/superpowers/specs/2026-08-24-imagem-gerada-fallback-markdown-audio-design.md.
    const firstDeck = presentationResults[toRender.findIndex((part) => part.ordem === 1)];
    const imagesForAudio = deriveImagesForMedia(imageAttachments, firstDeck?.generatedImagesBySubtopic);
    if (imageAttachments.length === 0 && imagesForAudio.length > 0 && markdownPartes[0]?.storage_path) {
      firstMarkdown = insertImagesIntoMarkdown(firstMarkdown, imagesForAudio);
      try {
        await uploadBuffer(bucket, markdownPartes[0].storage_path, Buffer.from(firstMarkdown, "utf-8"), "text/markdown; charset=utf-8");
      } catch (e) {
        jobLog.warn("imagem gerada não entrou no arquivo do texto da parte 1", { err: e });
      }
    }
    const durationSec = firstAudio ? estimateAudioDurationSec(firstAudio.mp3, firstAudio.wav) : null;
    const imageCues: ImageCue[] = computeImageCues(audioPlan[0]?.secoes, durationSec, imagesForAudio);
    audioPayloadExtras = {
      ...(imagesForAudio[0]?.url ? { capaUrl: imagesForAudio[0].url } : {}),
      ...(imageCues.length > 0 ? { imageCues } : {}),
    };
  } else if (firstAudio) {
    // Parte 1 refeita agora: as imagens saem do texto ja gravado.
    const images = imageUrlsFromMarkdown(textParts.map((part) => part.markdown).join("\n\n")).map((url) => ({ url }));
    const imageCues = computeImageCues(audioPlan[0]?.secoes, estimateAudioDurationSec(firstAudio.mp3, firstAudio.wav), images);
    const capaUrl = previousAudioPayload.capaUrl ?? images[0]?.url;
    audioPayloadExtras = {
      ...(capaUrl ? { capaUrl } : {}),
      ...(imageCues.length > 0 ? { imageCues } : {}),
    };
  } else {
    audioPayloadExtras = {
      ...(previousAudioPayload.capaUrl ? { capaUrl: previousAudioPayload.capaUrl } : {}),
      ...(previousAudioPayload.imageCues ? { imageCues: previousAudioPayload.imageCues } : {}),
    };
  }

  // 4. Merge do que mudou.
  const updates: Record<string, MaterialEntry> = {};
  if (writeMarkdown) {
    updates.markdown = buildMarkdownMaterialEntry({
      partes: markdownPartes,
      firstMarkdown,
      generationKey: fence.generationKey,
      bucket,
    });
  }
  if (audioPlan.length > 0) {
    updates.audio = buildAudioMaterialEntry({
      plan: audioPlan,
      synthesized,
      failures: audioFailures,
      generationKey: fence.generationKey,
      bucket,
      payloadExtras: audioPayloadExtras,
    });
  } else if (audioScriptError) {
    const previousAudio = (existingMateriais?.audio ?? {}) as MaterialEntry;
    updates.audio = {
      ...previousAudio,
      arquivo_url: previousAudio.arquivo_url ?? null,
      storage_path: previousAudio.storage_path ?? null,
      metadata: {
        ...(previousAudio.metadata ?? {}),
        status: "failed",
        media_kind: "audio",
        generation_key: fence.generationKey,
        updated_at: now(),
        failure_reason: `Roteiro do áudio não foi refeito — ${describeError(audioScriptError)}`.slice(0, 400),
      } as MaterialEntry["metadata"],
    };
    audioFailureReasons.push(audioScriptError);
  }
  const presentationFallback = buildPresentationFallbackEntry({
    keptPartes: keptPresentation,
    rendered: toRender.map((part, index) => ({
      ordem: part.ordem,
      titulo: part.titulo,
      path: presentationPathFor(part.ordem),
      result: presentationResults[index],
    })),
    totalPartes,
    presentationTheme: presentationPlan,
    generationKey: fence.generationKey,
    bucket,
  });
  for (const [index, result] of presentationResults.entries()) {
    if (result.failure) {
      jobLog.error("falha na apresentacao", { stage: result.failure.stage, error: result.failure.error, parte: toRender[index]?.ordem });
    }
  }
  if (presentationFallback) updates.apresentacao = presentationFallback;

  // Mesmo sem nada a gravar (deck gravado pelo BrainHexPDF), o merge devolve
  // o estado persistido e recalcula o status do registro.
  const persisted = await mergePersonalizacaoMateriais(personalizacaoId, updates, fence);
  if (!persisted) {
    throw new Error("merge persistido ausente para a personalizacao");
  }
  if (Object.keys(updates).length > 0) {
    const historySaved = await saveMateriaisGerados(personalizacaoId, persisted, fence, Object.keys(updates));
    if (!historySaved) {
      jobLog.warn("historico materiais_gerados nao persistido", { generationKey: fence.generationKey });
    }
  }

  const failedFormats = ["audio", "markdown", "apresentacao"].filter((mediaKind) => {
    const metadata = persisted.materiais?.[mediaKind]?.metadata;
    return (
      metadata?.status !== "completed"
      || metadata?.generation_key !== fence.generationKey
    );
  });
  if (failedFormats.length > 0) {
    // So o audio faltando, e so por cota do dia ou credito: a API nao repete
    // o alvo na hora - a proxima tentativa (amanha, ou depois de resolver a
    // chave) retoma so as partes que faltam.
    const semCota = failedFormats.length === 1
      && failedFormats[0] === "audio"
      && audioFailedOnlyForQuota(audioFailureReasons);
    throw new Error(
      `midias obrigatorias nao geradas: ${failedFormats.join(", ")}`
      + (semCota
        ? ` ${SEM_COTA_TTS_MARKER} cota do dia ou crédito do TTS esgotado; `
          + "a nova tentativa retoma só as partes de áudio que faltam, depois da virada da cota (meia-noite do Pacífico)"
        : ""),
    );
  }
  if (persisted.status !== "pronto") {
    throw new Error(`status persistido inesperado: ${persisted.status}`);
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
): Promise<{ data: string; mimeType: string; name: string; url: string }[]> {
  const results: { data: string; mimeType: string; name: string; url: string }[] = [];
  for (const fonte of fontes) {
    if (!fonte.url) continue;
    try {
      const buffer = await downloadFonteStreamed(fonte.url);
      if (!buffer) continue;
      const base64 = buffer.toString("base64");
      const name   = fonte.url.split("/").pop()?.split("?")[0] ?? "arquivo";
      results.push({ data: base64, mimeType: fonte.mime_type, name, url: fonte.url });
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
      build_commit: getBuildCommit(),
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

  // ── POST /api/v1/generate/block — geração granular por bloco ────
  //
  // Usado pelo worker de fila do Python (Fase A da geracao retomavel — ver
  // docs/superpowers/specs/2026-08-18-geracao-granular-retomavel-design.md).
  // Aceita um SUBCONJUNTO de blocos já enriquecidos (só os que ainda faltam
  // numa retentativa) e devolve o capítulo (markdown+audioScript+slides) de
  // cada um. Reaproveita processMediaWithGemini inteiro — já faz
  // batching/concorrência/fallback Gemini→OpenAI quando contentBlocks não
  // está vazio, sem nenhuma fonte binária (filesData=[]).
  app.post("/api/v1/generate/block", requireSecret, async (req, res) => {
    try {
      const { contentBlocks, profile, presentation_theme: presentationTheme, guidance_prompt: guidancePrompt } = req.body ?? {};
      if (!Array.isArray(contentBlocks) || contentBlocks.length === 0) {
        return res.status(400).json({ error: "contentBlocks é obrigatório e não pode ser vazio" });
      }
      if (typeof profile !== "string" || !VALID_PROFILES.includes(profile as BrainHexProfile)) {
        return res.status(400).json({ error: "profile é obrigatório e precisa ser um perfil BrainHex válido" });
      }
      const presentationPlan = buildPresentationDesignPlan(
        profile as BrainHexProfile,
        presentationTheme ?? {},
        contentBlocks[0]?.tema || contentBlocks[0]?.topico || "Conteúdo de estudo",
      );
      const result = await processMediaWithGemini(
        [],
        profile as BrainHexProfile,
        contentBlocks,
        presentationPlan,
        typeof guidancePrompt === "string" ? guidancePrompt : undefined,
      );
      if (!result.chapters || result.chapters.length === 0) {
        return res.status(502).json({ error: "geração não retornou capítulos por bloco" });
      }
      res.json({ success: true, chapters: result.chapters });
    } catch (error: any) {
      req.log.error("generate/block erro", { err: error });
      res.status(500).json({ error: error?.message || "Falha ao gerar capítulos por bloco" });
    }
  });

  // ── POST /api/v1/generate/part-audio — TTS granular por parte ───
  //
  // Fase B da geracao retomavel: gera e sobe o audio de UMA parte de
  // entrega (ja resplitada pelo worker Python a partir do markdown
  // consolidado dos blocos da Fase A). storagePath vem SEM extensao — a
  // extensao real (mp3 preferencial, wav fallback) e decidida aqui, como
  // ja acontece em archiveMultiPartToSupabase.
  app.post("/api/v1/generate/part-audio", requireSecret, async (req, res) => {
    try {
      const { audioScript, profile, bucket, storagePath } = req.body ?? {};
      if (typeof audioScript !== "string" || !audioScript.trim()) {
        return res.status(400).json({ error: "audioScript é obrigatório" });
      }
      if (typeof profile !== "string" || !VALID_PROFILES.includes(profile as BrainHexProfile)) {
        return res.status(400).json({ error: "profile é obrigatório e precisa ser um perfil BrainHex válido" });
      }
      if (typeof bucket !== "string" || !bucket.trim() || typeof storagePath !== "string" || !storagePath.trim()) {
        return res.status(400).json({ error: "bucket e storagePath são obrigatórios" });
      }
      const typedProfile = profile as BrainHexProfile;
      const voiceProfile = GUARDIAN_VOICE_PROFILES[typedProfile];
      const secondaryGuideName = BRAIN_HEX_CONFIG[typedProfile]?.secondaryGuideName;
      const audioResult = secondaryGuideName && voiceProfile.secondaryVoice
        ? await generateLongConversationalAudio(
            audioScript,
            { name: BRAIN_HEX_CONFIG[typedProfile].guideName, voice: voiceProfile.voice, direction: voiceProfile.direction },
            { name: secondaryGuideName, voice: voiceProfile.secondaryVoice, direction: voiceProfile.secondaryDirection },
          )
        : await generateLongNaturalAudio(audioScript, voiceProfile.voice, voiceProfile.direction);

      const audioPayload = audioResult.mp3 ?? audioResult.wav;
      if (!audioPayload) {
        return res.status(502).json({ error: "geração de áudio não retornou mp3 nem wav" });
      }
      const ext = audioResult.mp3 ? "mp3" : "wav";
      const mime = audioResult.mp3 ? "audio/mpeg" : "audio/wav";
      const path = `${storagePath}.${ext}`;
      const audioUrl = await uploadBuffer(bucket, path, Buffer.from(audioPayload, "base64"), mime);
      if (!audioUrl) {
        return res.status(502).json({ error: "upload do áudio falhou" });
      }
      res.json({ success: true, url: audioUrl, storagePath: path, mimeType: mime });
    } catch (error: any) {
      req.log.error("generate/part-audio erro", { err: error });
      res.status(500).json({ error: error?.message || "Falha ao gerar áudio da parte" });
    }
  });

  // ── POST /api/v1/generate/part-presentation — render granular por parte ──
  //
  // Fase B da geracao retomavel: renderiza e sobe a apresentacao de UMA
  // parte via BrainHexPDF. O upload real acontece do lado do BrainHexPDF
  // (SUPABASE_SERVICE_ROLE_KEY dele) — aqui so repassa a chamada, igual
  // arquiveMultiPartToSupabase ja faz por parte hoje.
  app.post("/api/v1/generate/part-presentation", requireSecret, async (req, res) => {
    try {
      const { markdown, topic, profile, bucket, storagePath } = req.body ?? {};
      if (typeof markdown !== "string" || !markdown.trim()) {
        return res.status(400).json({ error: "markdown é obrigatório" });
      }
      if (typeof topic !== "string" || !topic.trim()) {
        return res.status(400).json({ error: "topic é obrigatório" });
      }
      if (typeof profile !== "string" || !VALID_PROFILES.includes(profile as BrainHexProfile)) {
        return res.status(400).json({ error: "profile é obrigatório e precisa ser um perfil BrainHex válido" });
      }
      if (typeof bucket !== "string" || !bucket.trim() || typeof storagePath !== "string" || !storagePath.trim()) {
        return res.status(400).json({ error: "bucket e storagePath são obrigatórios" });
      }
      const result = await renderAndUploadPresentationViaBrainHexPdf({
        markdown,
        topic,
        profile: profile as BrainHexProfile,
        bucket,
        presentationPath: storagePath,
      });
      if (result.failure) {
        return res.status(502).json({
          error: result.failure.error,
          error_stage: result.failure.stage,
        });
      }
      res.json({ success: true, url: result.presentationUrl });
    } catch (error: any) {
      req.log.error("generate/part-presentation erro", { err: error });
      res.status(500).json({ error: error?.message || "Falha ao gerar apresentação da parte" });
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
