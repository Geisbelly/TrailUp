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
 *
 * Decide pelo `itemKind`, não por "quais ids estão preenchidos": um bloco de
 * ATIVIDADE vinculado a um conteúdo carrega `conteudoId` (o
 * `vinculadoConteudoId` de `[id].tsx`) só como referência, não porque o aluno
 * esteja consumindo aquele conteúdo em paralelo. Checar os dois ids de forma
 * independente registrava a MESMA sessão duas vezes, uma como 'content' e
 * outra como 'activity' — os dois com o mesmo aberto_em/fechado_em.
 */
export function planSessionRegistrations(interval: StudyInterval): SessionRegistrationPlan[] {
  const { block, startedAtMs, endedAtMs } = interval;
  // 'cards' é um bloco de CONTEÚDO (personalizationKind === 'cards' em
  // [id].tsx) — carrega conteudoId, nunca atividadeId. Conta como 'content'.
  if (
    (block.itemKind === 'content' || block.itemKind === 'cards') &&
    block.conteudoId != null && block.conteudoId > 0
  ) {
    return [{ scope: 'content', topicoId: block.topicoId, conteudoId: block.conteudoId, atividadeId: null, startedAtMs, endedAtMs }];
  }
  if (block.itemKind === 'activity' && block.atividadeId != null && block.atividadeId > 0) {
    return [{ scope: 'activity', topicoId: block.topicoId, conteudoId: null, atividadeId: block.atividadeId, startedAtMs, endedAtMs }];
  }
  return [];
}
