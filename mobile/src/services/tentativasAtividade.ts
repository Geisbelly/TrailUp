/**
 * Tentativas de atividade pelo relógio do servidor (#136, `20261101_13`).
 *
 * `garantirTentativa` é chamado quando a atividade abre: o início que vale é o
 * do banco. `responderTentativa` grava a resposta: o banco recusa prazo vencido e
 * tentativas esgotadas, decide se foi no tempo e grava `atividade_aluno` (vale a
 * última tentativa). A pontuação continua sendo a que o app calcula; o banco só a
 * limita.
 *
 * Sem as RPCs no banco (local sem a migration), as duas devolvem `null` e quem
 * chama segue pelo caminho antigo.
 */

import { supabase } from "@/database/supabase";

import {
  TentativaRecusada,
  lerRetorno,
  lerTentativa,
  motivoDoErro,
  type RetornoTentativa,
  type TentativaAberta,
} from "./tentativasAtividade.core";

export { MENSAGEM_DA_RECUSA, TentativaRecusada, segundosRestantes } from "./tentativasAtividade.core";
export type { RetornoTentativa, TentativaAberta } from "./tentativasAtividade.core";

// Uma por atividade. O banco também devolve a aberta, então perder este mapa (app
// reaberto) não zera o relógio: a próxima chamada recebe a mesma tentativa.
const abertas = new Map<number, TentativaAberta>();
const emAndamento = new Map<number, Promise<TentativaAberta | null>>();

function falha(erro: { message?: unknown; code?: unknown } | null): null {
  const motivo = motivoDoErro(erro);
  if (motivo === "rpc_indisponivel") return null;
  if (motivo) throw new TentativaRecusada(motivo);
  throw Object.assign(new Error(String(erro?.message ?? "Falha ao falar com o servidor.")), { cause: erro });
}

export function tentativaAberta(atividadeId: number): TentativaAberta | null {
  return abertas.get(atividadeId) ?? null;
}

export function garantirTentativa(atividadeId: number): Promise<TentativaAberta | null> {
  const aberta = abertas.get(atividadeId);
  if (aberta) return Promise.resolve(aberta);
  const pendente = emAndamento.get(atividadeId);
  if (pendente) return pendente;

  const pedido = (async () => {
    const { data, error } = await supabase.rpc("atividade_iniciar_tentativa", { p_atividade: atividadeId });
    if (error) return falha(error);
    const tentativa = lerTentativa(data, Date.now());
    if (tentativa) abertas.set(atividadeId, tentativa);
    return tentativa;
  })().finally(() => emAndamento.delete(atividadeId));

  emAndamento.set(atividadeId, pedido);
  return pedido;
}

export async function responderTentativa(
  atividadeId: number,
  resposta: {
    acertosPercentual: number;
    pontuacaoObtida: number | null;
    avaliacaoMetadata: Record<string, unknown> | null;
  }
): Promise<RetornoTentativa | null> {
  // Se a abertura falhou (rede), a tentativa começa agora. O banco ainda decide
  // prazo e tentativas; só o "no tempo" fica a favor do aluno nesse caso raro.
  const tentativa = await garantirTentativa(atividadeId);
  if (!tentativa) return null;

  const { data, error } = await supabase.rpc("atividade_responder_tentativa", {
    p_tentativa: tentativa.tentativaId,
    p_acertos_percentual: resposta.acertosPercentual,
    p_pontuacao_obtida: resposta.pontuacaoObtida,
    p_avaliacao_metadata: resposta.avaliacaoMetadata,
  });
  if (error) {
    // Respondida ou perdida: a próxima abertura pede outra ao banco.
    if (/tentativa_(ja_respondida|nao_encontrada)/.test(String(error.message ?? ""))) abertas.delete(atividadeId);
    return falha(error);
  }
  abertas.delete(atividadeId);
  return lerRetorno(data);
}

/** O interruptor do aluno (`aluno_definir_cronometro`). Devolve o que ficou gravado. */
export async function definirCronometro(ligado: boolean): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("aluno_definir_cronometro", { p_ligado: ligado });
  if (error) return falha(error);
  // Tentativa aberta guardou a escolha antiga; a próxima atividade já usa a nova.
  return typeof data === "boolean" ? data : ligado;
}

/** A escolha gravada do aluno; `null` = sem escolha, vale o perfil. */
export async function lerCronometro(alunoId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("aluno_cronometro")
    .select("ligado")
    .eq("aluno_id", alunoId)
    .maybeSingle();
  if (error) return null;
  return typeof data?.ligado === "boolean" ? data.ligado : null;
}
