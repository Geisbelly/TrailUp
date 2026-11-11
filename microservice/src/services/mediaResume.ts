// Retomada da geracao de midias (#652): nova tentativa NAO regera tudo.
//
// Antes, toda falha de audio (uma parte de 8 sem voz, cota do dia) fazia a
// nova tentativa refazer o texto (Gemini), TODAS as partes de TTS e TODOS os
// decks. A RPC merge_personalizacao_materiais_v2 descartava o texto refeito
// (o markdown ja estava completed), entao o que sobrava era cota do free tier
// queimada e materiais de rodadas diferentes misturados. Medido na turma 68:
// ~30 pipelines completos num dia de cota.
//
// Agora o pipeline grava o texto e o roteiro de CADA parte de audio antes do
// TTS (checkpoint), e a nova tentativa:
// - reaproveita o texto das partes ja subidas;
// - sintetiza so as partes de audio sem arquivo, com o roteiro guardado;
// - renderiza so as partes da apresentacao que faltam.
//
// O que decide se um arquivo e desta geracao e o CAMINHO dele: storagePath ja
// embute a generation_key (versionStoragePath), e o claim de nova tentativa da
// API (claim_retry_incomplete_generation) reescreve metadata.generation_key de
// todo material incompleto - essa chave sozinha nao prova nada. Pelo mesmo
// motivo o roteiro guardado leva a sua propria marca (roteiro_generation_key),
// que o claim nao toca.

import type { MaterialEntry, MaterialPart } from "./supabaseService";
import type { RelatorioDeFidelidade } from "./fidelityGuard";
import type { AudioJunctionPart } from "../utils/audioJunction";
import { classifyTtsFailure, isDailyQuotaError, rootCause } from "./ttsRecovery";
import { summarizeAudioFailures, type AudioPartFailure } from "../utils/audioFailure";

export type SectionBoundary = AudioJunctionPart["sectionBoundaries"][number];

export interface PresentationVersions {
  engine: string;
  media_pipeline_version: string;
  design_system: string;
}

/** Parte de audio planejada: o roteiro dela e, se ja existir, o arquivo pronto. */
export interface AudioPartPlan {
  ordem: number;
  titulo: string;
  roteiro: string;
  secoes: SectionBoundary[];
  pronta: MaterialPart | null;
}

/** Parte de audio como fica gravada em materiais.audio.partes. */
export interface StoredAudioPart extends MaterialPart {
  roteiro?: string;
  secoes?: SectionBoundary[];
}

export const ROTEIRO_GENERATION_KEY = "roteiro_generation_key";

/**
 * Marcador estavel no erro final quando o audio falhou SO por cota do dia ou
 * credito (402): esperar segundos nao resolve, e a API usa isto para nao
 * repetir o alvo na hora (personalizacao_jobs.py, _SEM_COTA_TTS_MARKER).
 */
export const SEM_COTA_TTS_MARKER = "[sem_cota_tts]";

function now(): string {
  return new Date().toISOString();
}

export function ownsFile(part: MaterialPart | null | undefined, storagePath: string): boolean {
  return Boolean(
    part
      && typeof part.arquivo_url === "string"
      && part.arquivo_url
      && typeof part.storage_path === "string"
      && part.storage_path.startsWith(`${storagePath}/`)
      && !part.failed,
  );
}

function versionsMatch(entry: MaterialEntry | null | undefined, versions: PresentationVersions): boolean {
  const metadata = (entry?.metadata ?? {}) as Record<string, unknown>;
  return (
    metadata.engine === versions.engine
    && metadata.media_pipeline_version === versions.media_pipeline_version
    && metadata.design_system === versions.design_system
  );
}

/** Mesma regra da RPC de merge para "ja concluido nesta geracao". */
export function isMaterialDone(
  entry: MaterialEntry | null | undefined,
  generationKey: string,
  kind: "audio" | "markdown" | "apresentacao",
  versions: PresentationVersions,
): boolean {
  if (entry?.metadata?.status !== "completed" || entry.metadata.generation_key !== generationKey) return false;
  return kind !== "apresentacao" || versionsMatch(entry, versions);
}

/** Partes de texto reaproveitaveis: todas subidas, todas desta geracao. */
export function reusableMarkdownPartes(
  entry: MaterialEntry | null | undefined,
  storagePath: string,
): MaterialPart[] | null {
  const partes = entry?.partes;
  if (!Array.isArray(partes) || partes.length === 0) return null;
  if (!partes.every((parte) => ownsFile(parte, storagePath))) return null;
  return [...partes].sort((a, b) => a.ordem - b.ordem);
}

/**
 * Roteiro guardado de cada parte de audio, com o arquivo ja pronto quando
 * existe. null quando nao ha roteiro desta geracao para todas as partes
 * (material gravado antes do checkpoint): ai o roteiro precisa ser refeito.
 */
