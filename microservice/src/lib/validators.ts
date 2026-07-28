// Validação de payloads de entrada da API.
//
// Filosofia: rejeitar cedo, mensagens claras em PT-BR, sem dep externa.
// Cada validador retorna ValidationResult<T> que o caller usa como
// discriminated union ({ ok: true; value } | { ok: false; error }).

import type { BrainHexProfile } from "../constants/brainHex";

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

export interface PersonalizarRequest {
  profile:            BrainHexProfile;
  personalizacao_id:  number;
  fontes:             FonteItem[];
  content_blocks:     ContentBlock[];
  classe_id?:         string | number;
  topico_id?:         string | number;
  ciclo_id?:          string;
  source_hash?:       string;
  generation_key?:    string;
  aluno_id?:          string;
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
  if (body.content_blocks !== undefined) {
    if (!Array.isArray(body.content_blocks)) {
      return { ok: false, error: "content_blocks deve ser um array" };
    }
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
      contentBlocks.push({
        id: block.id.trim(),
        ordem: Number.isFinite(Number(block.ordem)) ? Number(block.ordem) : i + 1,
        tema: typeof block.tema === "string" ? block.tema : "",
        topico: typeof block.topico === "string" ? block.topico : `Bloco ${i + 1}`,
        objetivos: Array.isArray(block.objetivos) ? block.objetivos.map(String) : [],
        conteudo_base: typeof block.conteudo_base === "string" ? block.conteudo_base : "",
        conteudo_aprofundado: block.conteudo_aprofundado,
        conceitos_chave: Array.isArray(block.conceitos_chave) ? block.conceitos_chave.map(String) : [],
        exemplos_contextos: Array.isArray(block.exemplos_contextos) ? block.exemplos_contextos.map(String) : [],
        ponte_proximo_bloco: typeof block.ponte_proximo_bloco === "string" ? block.ponte_proximo_bloco : "",
        source_ids: Array.isArray(block.source_ids) ? block.source_ids.map(String) : [],
      });
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
      ciclo_id:          typeof body.ciclo_id === "string" ? body.ciclo_id : undefined,
      source_hash:       typeof body.source_hash === "string" ? body.source_hash : undefined,
      generation_key:    typeof body.generation_key === "string" ? body.generation_key : undefined,
      aluno_id:          typeof body.aluno_id === "string" ? body.aluno_id : undefined,
      wait_for_completion: body.wait_for_completion === true,
    },
  };
}
