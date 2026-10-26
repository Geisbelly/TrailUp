/**
 * Manda uma decisao do termo do aluno para `consentimento_telemetria` (#339).
 *
 * Antes so o Gate chamava isto, entao mudar um toggle em Perfil > Coleta e
 * acessos ficava so no aparelho ate a proxima abertura do app (#195). Agora o
 * Gate e o Perfil chamam a mesma funcao, na hora.
 *
 * Nao bloqueia a UI: o registro local governa a coleta, e esta linha e a
 * prova. Falha vira aviso e o Gate tenta de novo na proxima montagem.
 */

import { Platform } from "react-native";

import { supabase } from "@/database/supabase";
import {
  registrarConsentimento,
  TABELA_DE_CONSENTIMENTO,
} from "@/services/consentimentoRemoto";
import type { TelemetryConsentRecord } from "@/utils/telemetryConsent";

export async function registrarConsentimentoTelemetriaNoServidor(
  record: TelemetryConsentRecord | null | undefined
): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const resultado = await registrarConsentimento({
      inserir: (linha) => supabase.from(TABELA_DE_CONSENTIMENTO).insert(linha),
      record,
      alunoId: data.user?.id ?? null,
      origem: { plataforma: Platform.OS },
    });
    if (!resultado.ok) {
      console.warn("[Consentimento] nao registrado no servidor:", resultado.detalhe);
    }
  } catch (erro) {
    console.warn("[Consentimento] falha ao registrar no servidor:", erro);
  }
}
