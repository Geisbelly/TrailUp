import type {
  DesignTokens,
  GeracaoConteudoStatus,
  PersonalizacaoResponse,
} from "./personalizacoesApi";

// ── Design tokens por perfil BrainHex ──────────────────────────────────────
//
// Port 1:1 de `_build_design_tokens`/`_ensure_min_contrast` em
// `api/app/api/v1/personalizacao.py` — usado quando a API esta fora do ar e o
// console le `conteudo_personalizado` direto do Supabase (ver
// personalizacoesApi.ts). Os valores foram conferidos rodando a funcao Python
// original para os 7 perfis (ver personalizacaoFallback.test.ts): qualquer
// mudanca aqui deve manter esse teste passando ou atualizar os dois lados.

export const PROFILE_COLOR_MAP: Record<string, string> = {
  seeker: "#17a398",
  survivor: "#4e5a66",
  daredevil: "#d7263d",
  mastermind: "#5b3fd9",
  conqueror: "#1e4fd6",
  socializer: "#f4623a",
  socialiser: "#f4623a",
  achiever: "#c9a227",
};

function normalizeProfileName(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function hexToRgb(color: string): [number, number, number] {
  let normalized = color.trim().replace(/^#/, "");
  if (normalized.length === 3) {
    normalized = normalized.split("").map((part) => part + part).join("");
  }
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`;
}

function blend(colorA: string, colorB: string, ratioInput: number): string {
  const ratio = Math.max(0, Math.min(1, ratioInput));
  const left = hexToRgb(colorA);
  const right = hexToRgb(colorB);
  return rgbToHex([
    left[0] * (1 - ratio) + right[0] * ratio,
    left[1] * (1 - ratio) + right[1] * ratio,
    left[2] * (1 - ratio) + right[2] * ratio,
  ]);
}

function darken(color: string, amount: number): string {
  const base = hexToRgb(color);
  const factor = Math.max(0, Math.min(1, 1 - amount));
  return rgbToHex([base[0] * factor, base[1] * factor, base[2] * factor]);
}

function rgba(color: string, alpha: number): string {
  const [r, g, b] = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(2)})`;
}

// RGB <-> HLS (mesma convencao do `colorsys` do Python: H/L/S em [0,1]).
function rgbToHls(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, l, 0];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, l, s];
}

function hlsToRgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

function setLightness(color: string, lightness: number): string {
  const [r, g, b] = hexToRgb(color);
  const [h, , s] = rgbToHls(r / 255, g / 255, b / 255);
  const [nr, ng, nb] = hlsToRgb(h, Math.max(0, Math.min(1, lightness)), s);
  return rgbToHex([nr * 255, ng * 255, nb * 255]);
}

function relativeLuminance(color: string): number {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(color);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureMinContrast(
  color: string,
  background: string,
  minRatio: number,
  step = 0.04,
  maxSteps = 20
): string {
  const [r, g, b] = hexToRgb(color);
  let [, lightness] = rgbToHls(r / 255, g / 255, b / 255);
  let adjusted = color;
  for (let i = 0; i < maxSteps; i += 1) {
    if (contrastRatio(adjusted, background) >= minRatio) break;
    if (lightness >= 1) break;
    lightness = Math.min(1, lightness + step);
    adjusted = setLightness(color, lightness);
  }
  return adjusted;
}

export function buildDesignTokensForProfile(profileName: string | null | undefined): DesignTokens {
  const accentBase = PROFILE_COLOR_MAP[normalizeProfileName(profileName)] ?? PROFILE_COLOR_MAP.mastermind;
  const background = darken(blend("#0b1220", accentBase, 0.06), 0.05);
  const surface = blend("#131d31", accentBase, 0.1);
  const surfaceElevated = blend("#182338", accentBase, 0.14);
  const accent = ensureMinContrast(accentBase, surfaceElevated, 4.5);

  return {
    cores: {
      background,
      surface,
      surface_elevated: surfaceElevated,
      primary: accent,
      primary_glow: rgba(accent, 0.3),
      border: rgba(accent, 0.4),
      text_primary: "#f2f7fa",
      text_muted: "rgba(242, 247, 250, 0.80)",
      success: "#34d399",
      warning: "#fbbf24",
      info: "#60a5fa",
      locked: "#5a676b",
    },
    sombra_primary: rgba(accent, 0.3),
  };
}

// ── URLs publicas de storage ────────────────────────────────────────────────
//
// Port de `build_public_storage_url`/`_hydrate_materiais_public_urls`. Mesma
// convencao de bucket que a API usa: `conteudo_aluno`.
const FALLBACK_BUCKET = "conteudo_aluno";

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeBucketAndPath(bucket: string | null, path: string | null): [string, string] | [null, null] {
  const bucketName = String(bucket ?? "").trim().replace(/^\/+|\/+$/g, "");
  let rawPath = String(path ?? "").trim().replace(/^\/+/, "");
  if (!bucketName || !rawPath) return [null, null];
  if (rawPath.startsWith(`${bucketName}/`)) rawPath = rawPath.slice(bucketName.length + 1);
  return [bucketName, rawPath];
}

export function resolvePublicStorageUrl(
  baseUrl: string | null | undefined,
  bucket: string | null | undefined,
  path: string | null | undefined
): string | null {
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  const [bucketName, rawPath] = normalizeBucketAndPath(bucket ?? null, path ?? null);
  if (!base || !bucketName || !rawPath) return null;
  if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) return rawPath;
  const encodedPath = rawPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  if (!encodedPath) return null;
  return `${base}/storage/v1/object/public/${bucketName}/${encodedPath}`;
}

