type Question = { id?: unknown; enunciado?: unknown; tipo?: unknown; alternativas?: unknown; resposta_aluno?: unknown; ultima_tentativa?: unknown };
type Activity = { id?: unknown; topico_id?: unknown; tipo?: unknown; titulo?: unknown; resposta_aluno?: unknown; questoes?: Question[] };

export function getQuestionPreviousAnswer(question: Question | undefined, activity: Activity): unknown {
  // O resumo da atividade contém a resposta de UMA questão, não de todas.
  return question?.resposta_aluno ?? (activity.questoes?.length === 1 ? activity.resposta_aluno : null) ?? null;
}

export function hasQuestionAttempt(question: Question | undefined, previousAnswer: unknown): boolean {
  return (previousAnswer != null && String(previousAnswer).trim().length > 0)
    || Number(question?.ultima_tentativa ?? 0) > 0;
}

export function canShowQuestionAnswer(state: {
  attempted: boolean;
  confirmed: boolean;
  retrying: boolean;
  immediate: boolean;
  requested: boolean;
  reviewing: boolean;
}): boolean {
  if (state.retrying || (!state.attempted && !state.confirmed)) return false;
  return state.requested || (state.immediate && (state.confirmed || state.reviewing));
}

/** Progresso não remonta a atividade, mas outra conta/questão/atividade sim. */
export function questionActivityScope(activity: Activity, userId?: string, profile?: string | null, topicId?: number): string {
  return JSON.stringify([
    userId, profile, topicId ?? activity.topico_id, activity.id ?? activity.titulo, activity.tipo,
    (activity.questoes ?? []).map((question) => [question.id, question.enunciado, question.tipo, question.alternativas]),
  ]);
}
