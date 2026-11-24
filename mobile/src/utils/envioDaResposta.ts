/**
 * O envio da resposta de uma questão (botão "Confirmar resposta").
 *
 * Dois defeitos faziam o toque "não fazer nada":
 * - a chamada ao banco não tinha limite: com a rede ruim, o `rpc` ficava pendurado e a tela não
 *   mudava;
 * - qualquer falha depois do modal (concluir a atividade, guardar o estado local) subia sem dono e
 *   sumia como promessa rejeitada.
 *
 * Aqui ficam as peças puras: o limite de espera, a trava contra toque duplo (toque duplo gravava
 * duas respostas, e a segunda vinha com a regra de resposta repetida, valendo metade) e a mensagem
 * de falha.
 */

/** Quanto o app espera o banco corrigir e gravar uma resposta antes de desistir e avisar. */
export const LIMITE_DO_ENVIO_MS = 20_000;

export class TempoDoEnvioEsgotado extends Error {
  readonly code = "tempo_esgotado";
  constructor(rotulo: string, ms: number) {
    super(`${rotulo}: sem resposta em ${Math.round(ms / 1000)} s`);
    this.name = "TempoDoEnvioEsgotado";
  }
}

/** A promessa, ou `TempoDoEnvioEsgotado` se ela não terminar em `ms`. O relógio é sempre limpo. */
export async function comLimiteDeTempo<T>(promessa: PromiseLike<T>, ms: number, rotulo: string): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promessa),
      new Promise<never>((_, rejeitar) => {
        relogio = setTimeout(() => rejeitar(new TempoDoEnvioEsgotado(rotulo, ms)), ms);
      }),
    ]);
  } finally {
    if (relogio !== undefined) clearTimeout(relogio);
  }
}

/**
 * Roda `tarefa` só se nenhuma outra estiver em curso. Devolve `false` quando o toque foi ignorado.
 * A trava é síncrona (um `ref`, não estado do React): dois toques no mesmo quadro veem o mesmo
 * estado antigo, e só o `ref` impede o segundo.
 */
export async function enviarUmaVez(
  trava: { current: boolean },
  tarefa: () => Promise<void>,
  aoMudar?: (enviando: boolean) => void,
): Promise<boolean> {
  if (trava.current) return false;
  trava.current = true;
  aoMudar?.(true);
  try {
    await tarefa();
  } finally {
    trava.current = false;
    aoMudar?.(false);
  }
  return true;
}

export function envioEsgotado(erro: unknown): boolean {
  return erro instanceof TempoDoEnvioEsgotado || (erro as { code?: unknown } | null)?.code === "tempo_esgotado";
}

/** O texto do modal quando a resposta não chegou ao banco. */
export function mensagemDaFalhaNoEnvio(erro: unknown): { titulo: string; descricao: string } {
  if (envioEsgotado(erro)) {
    return {
      titulo: "Sem resposta do servidor",
      descricao:
        "A conexão está lenta e sua resposta não foi confirmada. Verifique a internet e toque em Confirmar resposta de novo.",
    };
  }
  return {
    titulo: "Resposta não salva",
    descricao: "Não foi possível salvar sua resposta. Confirme novamente para tentar sincronizar.",
  };
}

/**
 * O resultado de uma questão só abre o modal se o aluno ainda está nela.
 *
 * Em 24/11 (atividade 11, web), `questao_responder` levou de 5 a 7 s, e o aluno avançou para a
 * questão seguinte enquanto esperava. O "Revise e tente de novo", com o gabarito da questão 1,
 * abriu por cima da questão 2, que ele ainda não tinha respondido: a tela parecia corrigir todas
 * com uma resposta só e marcar as outras como erradas. Fora da questão, o resultado fica só nela
 * (certo/errado e gabarito), e aparece quando o aluno volta.
 */
export function resultadoAbreModal(questaoRespondida: number, questaoNaTela: number): boolean {
  return questaoRespondida === questaoNaTela;
}

/** Trocar de questão espera o envio em curso: é a outra metade da mesma correção. */
export function podeTrocarDeQuestao(params: { enviando: boolean; destino: number; total: number }): boolean {
  return !params.enviando && params.destino >= 0 && params.destino < params.total;
}

/** Com mais de uma questão, o modal diz de qual questão é o resultado. */
export function tituloDoResultado(titulo: string, indice: number, total: number): string {
  return total > 1 ? `Questão ${indice + 1}: ${titulo}` : titulo;
}

/** O texto quando a resposta foi gravada, mas concluir a atividade falhou. */
export function mensagemDaFalhaNaConclusao(erro: unknown): string {
  return envioEsgotado(erro)
    ? "Sua resposta foi salva, mas a conexão caiu antes de a atividade ser concluída. Abra a atividade de novo com internet para concluir."
    : "Sua resposta foi salva, mas não conseguimos concluir a atividade agora. Abra a atividade de novo para concluir.";
}
