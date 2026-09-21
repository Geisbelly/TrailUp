import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeStudyDates } from './studyPresence';

test('presença usa os sete dias do calendário, não o histórico inteiro', () => {
  const now = new Date(2026, 8, 20, 12);
  const summary = summarizeStudyDates([
    new Date(2026, 8, 12, 12).toISOString(),
    new Date(2026, 8, 14, 0, 5).toISOString(),
    new Date(2026, 8, 20, 9).toISOString(),
    new Date(2026, 8, 20, 10).toISOString(),
  ], now);
  assert.equal(summary.dias_ativos, 2);
  assert.deepEqual(summary.semana_diaria, [1, 0, 0, 0, 0, 0, 2]);
  assert.equal(summary.ultimo_registro, new Date(2026, 8, 20, 10).toISOString());
});

test('ignora datas inválidas/futuras e registros duplicados', () => {
  const now = new Date(2026, 8, 20, 12);
  const timestamp = new Date(2026, 8, 20, 10).toISOString();
  assert.equal(summarizeStudyDates([null, 'invalid', timestamp, timestamp, '2099-01-01'], now).registros_recentes, 1);
});
