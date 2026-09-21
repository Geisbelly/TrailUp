import assert from 'node:assert/strict';
import test from 'node:test';
import { returnToTrail } from './returnToTrail';

for (const hasHistory of [true, false]) {
  test(`retorno da trilha com histórico=${hasHistory}`, () => {
    const calls: string[] = [];
    returnToTrail({
      canGoBack: () => hasHistory,
      back: () => { calls.push('back'); },
      replace: (href) => { calls.push(String(href)); },
    });
    assert.deepEqual(calls, [hasHistory ? 'back' : '/(tabs)/trilha']);
  });
}
