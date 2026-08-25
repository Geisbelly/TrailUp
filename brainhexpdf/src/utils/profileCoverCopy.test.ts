import assert from 'node:assert/strict';
import test from 'node:test';

import { getProfileCoverCopy } from './profileCoverCopy';

const PROFILES = ['achiever', 'seeker', 'survivor', 'daredevil', 'mastermind', 'conqueror', 'socializer'];

test('cada um dos 7 perfis tem badge de missao e de conclusao proprios (nao genericos)', () => {
  for (const profile of PROFILES) {
    const copy = getProfileCoverCopy(profile);
    assert.notEqual(copy.missionBadge, 'MISSÃO DE APRENDIZADO', `perfil ${profile} nao deveria cair no generico`);
    assert.notEqual(copy.conclusionBadge, 'SÍNTESE DE MAESTRIA & PRÓXIMOS PASSOS', `perfil ${profile} nao deveria cair no generico`);
  }
});

test('e case-insensitive (perfil vem em qualquer capitalizacao)', () => {
  assert.deepEqual(getProfileCoverCopy('Achiever'), getProfileCoverCopy('achiever'));
  assert.deepEqual(getProfileCoverCopy('SURVIVOR'), getProfileCoverCopy('survivor'));
});

test('perfil desconhecido ou vazio cai no texto generico (fallback seguro)', () => {
  assert.deepEqual(getProfileCoverCopy('perfil-inexistente'), {
    missionBadge: 'MISSÃO DE APRENDIZADO',
    conclusionBadge: 'SÍNTESE DE MAESTRIA & PRÓXIMOS PASSOS',
  });
  assert.deepEqual(getProfileCoverCopy(null), getProfileCoverCopy(undefined));
});
