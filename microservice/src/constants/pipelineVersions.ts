import { createHash } from "crypto";

/**
 * Contrato público entre a ApiTraiUp e este microserviço.
 *
 * Alterações incompatíveis no pipeline ou no renderizador de apresentações
 * devem incrementar estas versões antes do deploy.
 */
export const MEDIA_PIPELINE_VERSION = "2026-07-28.3" as const;
export const PRESENTATION_ENGINE_VERSION = "puppeteer-html-v2" as const;
export const PRESENTATION_SCHEMA_VERSION = "presentation-material-v2" as const;

export function getRenderGitCommit(
  environment: NodeJS.ProcessEnv = process.env,
): string | null {
  const commit = environment.RENDER_GIT_COMMIT?.trim();
  return commit || null;
}

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

export function buildPresentationVersionMetadata(generationKey: string) {
  return {
    engine: PRESENTATION_ENGINE_VERSION,
    schema: PRESENTATION_SCHEMA_VERSION,
    media_pipeline_version: MEDIA_PIPELINE_VERSION,
    generation_key: generationKey,
  };
}
