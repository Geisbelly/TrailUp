import { useSyncExternalStore } from "react";

import {
  assinarEstadoConsentimento,
  obterEstadoConsentimento,
} from "@/services/consentimentoResponsavelApi";
import type { EstadoConsentimento } from "@/utils/consentimentoResponsavel";

/** O ultimo estado de consentimento que o servidor devolveu (#195). */
export function useEstadoConsentimento(): EstadoConsentimento {
  return useSyncExternalStore(assinarEstadoConsentimento, obterEstadoConsentimento, obterEstadoConsentimento);
}
