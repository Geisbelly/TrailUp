import assert from 'node:assert/strict';
import test from 'node:test';
import { selectResumeTopic, trailResumeKey } from './trailResume';
const nodes = [{ id: '1', sequence: 1 }, { id: '2', sequence: 2 }, { id: '3', sequence: 3, locked: true }];
test('retoma o último tópico, não o primeiro desbloqueado', () => {
  assert.equal(selectResumeTopic(nodes, [], [{ topicId: 2, visitedAt: '2026-09-20T20:00:00Z' }]), '2');
});
test('prefere a visita mais recente entre dispositivo e banco', () => {
  assert.equal(selectResumeTopic(nodes, [], [{ topicId: 2, visitedAt: '2026-09-20T21:00:00Z' }, { topicId: 1, visitedAt: '2026-09-20T20:00:00Z' }]), '2');
});
test('timestamp UTC legado não ganha três horas ao comparar com o aparelho', () => {
  assert.equal(selectResumeTopic(nodes, [], [{ topicId: 1, visitedAt: '2026-09-20T20:00:00' }, { topicId: 2, visitedAt: '2026-09-20T20:01:00Z' }]), '2');
});
test('flush atrasado do tópico anterior não tira o foco da visita atual', () => {
  assert.equal(selectResumeTopic(nodes, [{ id: 1, ultima_visualizacao: '2026-09-20T20:02:00Z' }], [{ topicId: 2, visitedAt: '2026-09-20T20:01:00Z' }]), '2');
});
test('não retoma tópico bloqueado/removido/de outra turma', () => {
  assert.equal(selectResumeTopic(nodes, [], [{ topicId: 3, visitedAt: '2026-09-20T21:00:00Z' }, { topicId: 999, visitedAt: '2026-09-21T21:00:00Z' }]), '1');
});
test('sem histórico prioriza tópico em andamento e depois disponível', () => {
  assert.equal(selectResumeTopic(nodes, [{ id: 2, percentual_concluido: 40 }]), '2');
  assert.equal(selectResumeTopic([...nodes].reverse(), []), '1');
  assert.equal(selectResumeTopic([], []), null);
});
test('revisão também é retomável; armazenamento isolado por aluno e turma', () => {
  assert.equal(selectResumeTopic(nodes.map((n) => ({ ...n, completed: true })), [], [{ topicId: 2, visitedAt: '2026-09-20T21:00:00Z' }]), '2');
  assert.notEqual(trailResumeKey('a', 54), trailResumeKey('b', 54));
  assert.notEqual(trailResumeKey('a', 54), trailResumeKey('a', 32));
});
