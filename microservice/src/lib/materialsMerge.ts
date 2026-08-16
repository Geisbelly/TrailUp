// Lógica pura de merge de conteudo_personalizado.materiais.
//
// Esta função é a fonte canônica para o cálculo. Tanto o fallback JS em
// supabaseService.ts:mergePersonalizacaoMateriais quanto a função PL/pgSQL
// public.merge_personalizacao_materiais (sql/migrations/0001_*.sql) devem
// produzir o MESMO resultado. Se a lógica mudar aqui, atualize a SQL.

import type { MaterialPart } from "../services/supabaseService";

export interface MaterialEntryLike {
  metadata?: { status?: string; generation_key?: string };
}

export type MaterialsMap = Record<string, MaterialEntryLike>;

export interface MergeResult {
  merged:    MaterialsMap;
  newStatus: string;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "failed_quality"]);

/**
 * Computa o novo estado de `materiais` + `status` agregado.
 *
 * - Updates para formatos com `metadata.status === "completed"` são descartados
 *   (proteção contra sobrescrever artefatos finalizados).
 * - `newStatus`:
 *   - se já era "pronto" → continua "pronto" (sticky)
 *   - se TODOS os artefatos finais (após merge) estão em status terminal → "pronto"
 *   - se algum está "pending" → "processando_midias"
 *   - caso contrário → mantém o currentStatus
 */
export function computeMergedMaterials(
  current:       MaterialsMap | null | undefined,
  updates:       MaterialsMap,
  currentStatus: string
): MergeResult {
  const base = current ?? {};

  const filteredUpdates: MaterialsMap = {};
  for (const [fmt, entry] of Object.entries(updates)) {
    const currentMetadata = base[fmt]?.metadata;
    const incomingGeneration = entry?.metadata?.generation_key;
    if (
      currentMetadata?.status === "completed"
      && currentMetadata.generation_key === incomingGeneration
    ) {
      continue;
    }
    filteredUpdates[fmt] = entry;
  }

  const merged: MaterialsMap = { ...base, ...filteredUpdates };

  const statuses = Object.values(merged)
    .map((m) => m?.metadata?.status ?? "")
    .filter(Boolean);

  const allDone     = statuses.length > 0 && statuses.every((s) => TERMINAL_STATUSES.has(s));
  const anyPending  = statuses.some((s) => s === "pending");

  const newStatus =
    currentStatus === "pronto" ? "pronto"
      : allDone                  ? "pronto"
      : anyPending               ? "processando_midias"
      : currentStatus;

  return { merged, newStatus };
}

// computeAggregatedApresentacaoEntry é duplicada deliberadamente em
// ../BrainHexPDF/src/services/materialsPersistence.ts (mesma lógica, TS dos
// dois lados — o BrainHexPDF grava direto na RPC parte a parte; este lado
// só é usado no fallback quando a chamada HTTP falha em nível de
// transporte). Se a lógica mudar aqui, atualize a cópia lá.
export function computeAggregatedApresentacaoEntry(
  currentPartes: MaterialPart[],
  novaParte: MaterialPart,
  totalPartes: number,
  currentStatus: string,
): { partes: MaterialPart[]; status: string; headline: { arquivo_url: string | null; storage_path: string | null } } {
  const mergedPartes = [...currentPartes.filter((p) => p.ordem !== novaParte.ordem), novaParte].sort(
    (a, b) => a.ordem - b.ordem,
  );

  const anyFailed = mergedPartes.some((p) => p.failed);
  const allArrived = mergedPartes.length === totalPartes;

  let status: string;
  if (anyFailed) {
    status = "failed";
  } else if (allArrived) {
    status = "completed";
  } else {
    status = currentStatus;
  }

  return {
    partes: mergedPartes,
    status,
    headline: {
      arquivo_url: mergedPartes[0]?.arquivo_url ?? null,
      storage_path: mergedPartes[0]?.storage_path ?? null,
    },
  };
}
