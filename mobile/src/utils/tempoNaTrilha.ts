/**
 * Quanto do tempo de uso foi passado dentro de um módulo da trilha.
 *
 * O heartbeat (`useMonitorDeSessao`) manda ao banco o tempo de uso do app
 * inteiro, e era só ele que alimentava a pausa saudável: 25 min no ranking, no
 * chat ou no perfil disparavam "Você já estudou bastante hoje", e o push
 * chegava em qualquer tela. Este relógio separa o pedaço daquele tempo que o
 * aluno passou num módulo da trilha (`estaNaTrilhaDeEstudo`), para a pausa
 * contar só estudo e só sair lá dentro.
 *
 * Ele não substitui o tempo de uso: missão diária, sequência e métricas
 * continuam lendo `tempo_uso_seg`. Aqui só se mede a fatia da trilha.
 */
export interface RelogioDaTrilha {
  /** A rota mudou: entrou ou saiu de um módulo da trilha. */
  definirNaTrilha(naTrilha: boolean, agoraMs: number): void;
  /**
   * O app voltou ao primeiro plano. O tempo em segundo plano não é estudo:
   * recomeça a contar daqui, sem creditar o intervalo em que ficou fechado.
   */
  retomar(agoraMs: number): void;
  /** Devolve os ms de trilha desde a última colheita e zera o acumulado. */
  colher(agoraMs: number): number;
  naTrilha(): boolean;
}

export function criarRelogioDaTrilha(): RelogioDaTrilha {
  let acumuladoMs = 0;
  // Desde quando o trecho atual na trilha está correndo; nulo fora dela.
  let desdeMs: number | null = null;

  function fecharTrecho(agoraMs: number) {
    if (desdeMs == null) return;
    acumuladoMs += Math.max(0, agoraMs - desdeMs);
    desdeMs = agoraMs;
  }

  return {
    definirNaTrilha(naTrilha, agoraMs) {
      if (naTrilha) {
        if (desdeMs == null) desdeMs = agoraMs;
        return;
      }
      fecharTrecho(agoraMs);
      desdeMs = null;
    },
    retomar(agoraMs) {
      if (desdeMs != null) desdeMs = agoraMs;
    },
    colher(agoraMs) {
      fecharTrecho(agoraMs);
      const colhido = acumuladoMs;
      acumuladoMs = 0;
      return colhido;
    },
    naTrilha: () => desdeMs != null,
  };
}
