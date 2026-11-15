/**
 * Manda uma decisao do termo do aluno para `consentimento_telemetria` (#339).
 *
 * Antes so o Gate chamava isto, entao mudar um toggle em Perfil > Coleta e
 * acessos ficava so no aparelho ate a proxima abertura do app (#195). Agora o
 * Gate e o Perfil chamam a mesma funcao, na hora.
 *
 * Nao bloqueia a UI: o registro local governa a coleta, e esta linha e a
 * prova. Falha vira aviso e o Gate tenta de novo na proxima montagem.
 *
 * A linha tambem e lida de volta (`lerDecisaoDaContaNoServidor`): sem ela, o
 * aparelho que nao tinha o registro local pedia o termo de novo a quem ja
 * tinha decidido.
 */

import { Platform } from "react-native";

import { supabase } from "@/database/supabase";
import {
  COLUNAS_DA_DECISAO,
  registrarConsentimento,
  registroDaDecisao,
  TABELA_DE_CONSENTIMENTO,
  type DecisaoLida,
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

/**
 * A última decisão da CONTA para a versão vigente, em registro local — ou
 * `null` (sem decisão, sem sessão, erro de rede, RLS). Nunca levanta: quem
 * chama cai no comportamento de antes, que é mostrar o termo.
 *
 * Lê direto do Supabase pela policy `consentimento_telemetria_aluno_sel`
 * (`aluno_id = auth.uid()`): o aluno só enxerga as próprias linhas.
 */
export async function lerDecisaoDaContaNoServidor(
  alunoId: string,
  versaoVigente: string
): Promise<TelemetryConsentRecord | null> {
  try {
    const { data, error } = await supabase
      .from(TABELA_DE_CONSENTIMENTO)
      .select(COLUNAS_DA_DECISAO)
      .eq("aluno_id", alunoId)
      .eq("versao", versaoVigente)
      .order("decidido_em", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[Consentimento] nao foi possivel ler a decisao da conta:", error.message);
      return null;
    }
    return registroDaDecisao(data as DecisaoLida | null, versaoVigente);
  } catch (erro) {
    console.warn("[Consentimento] falha ao ler a decisao da conta:", erro);
    return null;
  }
}
