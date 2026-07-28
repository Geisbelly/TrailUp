// Validação de payloads de entrada da API.
//
// Filosofia: rejeitar cedo, mensagens claras em PT-BR, sem dep externa.
// Cada validador retorna ValidationResult<T> que o caller usa como
// discriminated union ({ ok: true; value } | { ok: false; error }).

import type { BrainHexProfile } from "../constants/brainHex";
import type {
  PresentationLayout,
  PresentationThemeInput,
} from "../constants/presentationThemes";

export type ValidationResult<T> =
  | { ok: true;  value: T }
  | { ok: false; error: string };

const VALID_PROFILES: ReadonlyArray<BrainHexProfile> = [
  "mastermind", "seeker", "survivor", "daredevil", "conqueror", "socializer", "achiever",
];

export interface FonteItem {
  url:        string;
  mime_type:  string;
  tipo:       string;
}

export interface ContentBlock {
  id: string;
  ordem: number;
  tema: string;
  topico: string;
  objetivos: string[];
  conteudo_base: string;
  conteudo_aprofundado: string;
  conceitos_chave: string[];
  exemplos_contextos: string[];
  ponte_proximo_bloco: string;
  source_ids: string[];
}

export interface BaseContentBlock {
  id: string;
  ordem: number;
  tema: string;
  topico: string;
  objetivos: string[];
  conteudo_base: string;
  source_ids: string[];
  segment_ids: string[];
}

export interface ContentEnrichmentRequest {
  schema_version: "trailup.content-blocks.v2";
  source_hash: string;
  tema: {
    titulo: string;
    descricao: string;
    objetivo: string;
  };
  blocos_base: BaseContentBlock[];
}

export interface PersonalizarRequest {
  profile:            BrainHexProfile;
  personalizacao_id:  number;
  fontes:             FonteItem[];
  content_blocks:     ContentBlock[];
  classe_id?:         string | number;
  topico_id?:         string | number;
  conteudo_id?:       number;
  ciclo_id?:          string;
  source_hash?:       string;
  generation_key?:    string;
  aluno_id?:          string;
  presentation_theme: PresentationThemeInput;
  required_media_pipeline_version?: string;
  required_presentation_engine_version?: string;
  required_presentation_design_version?: string;
  wait_for_completion: boolean;
}

// ── SSRF protection ────────────────────────────────────────────────────────
//
// Hostnames/IPs que NÃO devem ser baixados — metadata endpoints, redes
// internas, loopback, link-local. Lista derivada de RFC 1918 + RFC 6890.
//
// Aliases tipo localhost e *.local também bloqueados.
//
// Para dev/teste, setar ALLOW_PRIVATE_FONTE_URLS=true. Em produção, nunca.

const PRIVATE_HOSTNAME = /^(localhost(\.|$)|.*\.local$)/i;

function isPrivateIPv4(host: string): boolean {
  // Aceita 4 octetos numéricos; senão não é IPv4.
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((p) => Number(p));
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return false;
  const [a, b] = octets;

  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local / AWS metadata!)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 0.0.0.0/8 (this network)
  if (a === 0) return true;
  return false;
}

function isPrivateIPv6(host: string): boolean {
  // Remove colchetes se URL veio com [::1]:port format
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fe80:")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local fc00::/7
  return false;
}

export function isSafeFonteUrl(rawUrl: string, allowPrivate = false): boolean {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return false; }

  if (u.protocol !== "http:" && u.protocol !== "https:") return false;

  if (allowPrivate) return true;

  const host = u.hostname;
  if (PRIVATE_HOSTNAME.test(host))    return false;
  if (isPrivateIPv4(host))            return false;
  if (host.includes(":") && isPrivateIPv6(host)) return false;
  return true;
}

// ── /api/personalizar body ─────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizedText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizedText).filter(Boolean))];
}

const VALID_PRESENTATION_LAYOUTS = new Set<PresentationLayout>([
  "cover",
  "split",
  "cards",
  "spotlight",
  "timeline",
  "finale",
]);

