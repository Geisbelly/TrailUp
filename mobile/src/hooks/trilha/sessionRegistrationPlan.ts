import type { StudyInterval } from '@/utils/studyClock';

export type SessionRegistrationPlan = {
  scope: 'content' | 'activity';
  topicoId: number;
  conteudoId: number | null;
  atividadeId: number | null;
  startedAtMs: number;
  endedAtMs: number;
};

/**
 * O intervalo real de abertura/fechamento (StudyClock) é a fonte de verdade
 * para tempo_gasto_min (20260921_01) — o que decide QUAIS sessões registrar
 * é puramente o que o bloco carrega, então fica num módulo sem dependência
 * de react-native para ser testável com node:test (useStudyTimeTracking.ts
 * importa AppState, e isso quebra o esbuild fora do Metro).
 */
export function planSessionRegistrations(interval: StudyInterval): SessionRegistrationPlan[] {
  const { block, startedAtMs, endedAtMs } = interval;
  const plans: SessionRegistrationPlan[] = [];
  if (block.conteudoId != null && block.conteudoId > 0) {
    plans.push({ scope: 'content', topicoId: block.topicoId, conteudoId: block.conteudoId, atividadeId: null, startedAtMs, endedAtMs });
  }
  if (block.atividadeId != null && block.atividadeId > 0) {
    plans.push({ scope: 'activity', topicoId: block.topicoId, conteudoId: null, atividadeId: block.atividadeId, startedAtMs, endedAtMs });
  }
  return plans;
}
