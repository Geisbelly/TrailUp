import assert from 'node:assert/strict';
import test from 'node:test';

import { emFocoNoAparelho, lembrarFoco } from './focoLocal';

test('foco ligado vale até a hora que o banco devolveu', () => {
  const agora = Date.parse('2026-11-02T12:00:00Z');
  lembrarFoco({ ate: '2026-11-02T12:25:00Z' });
  assert.equal(emFocoNoAparelho(agora), true);
  assert.equal(emFocoNoAparelho(Date.parse('2026-11-02T12:25:00Z')), false);
});

test('sem foco, data inválida ou estado nulo não seguram nada', () => {
  lembrarFoco({ ate: null });
  assert.equal(emFocoNoAparelho(), false);
  lembrarFoco({ ate: 'ontem' });
  assert.equal(emFocoNoAparelho(), false);
  lembrarFoco(null);
  assert.equal(emFocoNoAparelho(), false);
});
