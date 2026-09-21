import assert from 'node:assert/strict';
import test from 'node:test';
import { canShowQuestionAnswer, getQuestionPreviousAnswer, hasQuestionAttempt, questionActivityScope } from './questionAnswerVisibility';

test('resposta-resumo da atividade não responde outras questões', () => {
  const activity = { resposta_aluno: 'A', questoes: [{ id: 1, resposta_aluno: 'A' }, { id: 2 }] };
  assert.equal(getQuestionPreviousAnswer(activity.questoes[0], activity), 'A');
  assert.equal(getQuestionPreviousAnswer(activity.questoes[1], activity), null);
  assert.equal(getQuestionPreviousAnswer({ id: 1 }, { ...activity, questoes: [{ id: 1 }] }), 'A');
});

test('atividade concluída ou botão herdado não revela questão sem tentativa', () => {
  for (const immediate of [true, false]) for (const requested of [true, false]) {
    assert.equal(canShowQuestionAnswer({ attempted: false, confirmed: false, retrying: false, immediate, requested, reviewing: true }), false);
  }
  assert.equal(hasQuestionAttempt({}, null), false);
  assert.equal(hasQuestionAttempt({}, ''), false);
  assert.equal(hasQuestionAttempt({}, false), true);
  assert.equal(hasQuestionAttempt({ ultima_tentativa: 1 }, null), true);
});

test('nova tentativa esconde gabarito inclusive em atividade já concluída', () => {
  assert.equal(canShowQuestionAnswer({ attempted: true, confirmed: true, retrying: true, immediate: true, requested: true, reviewing: true }), false);
  assert.equal(canShowQuestionAnswer({ attempted: true, confirmed: true, retrying: false, immediate: true, requested: false, reviewing: false }), true);
  assert.equal(canShowQuestionAnswer({ attempted: true, confirmed: true, retrying: false, immediate: false, requested: false, reviewing: false }), false);
});

test('troca de atividade/conta/perfil/questões reinicia estado; progresso não', () => {
  const a = { id: 1, questoes: [{ id: 5, enunciado: 'Questão?', alternativas: ['A', 'B'] }] };
  const scope = questionActivityScope(a, 'aluno', 'seeker', 131);
  assert.equal(questionActivityScope({ ...a, resposta_aluno: 'A' }, 'aluno', 'seeker', 131), scope);
  assert.notEqual(questionActivityScope({ ...a, id: 2 }, 'aluno', 'seeker', 131), scope);
  assert.notEqual(questionActivityScope(a, 'outro', 'seeker', 131), scope);
  assert.notEqual(questionActivityScope(a, 'aluno', 'achiever', 131), scope);
  assert.notEqual(questionActivityScope({ ...a, questoes: [...a.questoes, { id: 6, enunciado: 'Nova?', alternativas: [] }] }, 'aluno', 'seeker', 131), scope);
});
