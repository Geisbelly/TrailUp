/**
 * O modo foco como o aparelho o conhece (#149).
 *
 * Quem decide a entrega é o banco: em foco, a fila segura e o push não sai. Mas com o app
 * aberto duas coisas não passam por lá — o toast do Realtime (chat e convite entram direto
 * na caixa de entrada) e o banner da notificação local agendada (revisão diária). As duas
 * perguntam aqui. Só o foco ligado pelo aluno chega ao aparelho; o foco por atenção fica
 * no banco.
 */
let focoAteMs: number | null = null;

export function lembrarFoco(estado: { ate: string | null } | null | undefined) {
  const ate = estado?.ate ? Date.parse(estado.ate) : NaN;
  focoAteMs = Number.isFinite(ate) ? ate : null;
}

export function emFocoNoAparelho(agoraMs: number = Date.now()) {
  return focoAteMs !== null && agoraMs < focoAteMs;
}
