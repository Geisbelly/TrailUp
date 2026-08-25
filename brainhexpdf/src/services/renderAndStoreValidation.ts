import { BRAIN_HEX_PROFILES } from "../data/brainHexProfiles";
import { capitalizeProfile } from "../utils/capitalizeProfile";
import type { PerfilTema } from "../types";

export interface RenderAndStoreValidationInput {
  targetProfile?: string;
  bucket?: string;
  storagePath?: string;
}

// Nao usa union discriminada por "ok" de proposito: este tsconfig nao ativa
// "strict"/strictNullChecks, e sem isso o tsc nao estreita corretamente um
// discriminated union em `if (!result.ok)` (confirmado empiricamente com
// --strict local: com strict liga, estreita; sem, nao). Um shape unico com
// campos opcionais evita depender dessa estreitagem.
export interface RenderAndStoreValidationResult {
  ok: boolean;
  error?: string;
  capitalizedProfile?: string;
  theme?: PerfilTema;
}

// Stage "validate" de /api/v1/render-and-store: as 3 checagens que precisam
// passar antes de qualquer chamada ao Gemini ou ao Storage.
export function validateRenderAndStoreInput(
  input: RenderAndStoreValidationInput,
): RenderAndStoreValidationResult {
  if (!input.targetProfile) {
    return { ok: false, error: "targetProfile é obrigatório." };
  }
  if (!input.bucket || !input.storagePath) {
    return { ok: false, error: "bucket e storagePath são obrigatórios." };
  }
  const capitalizedProfile = capitalizeProfile(input.targetProfile);
  const theme = (BRAIN_HEX_PROFILES as Record<string, PerfilTema>)[capitalizedProfile];
  if (!theme) {
    return { ok: false, error: `targetProfile inválido: ${input.targetProfile}` };
  }
  return { ok: true, capitalizedProfile, theme };
}