export function storedAudioPlan(
  entry: MaterialEntry | null | undefined,
  generationKey: string,
  storagePath: string,
): AudioPartPlan[] | null {
  const metadata = (entry?.metadata ?? {}) as Record<string, unknown>;
  if (metadata[ROTEIRO_GENERATION_KEY] !== generationKey) return null;
  const partes = entry?.partes as StoredAudioPart[] | undefined;
  if (!Array.isArray(partes) || partes.length === 0) return null;
  if (!partes.every((parte) => typeof parte.roteiro === "string" && parte.roteiro.trim())) return null;
  return [...partes]
    .sort((a, b) => a.ordem - b.ordem)
    .map((parte) => ({
      ordem: parte.ordem,
      titulo: parte.titulo,
      roteiro: parte.roteiro as string,
      secoes: Array.isArray(parte.secoes) ? parte.secoes : [],
      pronta: ownsFile(parte, storagePath)
        ? { ordem: parte.ordem, titulo: parte.titulo, arquivo_url: parte.arquivo_url, storage_path: parte.storage_path }
        : null,
    }));
}

export function audioPlanFromJunction(parts: AudioJunctionPart[]): AudioPartPlan[] {
  return parts.map((part) => ({
    ordem: part.ordem,
    titulo: part.titulo,
    roteiro: part.audioScript,
    secoes: part.sectionBoundaries,
    pronta: null,
  }));
}

/**
 * Partes da apresentacao que ja estao prontas nesta geracao e com o mesmo
 * motor/design: so as outras sao renderizadas de novo. O BrainHexPDF grava
 * parte a parte e mantem as demais (gravarApresentacao).
 */
export function reusablePresentationPartes(
  entry: MaterialEntry | null | undefined,
  storagePath: string,
  versions: PresentationVersions,
  totalPartes: number,
): MaterialPart[] {
  if (!versionsMatch(entry, versions)) return [];
  const partes = entry?.partes;
  if (Array.isArray(partes) && partes.length > 0) {
    return partes
      .filter((parte) => parte.ordem >= 1 && parte.ordem <= totalPartes && ownsFile(parte, storagePath))
      .sort((a, b) => a.ordem - b.ordem);
  }
  // Apresentacao de parte unica nao grava `partes`.
  if (totalPartes === 1 && entry && ownsFile({ ...entry, ordem: 1, titulo: "" } as MaterialPart, storagePath)) {
    return [{ ordem: 1, titulo: "", arquivo_url: entry.arquivo_url, storage_path: entry.storage_path }];
  }
  return [];
}

export interface MediaResumePlan {
  audioDone: boolean;
  markdownDone: boolean;
  apresentacaoDone: boolean;
  /** Texto reaproveitavel; null = o texto precisa ser gerado. */
  markdownPartes: MaterialPart[] | null;
  /** Roteiro guardado; null = refazer o roteiro (ou gerar tudo, sem texto). */
  storedAudio: AudioPartPlan[] | null;
}

export function planMediaResume(
  materiais: Record<string, any> | null | undefined,
  params: { storagePath: string; generationKey: string; versions: PresentationVersions },
): MediaResumePlan {
  const { storagePath, generationKey, versions } = params;
  const audio = materiais?.audio as MaterialEntry | undefined;
  const markdown = materiais?.markdown as MaterialEntry | undefined;
  const apresentacao = materiais?.apresentacao as MaterialEntry | undefined;
  const markdownPartes = reusableMarkdownPartes(markdown, storagePath);
  return {
    audioDone: isMaterialDone(audio, generationKey, "audio", versions),
    markdownDone: isMaterialDone(markdown, generationKey, "markdown", versions),
    apresentacaoDone: isMaterialDone(apresentacao, generationKey, "apresentacao", versions),
    markdownPartes,
    // Roteiro sem o texto dele nao serve: a nova tentativa refaria o texto e
    // o audio de outra rodada ficaria misturado com ele.
    storedAudio: markdownPartes ? storedAudioPlan(audio, generationKey, storagePath) : null,
  };
}

function audioMimeOf(part: MaterialPart | undefined): string {
  return part?.storage_path?.endsWith(".wav") ? "audio/wav" : "audio/mpeg";
}

function storedPart(plan: AudioPartPlan, file: MaterialPart | null, failure?: string): StoredAudioPart {
  return {
    ordem: plan.ordem,
    titulo: plan.titulo,
    arquivo_url: file?.arquivo_url ?? null,
    storage_path: file?.arquivo_url ? file.storage_path : null,
    ...(file?.arquivo_url ? {} : { failed: Boolean(failure), ...(failure ? { failure: { stage: "tts", error: failure } } : {}) }),
    roteiro: plan.roteiro,
    secoes: plan.secoes,
  };
}

