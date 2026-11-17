/**
 * Quantas vezes o relógio de estudo pode mandar a tela reler a turma.
 *
 * A cada 60 s, `useStudyTimeTracking` fecha o intervalo e grava a visita
 * (`registrarTempoConteudo`/`Atividade`/`Topico` em `TrilhaContext`). Cada
 * gravação relia o tópico (`vw_aluno_classe_detalhado`) e o progresso da
 * turma (`vw_aluno_classe_resumo`, ranking, XP, presença): duas a três
 * recargas completas por minuto, para sempre, enquanto o aluno estivesse
 * com um material aberto — mesmo parado.
 *
 * O tempo passar não muda percentual nem status: esses só mudam quando o
 * aluno conclui algo, e esses caminhos (`marcarConteudoVisto`,
 * `registrarAtividadeConcluida`, `salvarProgressoItemPersonalizado`…)
 * continuam relendo na hora. O que a visita muda é o tempo exibido, e ele
 * pode esperar alguns minutos.
 *
 * Em 17/11/2026 um único aparelho com o texto aberto por horas manteve esse
 * ciclo contra a produção. Na instância nano as views passaram a estourar o
 * `statement_timeout`, os jobs do pg_cron de minuto em minuto se
 * sobrepuseram, as conexões foram de ~11 a ~32, a memória foi para o swap e
 * o banco parou de responder até o restart.
 *
 * A primeira visita de cada chave relê na hora (a tela mostra o tópico
 * iniciado sem esperar); as seguintes, no máximo uma vez por intervalo.
 */
export const INTERVALO_RECARGA_POR_TEMPO_MS = 5 * 60_000;

export type LimitadorDeRecarga = (chave: string, agoraMs: number) => boolean;

export function criarLimitadorDeRecarga(
  intervaloMs: number = INTERVALO_RECARGA_POR_TEMPO_MS
): LimitadorDeRecarga {
  const ultima = new Map<string, number>();
  return (chave, agoraMs) => {
    const anterior = ultima.get(chave);
    // Relógio voltou (ajuste do aparelho): recarrega e recomeça a contar,
    // senão a chave ficaria travada até o relógio alcançar o valor antigo.
    if (anterior != null && agoraMs >= anterior && agoraMs - anterior < intervaloMs) {
      return false;
    }
    ultima.set(chave, agoraMs);
    return true;
  };
}

export function chaveRecargaTopico(alunoId: string, classeId: number, topicoId: number) {
  return `topico:${alunoId}:${classeId}:${topicoId}`;
}

export function chaveRecargaClasse(alunoId: string, classeId: number) {
  return `classe:${alunoId}:${classeId}`;
}
