/**
 * Consentimento do responsavel e modo restrito no app (#195).
 *
 * Fala com as RPCs da migracao 20261024_02 e guarda o ultimo estado em
 * memoria, com assinantes, para o Gate, o Perfil, o mentor e a coleta lerem a
 * MESMA resposta. Sem resposta do servidor o estado e "desconhecido", que e
 * modo restrito -- o mesmo que o servidor faz.
 */

import { supabase } from "@/database/supabase";
import {
  CONSENTIMENTO_PESQUISA_VERSAO,
  ESTADO_DESCONHECIDO,
  argumentosAceiteResponsavel,
  lerEstadoConsentimento,
  type EstadoConsentimento,
  type ParametrosAceiteResponsavel,
} from "@/utils/consentimentoResponsavel";

type Ouvinte = (estado: EstadoConsentimento) => void;

let estadoAtual: EstadoConsentimento = ESTADO_DESCONHECIDO;
let carregado = false;
const ouvintes = new Set<Ouvinte>();

function publicar(estado: EstadoConsentimento) {
  estadoAtual = estado;
  ouvintes.forEach((ouvinte) => {
    try {
      ouvinte(estado);
    } catch {
      // ouvinte quebrado nao derruba os outros
    }
  });
}

export function obterEstadoConsentimento(): EstadoConsentimento {
  return estadoAtual;
}

export function estadoConsentimentoCarregado(): boolean {
  return carregado;
}

export function assinarEstadoConsentimento(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Troca de conta / logout: volta a "desconhecido" (restrito). */
export function limparEstadoConsentimento() {
  carregado = false;
  publicar(ESTADO_DESCONHECIDO);
}

function mensagemDoErro(error: { message?: string } | null | undefined): string {
  return error?.message || "Não foi possível falar com o servidor.";
}

export async function carregarEstadoConsentimento(): Promise<EstadoConsentimento> {
  const { data, error } = await supabase.rpc("aluno_meu_consentimento");
  if (error) {
    // Mantem o que ja se sabia; se nunca carregou, continua restrito.
    console.warn("[Consentimento] estado nao carregado:", error.message);
    return estadoAtual;
  }
  carregado = true;
  const estado = lerEstadoConsentimento(data);
  publicar(estado);
  return estado;
}

// Cada RPC aparece com o nome LITERAL na chamada: o portao
// `test_rpc_chamada_tem_migracao.py` so enxerga a chamada assim.
async function publicarResposta(
  resposta: PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>
): Promise<{ ok: true; estado: EstadoConsentimento } | { ok: false; erro: string }> {
  const { data, error } = await resposta;
  if (error) return { ok: false, erro: mensagemDoErro(error) };
  carregado = true;
  const estado = lerEstadoConsentimento(data);
  publicar(estado);
  return { ok: true, estado };
}

export function registrarDataNascimento(isoData: string) {
  return publicarResposta(supabase.rpc("aluno_registrar_data_nascimento", { p_data: isoData }));
}

export function registrarAceiteResponsavel(params: ParametrosAceiteResponsavel) {
  return publicarResposta(
    supabase.rpc("responsavel_registrar_no_aparelho", argumentosAceiteResponsavel(params))
  );
}

export function registrarConsentimentoPesquisa(aceito: boolean) {
  return publicarResposta(
    supabase.rpc("aluno_registrar_consentimento_pesquisa", {
      p_aceito: aceito,
      p_versao: CONSENTIMENTO_PESQUISA_VERSAO,
      p_decidido_em: new Date().toISOString(),
      p_origem: { canal: "app" },
    })
  );
}