function resolvePublicAssetFields(
  supabaseUrl: string,
  arquivoUrl: unknown,
  storagePath: unknown,
  metadataInput: Record<string, unknown> | null
): { arquivo_url: string | null; storage_path: string | null; metadata: Record<string, unknown> } {
  const metadata: Record<string, unknown> = { ...(metadataInput ?? {}) };
  const rawUrl = pickString(arquivoUrl);
  const rawStoragePath = pickString(storagePath);
  const isHttpUrl = !!rawUrl && (rawUrl.startsWith("http://") || rawUrl.startsWith("https://"));
  const pathCandidate = rawStoragePath ?? (isHttpUrl ? null : rawUrl);
  const bucket = pickString(
    metadata.bucket,
    metadata.bucketName,
    metadata.storageBucket,
    metadata.storage_bucket,
    FALLBACK_BUCKET
  );

  let resolvedUrl = isHttpUrl ? rawUrl : null;
  let resolvedStoragePath = rawStoragePath ?? pathCandidate;
  if (pathCandidate && bucket) {
    const publicUrl = resolvePublicStorageUrl(supabaseUrl, bucket, pathCandidate);
    if (publicUrl) {
      resolvedUrl = publicUrl;
      resolvedStoragePath = pathCandidate;
      if (metadata.bucket == null) metadata.bucket = bucket;
    }
  }

  return { arquivo_url: resolvedUrl, storage_path: resolvedStoragePath, metadata };
}

export function hydrateMateriaisPublicUrls(
  supabaseUrl: string,
  materiais: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!materiais || typeof materiais !== "object") return materiais ?? null;

  const hydrated: Record<string, unknown> = {};
  for (const [tipo, materialRaw] of Object.entries(materiais)) {
    if (!materialRaw || typeof materialRaw !== "object" || Array.isArray(materialRaw)) {
      hydrated[tipo] = materialRaw;
      continue;
    }
    const material = materialRaw as Record<string, unknown>;
    const metadata =
      material.metadata && typeof material.metadata === "object" && !Array.isArray(material.metadata)
        ? (material.metadata as Record<string, unknown>)
        : null;
    const resolved = resolvePublicAssetFields(supabaseUrl, material.arquivo_url, material.storage_path, metadata);
    hydrated[tipo] = { ...material, ...resolved };
  }
  return hydrated;
}

// ── Status agregado de midia ────────────────────────────────────────────────
//
// Port de `_normalize_media_status`/`_aggregate_media_status`/`_materials_media_status`.
const MEDIA_TIPOS = ["pdf", "audio", "apresentacao", "markdown"] as const;
const MEDIA_STATUS_MAP: Record<string, "ready" | "pending" | "failed"> = {
  completed: "ready",
  ready: "ready",
  succeeded: "ready",
  pending: "pending",
  processing: "pending",
  queued: "pending",
  failed: "failed",
  failed_quality: "failed",
  error: "failed",
};

function normalizeMediaStatus(material: Record<string, unknown>): "ready" | "pending" | "failed" | "partial" {
  const metadata =
    material.metadata && typeof material.metadata === "object" && !Array.isArray(material.metadata)
      ? (material.metadata as Record<string, unknown>)
      : {};
  const scores =
    metadata.scores_validacao && typeof metadata.scores_validacao === "object"
      ? (metadata.scores_validacao as Record<string, unknown>)
      : {};
  const rawStatus = String(metadata.status ?? "").trim().toLowerCase();
  if (scores.aprovado === false) {
    if (["pending", "processing", "queued"].includes(rawStatus)) return "pending";
    return "failed";
  }
  const mapped = MEDIA_STATUS_MAP[rawStatus];
  if (mapped) return mapped;
  if (material.arquivo_url) return "ready";
  return "pending";
}

function aggregateMediaStatus(statuses: Array<"ready" | "pending" | "failed" | "partial">): "ready" | "pending" | "failed" | "partial" {
  const normalized = statuses.filter((status) => ["ready", "pending", "partial", "failed"].includes(status));
  if (!normalized.length) return "ready";
  if (normalized.some((status) => status === "pending")) return "pending";
  if (normalized.every((status) => status === "failed")) return "failed";
  if (normalized.some((status) => status === "failed" || status === "partial")) return "partial";
  return "ready";
}

