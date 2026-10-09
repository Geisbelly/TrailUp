/**
 * Contrato público entre a ApiTraiUp e este microserviço.
 *
 * SEM import de módulo do Node, de propósito: `presentationThemes.ts` importa
 * `PRESENTATION_DESIGN_VERSION` daqui, e ele é alcançado pelo bundle do
 * navegador (`main.tsx` -> `App.tsx` -> `geminiService.ts` ->
 * `presentationThemes.ts`). Um `import ... from "crypto"` no topo quebrava o
 * `vite build` inteiro com "createHash is not exported by
 * __vite-browser-external". As funções que precisam de hash moram em
 * `generationStorage.ts`.
 *
 * Alterações incompatíveis no pipeline ou no renderizador de apresentações
 * devem incrementar estas versões antes do deploy.
 */
export const MEDIA_PIPELINE_VERSION = "2026-09-27.1" as const;
export const PRESENTATION_ENGINE_VERSION = "brainhexpdf-v1" as const;
export const PRESENTATION_SCHEMA_VERSION = "presentation-material-v3" as const;
export const PRESENTATION_DESIGN_VERSION = "slidesgo-editorial-v3" as const;
export const CONTENT_ENRICHMENT_PROVIDER = "openai" as const;

export function getRenderGitCommit(
  environment: NodeJS.ProcessEnv = process.env,
): string | null {
  const commit = environment.RENDER_GIT_COMMIT?.trim();
  return commit || null;
}

export function buildPresentationVersionMetadata(generationKey: string) {
  return {
    engine: PRESENTATION_ENGINE_VERSION,
    schema: PRESENTATION_SCHEMA_VERSION,
    design_system: PRESENTATION_DESIGN_VERSION,
    media_pipeline_version: MEDIA_PIPELINE_VERSION,
    generation_key: generationKey,
  };
}
