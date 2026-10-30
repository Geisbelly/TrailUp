import type { TelemetryFlushReason } from '../../interfaces/telemetria/TelemetryContracts';

/**
 * Decisões puras sobre o fim da sessão de estudo, fora do contexto para serem
 * testáveis sem React Native (por isso os estados são strings, não
 * `AppStateStatus`).
 */

export type TransicaoAppState = 'encerrar' | 'retomar' | 'salvar' | 'nada';

/**
 * Só `background` encerra a sessão. No iOS, `inactive` é passagem (central de
 * controle, cortina de notificações, seletor de apps) e o app volta em
 * segundos: em produção, 27 de 71 sessões fechadas por `app_background`
 * reabriram em menos de 3 s.
 *
 * `salvar` (active→inactive) não encerra nada: manda o lote acumulado (até
 * 60 s) para a fila de envio. No iOS, deslizar o app para fora no seletor de
 * apps mata o processo estando `inactive`, sem passar por `background`; sem
 * isto o que estava só na memória se perdia. A sessão continua aberta e o
 * lote se funde a um `interval` pendente.
 *
 * `retomar` cobre `background→active` e também `inactive→active` (na volta
 * pelo seletor de apps o iOS passa por `inactive`). Quem impede retomar em
 * cima de uma sessão viva é a guarda do contexto
 * (`!sessionRef.current && resumeDescriptorRef.current`), não esta função.
 */
export function decidirTransicaoAppState(anterior: string, proximo: string): TransicaoAppState {
  if (proximo === 'background' && anterior !== 'background') return 'encerrar';
  if (anterior === 'active' && proximo === 'inactive') return 'salvar';
  if (proximo === 'active' && anterior !== 'active') return 'retomar';
  return 'nada';
}

/**
 * Só o app indo para segundo plano é uma interrupção (a sessão pode ser
 * retomada). Sair da tela normalmente (`screen_blur`) é o fim da sessão.
 */
export function eventoDeFim(motivo: TelemetryFlushReason): 'session_end' | 'session_interrupt' {
  return motivo === 'app_background' ? 'session_interrupt' : 'session_end';
}

/**
 * A câmera só amostra com o app em primeiro plano. Como `inactive` não encerra
 * mais a sessão, o timer de quadros continua rodando durante ligação, central
 * de controle, cortina de notificações ou Face ID, e capturar ali seria usar a
 * câmera fora do primeiro plano (consentimento) e alimentar a análise de
 * emoção com um aluno que não está estudando.
 */
export function podeCapturarQuadro(appState: string): boolean {
  return appState === 'active';
}