export function materialsMediaStatus(materiais: Record<string, unknown> | null | undefined): "ready" | "pending" | "failed" | "partial" {
  const payload = materiais && typeof materiais === "object" ? materiais : {};
  const statuses = Object.entries(payload)
    .filter(([tipo, material]) => (MEDIA_TIPOS as readonly string[]).includes(tipo) && material && typeof material === "object")
    .map(([, material]) => normalizeMediaStatus(material as Record<string, unknown>));
  return aggregateMediaStatus(statuses);
}

// ── Linha crua -> PersonalizacaoResponse ────────────────────────────────────
//
// Port reduzido de `_to_response`: sem `steps` (reconstrucao pesada, so usada
// para um contador de debug no console — fica 0 no fallback) e sem preencher
// tom/estilo/nivel do plano quando faltam (mostra "—", cosmetico).
export type ConteudoPersonalizadoFallbackRow = {
  id: number;
  aluno_id: string;
  classe_id: number | null;
  conteudo_id: number | null;
  topico_id: number | null;
  ciclo_id: string;
  status: string | null;
  formato_prioritario: string | null;
  formatos_gerados: string[] | null;
  plano: Record<string, unknown> | null;
  materiais: Record<string, unknown> | null;
  ai_patch: unknown;
  brainhex_profile_key?: string | null;
  gerado_em: string | null;
  updated_at: string | null;
};

export function mapConteudoPersonalizadoRowToResponse(
  supabaseUrl: string,
  record: ConteudoPersonalizadoFallbackRow
): PersonalizacaoResponse {
  const dominantProfile =
    (record.plano && typeof record.plano.perfil_dominante === "string" ? record.plano.perfil_dominante : null) ??
    record.brainhex_profile_key ??
    "mastermind";
  const designTokens = buildDesignTokensForProfile(dominantProfile);
  const materiais = hydrateMateriaisPublicUrls(supabaseUrl, record.materiais);

  return {
    id: record.id,
    aluno_id: record.aluno_id,
    classe_id: record.classe_id,
    conteudo_id: record.conteudo_id,
    topico_id: record.topico_id,
    ciclo_id: record.ciclo_id,
    status: record.status || "pronto",
    media_status: materialsMediaStatus(materiais),
    formato_prioritario: record.formato_prioritario || "",
    formatos_gerados: record.formatos_gerados ?? [],
    plano: record.plano as PersonalizacaoResponse["plano"],
    materiais: materiais as PersonalizacaoResponse["materiais"],
    design_tokens: designTokens,
    steps: [],
    gerado_em: record.gerado_em,
    updated_at: record.updated_at,
  };
}

/**
 * Status de geracao no fallback: `null`, de proposito. `_build_generation_status`
 * cruza `personalizacao_jobs`/`personalizacao_job_targets` com regras de estado
 * (fila/enriquecendo/midias/parcial/etc) que nao valem a pena replicar as cegas
 * sem banco pra testar contra — `statusGeracaoDoPerfil` em generationStatus.ts
 * ja sabe cair pro status legado (`personalizacao.status`) quando `geracao` vem
 * ausente, que e exatamente o caso de quando a API antiga (ou, aqui, o
 * fallback) nao manda esse campo.
 */
export const FALLBACK_GERACAO_STATUS: GeracaoConteudoStatus | null = null;

// ── Extracao/normalizacao de perfil BrainHex de um registro ─────────────────
//
// Port de `ConteudoPersonalizadoRepository._normalize_profile_key` /
// `_extract_profile_key_from_record`.
export const BRAINHEX_PROFILES = [
  "seeker",
  "survivor",
  "daredevil",
  "mastermind",
  "conqueror",
  "socializer",
  "achiever",
] as const;

export const PROFILE_LABEL_MAP: Record<string, string> = {
  seeker: "Explorador",
  survivor: "Sobrevivente",
  daredevil: "Aventureiro",
  mastermind: "Estrategista",
  conqueror: "Conquistador",
  socializer: "Socializador",
  achiever: "Realizador",
};

export function normalizeProfileKey(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "socialiser") return "socializer";
  return normalized || "mastermind";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function extractProfileKeyFromRecord(record: {
  brainhex_profile_key?: unknown;
  plano?: unknown;
}): string {
  const plano = asRecord(record.plano);
  const editorialMetadata = asRecord(plano.editorial_metadata);
  const perfilEditorial = asRecord(editorialMetadata.perfil_editorial);
  const modeloEditorial = asRecord(editorialMetadata.modelo_editorial);
  const personalizacaoBrainhex = asRecord(modeloEditorial.personalizacao_brainhex);

  const perfil =
    record.brainhex_profile_key ??
    perfilEditorial.perfil_dominante ??
    personalizacaoBrainhex.perfil_dominante ??
    plano.perfil_dominante;

  return normalizeProfileKey(perfil);
}
