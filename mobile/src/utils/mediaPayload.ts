// Onde mora a URL de uma midia dentro do payload de um bloco.
//
// O payload chega de lugares diferentes (material personalizado por perfil,
// conteudo bruto do professor, atividade) e cada um nomeia o campo do seu jeito:
// "url", "arquivo_url", "documento_url", "storage_path", as vezes so dentro de
// "metadata", as vezes so em "partes[0]".
//
// Cada componente resolvia isso por conta propria, com uma lista de chaves
// diferente - e ai estava o bug: o DocumentBlock conhecia "arquivo_url", mas os
// renderizadores de audio, video e imagem (ContentRenderer) e o MarkdownBlock
// liam so "url"/"uri"/"src". Material gravado com "arquivo_url" - que e como o
// banco grava - simplesmente DESAPARECIA nesses tipos: o helper devolvia null e
// nada era renderizado, sem mensagem nenhuma pro aluno.
//
// Uma lista so, num lugar so, e todos os tipos passam a achar a midia.

type LooseRecord = Record<string, unknown>;

/** Ordem importa: a primeira chave encontrada ganha. */
const URL_KEYS = [
  "url",
  "uri",
  "src",
  "arquivo_url",
  "arquivoUrl",
  "file_url",
  "fileUrl",
  "documento_url",
  "documentoUrl",
  "audio_url",
  "audioUrl",
  "publicUrl",
  "public_url",
  "signedUrl",
  "storage_path",
  "storagePath",
] as const;

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function pickString(record: LooseRecord | null, keys: readonly string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const valor = record[key];
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return null;
}

/**
 * Resolve a URL/caminho da midia num payload de bloco, olhando (nesta ordem):
 * o proprio payload, o metadata dele, e a primeira parte de "partes" - material
 * gerado em varias partes guarda a parte 1 la, e o campo de cima pode estar
 * vazio.
 *
 * Devolve string vazia como null: campo presente e vazio nao e URL.
 */
export function resolveMediaUrl(payload: unknown): string | null {
  if (typeof payload === "string") {
    return payload.trim() || null;
  }

  const record = asRecord(payload);
  if (!record) return null;

  const direto = pickString(record, URL_KEYS);
  if (direto) return direto;

  const doMetadata = pickString(asRecord(record.metadata), URL_KEYS);
  if (doMetadata) return doMetadata;

  const partes = Array.isArray(record.partes) ? record.partes : null;
  if (partes && partes.length > 0) {
    const primeira = pickString(asRecord(partes[0]), URL_KEYS);
    if (primeira) return primeira;
  }

  return null;
}

/** Texto exibivel de um bloco de texto/markdown, com os mesmos apelidos. */
export function resolveMediaText(payload: unknown): string | null {
  if (typeof payload === "string") return payload.trim() || null;

  const record = asRecord(payload);
  if (!record) return null;

  return pickString(record, ["texto", "markdown", "conteudo", "text", "legenda", "roteiro"]);
}

/** Rotulo curto do bloco, quando existir - usado no aviso de falha. */
export function resolveMediaTitle(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) return null;
  return pickString(record, ["titulo", "title", "legenda", "nome", "name"]);
}
