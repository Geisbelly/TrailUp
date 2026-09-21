import { supabase } from "@/database/supabase";

/**
 * A correção passou para o servidor.
 *
 * `questoes.resposta_correta` deixou de ser legível pelo aluno — medido antes:
 * um `SELECT` cru com o JWT dele devolvia o gabarito de todas as questões das
 * turmas em que está matriculado. Como o app corrigia localmente, a resposta
 * PRECISAVA estar no payload; enquanto isso fosse verdade, não havia como
 * fechar o vazamento.
 *
 * `questao_responder` corrige contra a tabela protegida, grava a tentativa em
 * `questao_aluno` e devolve o veredito. O gabarito volta junto — mas só
 * DEPOIS de responder, que é quando a tela precisa dele para o feedback.
 */
export type VereditoDaQuestao = {
  correta: boolean;
  tentativa: number;
  /** Só chega depois de responder. */
  respostaCorreta: string | null;
};

export async function corrigirQuestaoNoServidor(params: {
  questaoId: number;
  resposta: string;
  tempoGastoSeg?: number;
}): Promise<VereditoDaQuestao> {
  const { data, error } = await supabase.rpc("questao_responder", {
    p_questao_id: params.questaoId,
    p_resposta: params.resposta,
    p_tempo_gasto_seg: params.tempoGastoSeg ?? null,
  });
  if (error) throw error;

  const linha = (data ?? {}) as Record<string, unknown>;
  return {
    correta: linha.correta === true,
    tentativa: Number(linha.tentativa) || 1,
    respostaCorreta:
      typeof linha.resposta_correta === "string" ? linha.resposta_correta : null,
  };
}

/** Mensagem para a tela no lugar do erro cru da RPC. */
export function mensagemDeErroDaCorrecao(erro: unknown): string {
  const texto = String((erro as { message?: unknown })?.message ?? erro ?? "").toLowerCase();
  if (texto.includes("questao_sem_permissao")) return "Esta questão não é de uma turma sua.";
  if (texto.includes("questao_inexistente")) return "Esta questão não existe mais.";
  if (texto.includes("questao_sem_sessao")) return "Sua sessão expirou. Entre de novo.";
  return "Não foi possível registrar sua resposta agora.";
}
