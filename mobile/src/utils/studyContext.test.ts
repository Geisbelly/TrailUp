import assert from 'node:assert/strict';
import test from 'node:test';
import { initialStudyContext } from './studyContext';
import { accumulateContextTime, buildEmptyBatch, EMPTY_STUDY_CONTEXT } from '../context/metricas/acumuladorLote';
import { formatStudyMinutes } from './studyTimeFormat';

test('sessão iniciada após abrir atividade preserva tópico/conteúdo/atividade ativos', () => {
  const current = { ...EMPTY_STUDY_CONTEXT, topicoId: 131, conteudoId: 192, atividadeId: 1068, studyState: 'active' as const };
  const batch = buildEmptyBatch(0);
  accumulateContextTime(batch, initialStudyContext(131, current), 60_000, 0);
  assert.equal(batch.timeMetrics.topics['topic:131'].activeMs, 60_000);
  assert.equal(batch.timeMetrics.contents['content:192'].activeMs, 60_000);
  assert.equal(batch.timeMetrics.activities['activity:1068'].activeMs, 60_000);
});
test('nova sessão em outro tópico não herda conteúdo da anterior', () => {
  assert.deepEqual(initialStudyContext(133, { ...EMPTY_STUDY_CONTEXT, topicoId: 131, conteudoId: 192, studyState: 'active' }), { ...EMPTY_STUDY_CONTEXT, topicoId: 133 });
});
test('tempo abaixo de um minuto aparece em segundos, não 0 min', () => {
  assert.equal(formatStudyMinutes(0.02), '1s');
  assert.equal(formatStudyMinutes(0.48), '29s');
  assert.equal(formatStudyMinutes(2.5), '2min 30s');
  assert.equal(formatStudyMinutes(61), '1h 1min');
  assert.equal(formatStudyMinutes(NaN), '0s');
});
