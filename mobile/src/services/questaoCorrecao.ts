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
  /** Erros ACUMULADOS nesta questão, já contando o desta resposta. */
  erros: number;
  /**
   * O servidor liberou o gabarito? Ele libera ao acertar ou no SEGUNDO erro
   * (`20260921_05`).
   *
   * É campo próprio, e não `respostaCorreta !== null`, porque questão sem
   * linha em `questao_gabarito` também devolve nulo — e as duas coisas dizem
   * mensagens diferentes na tela: "ainda não" contra "não existe".
   */
  gabaritoLiberado: boolean;
  /** Só chega quando liberado — antes disso nem viaja na rede. */
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
  const respostaCorreta =
    typeof linha.resposta_correta === "string" ? linha.resposta_correta : null;
  return {
    correta: linha.correta === true,
    tentativa: Number(linha.tentativa) || 1,
    erros: Number(linha.erros) || 0,
    // Servidor antigo (antes da `20260921_05`) não manda o campo e mandava o
    // gabarito sempre. Deduzir dele mantém a tela funcionando contra as duas
    // versões em vez de esconder um gabarito que já chegou.
    gabaritoLiberado:
      typeof linha.gabarito_liberado === "boolean"
        ? linha.gabarito_liberado
        : respostaCorreta !== null,
    respostaCorreta,
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

/**
 * O gabarito que o aluno JÁ ganhou, sem gastar uma tentativa.
 *
 * `questao_responder` só devolve o gabarito na resposta da chamada. Quem errou
 * duas vezes, fechou o app e voltou perderia o que já tinha conquistado — e a
 * tela não tem como pedir de novo sem responder outra vez, o que gravaria uma
 * tentativa falsa em `questao_aluno`.
 *
 * Esta RPC só LÊ o que já está gravado e aplica a mesma regra do lado de lá
 * (`20260921_05`). Não insere nada.
 */
export async function gabaritoJaLiberado(questaoId: number): Promise<VereditoDaQuestao | null> {
  const { data, error } = await supabase.rpc("questao_gabarito_do_aluno", {
    p_questao_id: questaoId,
  });
  // Sem sessão, sem matrícula, ou servidor ainda sem a RPC: a tela segue sem
  // gabarito, que é o estado em que ela já sabe ficar. Silencioso de propósito
  // — isto roda ao ABRIR a questão, e um alerta aqui interromperia o aluno por
  // algo que não o impede de responder.
  if (error) return null;

  const linha = (data ?? {}) as Record<string, unknown>;
  return {
    correta: linha.correta === true,
    tentativa: Number(linha.tentativa) || 0,
    erros: Number(linha.erros) || 0,
    gabaritoLiberado: linha.gabarito_liberado === true,
    respostaCorreta:
      typeof linha.resposta_correta === "string" ? linha.resposta_correta : null,
  };
}
