/**
 * As RPCs da questão corrigida no banco (`20261108_01`). Ver `questaoNoBanco.core.ts`.
 *
 * Erros sobem como vieram: `prazo_expirado` é traduzido por `mensagemDaRecusa`, como antes,
 * quando a recusa vinha do INSERT direto em `questao_aluno`.
 */

import { supabase } from "@/database/supabase";

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
