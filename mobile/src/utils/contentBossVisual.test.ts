import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveContentBossVisual } from './contentBossVisual';

const topics = [
  { id: 1, conteudos: [{ id: 10, metadata: { boss_visual: 'boss-01' } }, { id: 11, metadata: { boss_visual: 'boss-31' } }] },
  { id: 2, conteudos: [{ id: 12, metadata: { boss_visual: null } }] },
];
test('selects the visual of each content independently', () => {
  assert.equal(resolveContentBossVisual(topics, 1, 'content:10'), 'boss-01');
  assert.equal(resolveContentBossVisual(topics, 1, 'content:11'), 'boss-31');
});
test('legacy topic encounters can resolve the enemy content id', () => {
  assert.equal(resolveContentBossVisual(topics, 1, null, 11), 'boss-31');
  assert.equal(resolveContentBossVisual(topics, 1, 'content:10', 11), 'boss-01');
});
test('automatic, missing and unrelated content keep the existing visual', () => {
  assert.equal(resolveContentBossVisual(topics, 2, 'content:12'), null);
  assert.equal(resolveContentBossVisual(topics, 2, 'content:10'), null);
  assert.equal(resolveContentBossVisual(topics, 1, 'question:10'), null);
  assert.equal(resolveContentBossVisual([], 1, 'content:10'), null);
});
test('rejects unknown catalog entries and malformed metadata', () => {
  for (const metadata of [null, 'boss-01', { boss_visual: 'boss-32' }, { boss_visual: 'constructor' }, { boss_visual: 1 }]) {
    assert.equal(resolveContentBossVisual([{ id: 1, conteudos: [{ id: 10, metadata }] }], 1, 'content:10'), null);
  }
});