function normalizePresentationTheme(value: unknown): PresentationThemeInput {
  if (!isObject(value)) return {};
  const layouts = normalizedStringArray(value.layout_sequence).filter(
    (layout): layout is PresentationLayout =>
      VALID_PRESENTATION_LAYOUTS.has(layout as PresentationLayout),
  );
  return {
    version: normalizedText(value.version).slice(0, 80) || undefined,
    subject: normalizedText(value.subject).slice(0, 180) || undefined,
    style_name: normalizedText(value.style_name).slice(0, 100) || undefined,
    art_direction:
      normalizedText(value.art_direction).slice(0, 700) || undefined,
    mood: normalizedText(value.mood).slice(0, 220) || undefined,
    texture: normalizedText(value.texture).slice(0, 220) || undefined,
    narrative: normalizedText(value.narrative).slice(0, 420) || undefined,
    motifs: normalizedStringArray(value.motifs).slice(0, 6),
    layout_sequence: layouts.slice(0, 10),
  };
}

export function hasMeaningfulContentExpansion(
  baseValue: unknown,
  expandedValue: unknown,
): boolean {
  const base = normalizedText(baseValue);
  const expanded = normalizedText(expandedValue);
  if (!base || !expanded || base.localeCompare(expanded, undefined, { sensitivity: "accent" }) === 0) {
    return false;
  }
  const minimumAdded = Math.max(80, Math.ceil(base.length * 0.15));
  return expanded.length >= base.length + minimumAdded;
}

export function validateContentEnrichmentBody(
  body: unknown,
): ValidationResult<ContentEnrichmentRequest> {
  if (!isObject(body)) return { ok: false, error: "body deve ser um objeto JSON" };
  if (body.schema_version !== "trailup.content-blocks.v2") {
    return { ok: false, error: "schema_version de enriquecimento inválida" };
  }
  if (typeof body.source_hash !== "string") {
    return { ok: false, error: "source_hash deve ser uma string" };
  }
  if (!isObject(body.tema)) {
    return { ok: false, error: "tema deve ser um objeto" };
  }
  if (!Array.isArray(body.blocos_base) || body.blocos_base.length === 0) {
    return { ok: false, error: "blocos_base deve conter ao menos um bloco" };
  }
  if (body.blocos_base.length > 24) {
    return { ok: false, error: "blocos_base excede o limite de 24 blocos" };
  }

  const ids = new Set<string>();
  const blocosBase: BaseContentBlock[] = [];
  for (let index = 0; index < body.blocos_base.length; index++) {
    const raw = body.blocos_base[index];
    if (!isObject(raw)) {
      return { ok: false, error: `blocos_base[${index}] deve ser um objeto` };
    }
    const id = normalizedText(raw.id);
    const rawConteudoBase =
      typeof raw.conteudo_base === "string" ? raw.conteudo_base.trim() : "";
    const conteudoBase = normalizedText(rawConteudoBase);
    const sourceIds = normalizedStringArray(raw.source_ids);
    const segmentIds = normalizedStringArray(raw.segment_ids);
    if (!id || ids.has(id)) {
      return { ok: false, error: `blocos_base[${index}].id ausente ou duplicado` };
    }
    if (!conteudoBase) {
      return { ok: false, error: `blocos_base[${index}].conteudo_base ausente` };
    }
    if (sourceIds.length === 0 || segmentIds.length === 0) {
      return {
        ok: false,
        error: `blocos_base[${index}] deve preservar source_ids e segment_ids`,
      };
    }
    ids.add(id);
    blocosBase.push({
      id,
      ordem: index + 1,
      tema: normalizedText(raw.tema),
      topico: normalizedText(raw.topico) || `Bloco ${index + 1}`,
      objetivos: normalizedStringArray(raw.objetivos),
      conteudo_base: rawConteudoBase,
      source_ids: sourceIds,
      segment_ids: segmentIds,
    });
  }

  return {
    ok: true,
    value: {
      schema_version: "trailup.content-blocks.v2",
      source_hash: body.source_hash,
      tema: {
        titulo: normalizedText(body.tema.titulo),
        descricao: normalizedText(body.tema.descricao),
        objetivo: normalizedText(body.tema.objetivo),
      },
      blocos_base: blocosBase,
    },
  };
}

