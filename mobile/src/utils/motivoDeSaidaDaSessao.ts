import type { TelemetryFlushReason } from "@/interfaces/telemetria/TelemetryContracts";

/**
 * Por que a sessão de estudo terminou.
 *
 * `endStudySession` traduz isto num evento: `session_end` quando o motivo é
 * `session_end`, e `session_interrupt` para qualquer outro. O único chamador
 * fora do contexto passava **sempre** `"screen_blur"`, então `session_end`
 * nunca acontecia -- e sair da tela do tópico, que é a forma normal de terminar
 * de estudar, era registrado como interrupção.
 *
 * ## O que isso fazia com a métrica do professor
 *
 * `vw_metricas_comportamento_aluno_classe` conta `interrupcoes_sessao` como
 * `explicit_interrupt OR topicos_abertos > topicos_concluidos`. Medido nesta
 * base:
 *
 *     sessões                                106
 *     com o sinal explícito                  105
 *     pela heurística                        105
 *     como a view conta (as duas)            106
 *
 * **106 de 106.** Não é uma métrica, é uma constante -- e uma constante que diz
 * ao professor que todo mundo se interrompe o tempo todo.
 *
 * A heurística não era a causa: ela acrescentava exatamente 1 sessão sobre o
 * sinal explícito. A causa é o sinal explícito disparar em toda saída.
 *
 * ## A regra
 *
 * Sair de um tópico **concluído** não é interrupção: é o fim natural do
 * trabalho. Sair de um tópico em andamento é. A tela sabe a diferença; a view
 * não tem como saber, e foi por isso que ela tentou adivinhar.
 */
export function motivoDeSaidaDaSessao(
  topicoConcluido: boolean,
): TelemetryFlushReason {
  return topicoConcluido ? "session_end" : "screen_blur";
}

/**
 * `true` quando a saída deve contar como interrupção.
 *
 * Espelha o que `endStudySession` faz com o motivo, para o teste poder afirmar
 * a consequência e não só o rótulo.
 */
export function saidaContaComoInterrupcao(motivo: TelemetryFlushReason): boolean {
  return motivo !== "session_end";
}
