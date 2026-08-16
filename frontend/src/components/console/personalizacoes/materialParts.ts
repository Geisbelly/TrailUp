import type { MaterialRecord } from "./materialPreview";

// Uma parte entregavel de um material (ver MaterialPart no microservice,
// supabaseService.ts) - cada midia (audio/markdown/apresentacao) pode ter
// varias partes quando o conteudo foi dividido em blocos maiores que um
// unico arquivo (ver splitProcessedContentIntoParts). arquivo_url/
// storage_path no nivel do material continuam apontando so pra parte 1,
// por compatibilidade - "partes" e o jeito novo de expor todas.
export interface MaterialPartInfo {
  ordem: number;
  titulo: string | null;
  arquivo_url: string | null;
  storage_path: string | null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePartEntry(raw: unknown, index: number): MaterialPartInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  return {
    ordem: typeof record.ordem === "number" ? record.ordem : index + 1,
    titulo: stringOrNull(record.titulo),
    arquivo_url: stringOrNull(record.arquivo_url),
    storage_path: stringOrNull(record.storage_path),
  };
}

/**
 * Normaliza um material pra um array uniforme de partes, sempre com pelo
 * menos 1 item quando o material existe. Registros antigos (sem "partes",
 * de antes da geracao multi-parte) caem no fallback: sintetiza 1 parte a
 * partir dos campos top-level arquivo_url/storage_path - o consumidor
 * (MaterialTabContent) nunca precisa saber a diferenca entre um material
 * antigo de parte unica e um novo com 1 parte so.
 */
export function getMaterialPartes(material: MaterialRecord | null): MaterialPartInfo[] {
  if (!material) return [];

  const raw = material.partes;
  if (Array.isArray(raw)) {
    const normalized = raw
      .map((item, index) => normalizePartEntry(item, index))
      .filter((item): item is MaterialPartInfo => item !== null)
      .sort((a, b) => a.ordem - b.ordem);
    if (normalized.length > 0) return normalized;
  }

  return [
    {
      ordem: 1,
      titulo: null,
      arquivo_url: stringOrNull(material.arquivo_url),
      storage_path: stringOrNull(material.storage_path),
    },
  ];
}
