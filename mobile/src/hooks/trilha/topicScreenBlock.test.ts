import assert from 'node:assert/strict';
import test from 'node:test';
import { topicBlockFor } from './topicScreenBlock';

test('tela focada com tópico produz bloco', () => {
  assert.deepEqual(topicBlockFor(131, true), {
    key: 'topic:131', topicoId: 131, conteudoId: null, atividadeId: null,
    isPersonalizedLocal: false, itemKey: null, itemTitle: null, itemKind: 'content',
  });
});

test('tela sem foco não produz bloco', () => {
  assert.equal(topicBlockFor(131, false), null);
});

test('sem tópico não produz bloco', () => {
  assert.equal(topicBlockFor(null, true), null);
});
