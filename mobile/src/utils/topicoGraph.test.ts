import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraphFromTopicos, isTopicoUnlockedLocal } from './topicoGraph';
import { isTopicoConcluido, progressoCanonicoTopico } from './topicoProgress';

const topic = (id: number, percentual = 0, depende: number[] = []) => ({
  id, ordem: id, nome: `Aula ${id}`, percentual_concluido: percentual, depende, next: [] as number[],
});

test('tópicos sem pré-requisitos ficam abertos, mantendo a sequência visual', () => {
  const graph = buildGraphFromTopicos({ topicos: [topic(1), topic(2), topic(3)] });
  assert.deepEqual(graph.unlocked, ['1', '2', '3']);
  assert.deepEqual(graph.nodes[0].next, ['2']);
  assert.ok(graph.nodes.every((node) => !node.locked && !node.completed));
});

test('todas as dependências reais devem estar concluídas', () => {
  const topics = [topic(1, 100), topic(2, 50), topic(3, 0, [1, 2])];
  assert.equal(isTopicoUnlockedLocal(topics[2], topics), false);
  topics[1].percentual_concluido = 100;
  assert.equal(isTopicoUnlockedLocal(topics[2], topics), true);
});

test('dependência ausente não é considerada concluída', () => {
  assert.deepEqual(buildGraphFromTopicos({ topicos: [topic(2, 0, [1])] }).unlocked, []);
});

test('ligações next cadastradas são respeitadas na navegação e no grafo', () => {
  const topics = [{ ...topic(1), next: [2] }, topic(2)];
  assert.equal(isTopicoUnlockedLocal(topics[1], topics), false);
  topics[0].percentual_concluido = 100;
  assert.equal(isTopicoUnlockedLocal(topics[1], topics), true);
});

test('cache personalizado incompleto não revoga conclusão do Supabase', () => {
  const topics = [topic(125, 100), topic(128, 100), topic(129, 100), topic(130, 100)];
  const graph = buildGraphFromTopicos({ topicos: topics }, new Set([125, 128, 129, 130]));
  assert.equal(graph.unlocked.length, 4);
  assert.ok(graph.nodes.every((node) => node.completed && !node.locked));
});

test('tópico concluído permanece acessível mesmo com dependência pendente', () => {
  assert.equal(isTopicoUnlockedLocal(topic(2, 100, [1]), [topic(1), topic(2, 100, [1])]), true);
});

test('material do professor feito não sobrescreve percentual canônico zero', () => {
  assert.equal(isTopicoConcluido({ ...topic(1), conteudos: [{ status: 'concluido' }] }), false);
});

test('percentual parcial prevalece sobre um status de cache inconsistente', () => {
  assert.equal(progressoCanonicoTopico({ status: 'concluido', percentual_concluido: 35 }), 35);
  assert.equal(isTopicoConcluido({ status: 'concluido', percentual_concluido: 35 }), false);
});

test('status concluído sem percentual é aceito; projeção ausente continua desconhecida', () => {
  assert.equal(progressoCanonicoTopico({ status: 'concluído' }), 100);
  assert.equal(progressoCanonicoTopico({ percentual_concluido: null }), null);
});