export interface ValidatePersonalizarOptions {
  allowPrivateFonteUrls?: boolean; // default false (segurança em prod)
}

export function validatePersonalizarBody(
  body: unknown,
  opts: ValidatePersonalizarOptions = {}
): ValidationResult<PersonalizarRequest> {
  if (!isObject(body)) return { ok: false, error: "body deve ser um objeto JSON" };

  // profile
  const profile = body.profile;
  if (typeof profile !== "string" || !VALID_PROFILES.includes(profile as BrainHexProfile)) {
    return { ok: false, error: "profile inválido ou ausente" };
  }

  // personalizacao_id
  if (body.personalizacao_id === undefined || body.personalizacao_id === null) {
    return { ok: false, error: "personalizacao_id ausente" };
  }
  const personalizacao_id = Number(body.personalizacao_id);
  if (!Number.isFinite(personalizacao_id) || personalizacao_id <= 0 || !Number.isInteger(personalizacao_id)) {
    return { ok: false, error: "personalizacao_id deve ser número inteiro positivo" };
  }

  // fontes
  if (!Array.isArray(body.fontes)) {
    return { ok: false, error: "fontes deve ser um array" };
  }
  const fontes: FonteItem[] = [];
  for (let i = 0; i < body.fontes.length; i++) {
    const f = body.fontes[i];
    if (!isObject(f)) {
      return { ok: false, error: `fontes[${i}] deve ser um objeto` };
    }
    if (typeof f.url !== "string" || f.url.length === 0) {
      return { ok: false, error: `fontes[${i}].url ausente ou vazio` };
    }
    if (!isSafeFonteUrl(f.url, opts.allowPrivateFonteUrls)) {
      return { ok: false, error: `fontes[${i}].url rejeitada (protocolo/host inválido ou rede privada)` };
    }
    if (typeof f.mime_type !== "string" || f.mime_type.length === 0) {
      return { ok: false, error: `fontes[${i}].mime_type ausente` };
    }
    if (typeof f.tipo !== "string") {
      return { ok: false, error: `fontes[${i}].tipo ausente` };
    }
    fontes.push({ url: f.url, mime_type: f.mime_type, tipo: f.tipo });
  }

  const contentBlocks: ContentBlock[] = [];
  if (!Array.isArray(body.content_blocks) || body.content_blocks.length === 0) {
    return {
      ok: false,
      error: "content_blocks enriquecidos sao obrigatorios antes da geracao",
    };
  }
  {
    if (body.content_blocks.length > 24) {
      return { ok: false, error: "content_blocks excede o limite de 24 blocos" };
    }
    for (let i = 0; i < body.content_blocks.length; i++) {
      const block = body.content_blocks[i];
      if (!isObject(block)) {
        return { ok: false, error: `content_blocks[${i}] deve ser um objeto` };
      }
      if (typeof block.id !== "string" || block.id.trim().length === 0) {
        return { ok: false, error: `content_blocks[${i}].id ausente` };
      }
      if (
        typeof block.conteudo_aprofundado !== "string"
        || block.conteudo_aprofundado.trim().length === 0
      ) {
        return { ok: false, error: `content_blocks[${i}].conteudo_aprofundado ausente` };
      }
      if (!hasMeaningfulContentExpansion(block.conteudo_base, block.conteudo_aprofundado)) {
        return {
          ok: false,
          error: `content_blocks[${i}] não contém aprofundamento real`,
        };
      }
      const conceitosChave = normalizedStringArray(block.conceitos_chave);
      const exemplosContextos = normalizedStringArray(block.exemplos_contextos);
      const objetivos = normalizedStringArray(block.objetivos);
      const sourceIds = normalizedStringArray(block.source_ids);
      if (
        conceitosChave.length < 2
        || exemplosContextos.length === 0
        || objetivos.length === 0
        || sourceIds.length === 0
      ) {
        return {
          ok: false,
          error: `content_blocks[${i}] deve conter objetivos, conceitos, exemplos e source_ids`,
        };
      }
      contentBlocks.push({
        id: block.id.trim(),
        ordem: Number.isFinite(Number(block.ordem)) ? Number(block.ordem) : i + 1,
        tema: typeof block.tema === "string" ? block.tema : "",
        topico: typeof block.topico === "string" ? block.topico : `Bloco ${i + 1}`,
        objetivos,
        conteudo_base: typeof block.conteudo_base === "string" ? block.conteudo_base : "",
        conteudo_aprofundado: block.conteudo_aprofundado,
        conceitos_chave: conceitosChave,
        exemplos_contextos: exemplosContextos,
        ponte_proximo_bloco: typeof block.ponte_proximo_bloco === "string" ? block.ponte_proximo_bloco : "",
        source_ids: sourceIds,
      });
    }
  }

  const requiredMediaPipelineVersion = body.required_media_pipeline_version;
  if (
    requiredMediaPipelineVersion !== undefined
    && (
      typeof requiredMediaPipelineVersion !== "string"
      || requiredMediaPipelineVersion.trim().length === 0
    )
  ) {
    return {
      ok: false,
      error: "required_media_pipeline_version deve ser uma string nao vazia",
    };
  }

  const requiredPresentationEngineVersion = body.required_presentation_engine_version;
  if (
    requiredPresentationEngineVersion !== undefined
    && (
      typeof requiredPresentationEngineVersion !== "string"
      || requiredPresentationEngineVersion.trim().length === 0
    )
  ) {
    return {
      ok: false,
      error: "required_presentation_engine_version deve ser uma string nao vazia",
    };
  }

  const requiredPresentationDesignVersion = body.required_presentation_design_version;
  if (
    requiredPresentationDesignVersion !== undefined
    && (
      typeof requiredPresentationDesignVersion !== "string"
      || requiredPresentationDesignVersion.trim().length === 0
    )
  ) {
    return {
      ok: false,
      error: "required_presentation_design_version deve ser uma string nao vazia",
    };
  }

  let conteudoId: number | undefined;
  if (body.conteudo_id !== undefined && body.conteudo_id !== null) {
    conteudoId = Number(body.conteudo_id);
    if (
      !Number.isFinite(conteudoId)
      || !Number.isInteger(conteudoId)
      || conteudoId <= 0
    ) {
      return {
        ok: false,
        error: "conteudo_id deve ser número inteiro positivo",
      };
    }
  }

  return {
    ok: true,
    value: {
      profile:           profile as BrainHexProfile,
      personalizacao_id,
      fontes,
      content_blocks:     contentBlocks,
      classe_id:         body.classe_id as string | number | undefined,
      topico_id:         body.topico_id as string | number | undefined,
      conteudo_id:       conteudoId,
      ciclo_id:          typeof body.ciclo_id === "string" ? body.ciclo_id : undefined,
      source_hash:       typeof body.source_hash === "string" ? body.source_hash : undefined,
      generation_key:    typeof body.generation_key === "string" ? body.generation_key : undefined,
      aluno_id:          typeof body.aluno_id === "string" ? body.aluno_id : undefined,
      presentation_theme: normalizePresentationTheme(body.presentation_theme),
      required_media_pipeline_version:
        typeof requiredMediaPipelineVersion === "string"
          ? requiredMediaPipelineVersion.trim()
          : undefined,
      required_presentation_engine_version:
        typeof requiredPresentationEngineVersion === "string"
          ? requiredPresentationEngineVersion.trim()
          : undefined,
      required_presentation_design_version:
        typeof requiredPresentationDesignVersion === "string"
          ? requiredPresentationDesignVersion.trim()
          : undefined,
      wait_for_completion: body.wait_for_completion === true,
    },
  };
}