/**
 * Checkpoint do audio, gravado ANTES do TTS: o roteiro de cada parte fica
 * salvo mesmo que o processo caia, e a proxima tentativa nao refaz o texto.
 */
export function buildAudioCheckpointEntry(params: {
  plan: AudioPartPlan[];
  generationKey: string;
  bucket: string;
}): MaterialEntry {
  const partes = params.plan.map((plan) => storedPart(plan, plan.pronta));
  return {
    payload: { roteiro: params.plan[0]?.roteiro ?? "" },
    metadata: {
      status: "pending",
      media_kind: "audio",
      generation_key: params.generationKey,
      [ROTEIRO_GENERATION_KEY]: params.generationKey,
      updated_at: now(),
    } as MaterialEntry["metadata"],
    arquivo_url: partes[0]?.arquivo_url ?? null,
    storage_path: partes[0]?.storage_path ?? null,
    bucket: params.bucket,
    mime_type: audioMimeOf(partes[0]),
    partes,
  };
}

export function buildAudioMaterialEntry(params: {
  plan: AudioPartPlan[];
  /** Arquivo subido agora, por ordem. Partes sem entrada aqui e sem `pronta` falharam. */
  synthesized: Map<number, MaterialPart>;
  failures: AudioPartFailure[];
  generationKey: string;
  bucket: string;
  payloadExtras?: Record<string, unknown>;
}): MaterialEntry {
  const failureByOrdem = new Map(params.failures.map((f) => [f.ordem, f.motivo]));
  const partes = params.plan.map((plan) =>
    storedPart(plan, plan.pronta ?? params.synthesized.get(plan.ordem) ?? null, failureByOrdem.get(plan.ordem) ?? "sem arquivo"),
  );
  const allOk = partes.every((parte) => parte.arquivo_url);
  return {
    payload: { roteiro: params.plan[0]?.roteiro ?? "", ...(params.payloadExtras ?? {}) },
    metadata: {
      status: allOk ? "completed" : "failed",
      media_kind: "audio",
      generation_key: params.generationKey,
      [ROTEIRO_GENERATION_KEY]: params.generationKey,
      updated_at: now(),
      ...(allOk ? {} : { failure_reason: summarizeAudioFailures(params.failures, params.plan.length) }),
      ...(partes[0]?.arquivo_url ? { bucket: params.bucket } : {}),
    } as MaterialEntry["metadata"],
    arquivo_url: partes[0]?.arquivo_url ?? null,
    storage_path: partes[0]?.storage_path ?? null,
    bucket: params.bucket,
    mime_type: audioMimeOf(partes[0]),
    partes,
  };
}

/**
 * Entrada do texto. `checkpoint` grava como `pending`: o texto ja esta salvo
 * para a retomada, mas a parte 1 ainda pode ganhar a imagem gerada pelo deck
 * (deriveImagesForMedia) - e um `completed` aqui faria a RPC descartar essa
 * versao final.
 */
export function buildMarkdownMaterialEntry(params: {
  partes: MaterialPart[];
  firstMarkdown: string;
  generationKey: string;
  bucket: string;
  checkpoint?: boolean;
  /** Relatório da barreira de fidelidade; sem ele (texto retomado de antes da barreira), a chave não aparece. */
  fidelidade?: RelatorioDeFidelidade;
}): MaterialEntry {
  const allOk = params.partes.length > 0 && params.partes.every((parte) => parte.arquivo_url);
  return {
    payload: { markdown: params.firstMarkdown },
    metadata: {
      status: params.checkpoint ? "pending" : allOk ? "completed" : "failed",
      media_kind: "markdown",
      generation_key: params.generationKey,
      updated_at: now(),
      ...(params.partes[0]?.arquivo_url ? { bucket: params.bucket } : {}),
      ...(params.fidelidade ? { fidelidade: params.fidelidade } : {}),
    },
    arquivo_url: params.partes[0]?.arquivo_url ?? null,
    storage_path: params.partes[0]?.storage_path ?? null,
    bucket: params.bucket,
    mime_type: "text/markdown; charset=utf-8",
    partes: params.partes,
  };
}

/**
 * Verdadeiro quando TODA falha de audio e de cota do dia ou de credito (402):
 * a nova tentativa so adianta depois da virada da cota (meia-noite do
 * Pacifico) ou de alguem resolver a chave.
 */
export function audioFailedOnlyForQuota(reasons: unknown[]): boolean {
  if (reasons.length === 0) return false;
  return reasons.every((reason) => {
    const cause = rootCause(reason);
    return classifyTtsFailure(cause) === "billing" || isDailyQuotaError(cause);
  });
}

/** URLs de imagem do markdown, na ordem em que aparecem (sem SVG gerado). */
export function imageUrlsFromMarkdown(markdown: string): string[] {
  const urls: string[] = [];
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const url = match[1];
    if (url.startsWith("data:image/svg")) continue;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}
