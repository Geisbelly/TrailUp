/**
 * As RPCs da questão corrigida no banco (`20261108_01`). Ver `questaoNoBanco.core.ts`.
 *
 * Erros sobem como vieram: `prazo_expirado` é traduzido por `mensagemDaRecusa`, como antes,
 * quando a recusa vinha do INSERT direto em `questao_aluno`.
 */

import { supabase } from "@/database/supabase";

import { codigoDoErroDaEdge, lerConferencia, type Conferida } from "./conferenciaNoServidor.core";
import { lerGabaritoRevelado, lerRespostaCorrigida, type GabaritoRevelado, type RespostaCorrigida } from "./questaoNoBanco.core";

export { fatorDaRegra, questaoDoBanco } from "./questaoNoBanco.core";
export type { GabaritoRevelado, RegraDaPontuacao, RespostaCorrigida } from "./questaoNoBanco.core";

export async function responderQuestao(params: {
  questaoId: number;
  resposta: string;
  tempoGastoSeg?: number | null;
}): Promise<RespostaCorrigida> {
  const { data, error } = await supabase.rpc("questao_responder", {
    p_questao_id: params.questaoId,
    p_resposta: params.resposta,
    p_tempo_gasto_seg: params.tempoGastoSeg ?? null,
  });
  if (error) throw error;
  return lerRespostaCorrigida(data);
}

export async function revelarGabarito(questaoId: number): Promise<GabaritoRevelado> {
  const { data, error } = await supabase.rpc("questao_revelar_gabarito", { p_questao_id: questaoId });
  if (error) throw error;
  return lerGabaritoRevelado(data);
}

/**
 * Numérica e expressão (spec B): a edge confere sem IA e grava pela pontuação do banco. A recusa
 * sobe com o código do corpo em `codigoDaEdge`, para `mensagemDoErroDaEdge`.
 */
export async function conferirNoServidor(params: {
  questaoId: number;
  resposta: string;
  tempoGastoSeg?: number | null;
}): Promise<Conferida> {
  const { data, error } = await supabase.functions.invoke("questao-conferir-resposta", {
    body: { questaoId: params.questaoId, resposta: params.resposta, tempoGastoSeg: params.tempoGastoSeg ?? null },
  });
  if (error) {
    (error as { codigoDaEdge?: string | null }).codigoDaEdge = await codigoDoErroDaEdge(error);
    throw error;
  }
  return lerConferencia(data);
}
