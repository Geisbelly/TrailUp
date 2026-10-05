import { createHash } from "crypto";

/**
 * Caminho de Storage versionado pela generation_key.
 *
 * Separado de `pipelineVersions.ts` porque aquele modulo e importado pelo
 * bundle do navegador (via `presentationThemes.ts`) e nao pode depender de
 * modulo do Node. Aqui e codigo de servidor: so `server.ts` usa.
 */

/**
 * Usa somente caracteres seguros para nomes de objetos do Storage e mantém
 * uma relação determinística 1:1 com a generation_key.
 */
export function generationStorageSegment(generationKey: string): string {
  const normalized = generationKey.trim();
  if (!normalized) {
    throw new Error("generation_key ausente para versionar o caminho de Storage");
  }
  const digest = createHash("sha256").update(normalized, "utf8").digest("hex");
  return `generation-${digest}`;
}

export function versionStoragePath(basePath: string, generationKey: string): string {
  return `${basePath.replace(/\/+$/, "")}/${generationStorageSegment(generationKey)}`;
}
