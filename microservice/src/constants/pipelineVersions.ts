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
// v4 = deck HTML da #863 (cor do perfil, claro/escuro, ajustes de leitura).
// A #863 mudou o deck sem subir esta versao, e todo deck anterior continuou
// valendo como pronto (15 de 16 materiais em producao no formato antigo, 03/11).
// Mudou o HTML do deck? Suba aqui E em api/app/services/media_contract.py.
// v5 = exemplo visual didatico na cor do perfil, deck sem XP (interacoes
// chegam ao sistema como acerto) e divisao em partes em vez de scroll (04/11).
export const PRESENTATION_DESIGN_VERSION = "trailup-deck-v5" as const;
export const CONTENT_ENRICHMENT_PROVIDER = "openai" as const;

/** Revisão declarada pelo deploy; não confundir com versão do contrato de mídia. */
export function getBuildCommit(
  environment: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = environment.TRAILUP_BUILD_COMMIT?.trim() ?? "";
  return /^[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : null;
}

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
