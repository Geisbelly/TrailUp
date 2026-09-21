import assert from 'node:assert/strict';
import test from 'node:test';
import { StudyClock } from './studyClock';

const block = { key: '131:192', topicoId: 131, conteudoId: 192, atividadeId: null,
  isPersonalizedLocal: false, itemKey: null, itemTitle: null, itemKind: 'content' as const };

test('60 segundos são um minuto e o mesmo intervalo não é enviado duas vezes', () => {
  const clock = new StudyClock();
  clock.setBlock(block,0);
  assert.equal(clock.flush(60000)?.minutes,1);
  assert.equal(clock.flush(60000),null);
  assert.equal(clock.flush(90000)?.minutes,0.5);
});

test('background e inactive consecutivos não contam tempo oculto nem duplicam flush', () => {
  const clock = new StudyClock();
  clock.setBlock(block,0);
  assert.equal(clock.setForeground(false,30000)?.minutes,0.5);
  assert.equal(clock.setForeground(false,31000),null);
  assert.equal(clock.flush(180000),null);
  clock.setForeground(true,180000);
  assert.equal(clock.flush(210000)?.minutes,0.5);
});

test('renders com novos objetos do mesmo bloco não reiniciam o relógio', () => {
  const clock = new StudyClock();
  clock.setBlock(block,0);
  for(let i=1;i<=50;i++) assert.equal(clock.setBlock({...block},i*1000),null);
  assert.equal(clock.flush(60000)?.minutes,1);
});

test('troca de bloco atribui o intervalo ao bloco anterior', () => {
  const clock = new StudyClock();
  clock.setBlock(block,0);
  assert.equal(clock.setBlock({...block,key:'131:193',conteudoId:193},30000)?.block.conteudoId,192);
  assert.equal(clock.flush(60000)?.block.conteudoId,193);
});

test('blur e unmount no mesmo instante não contam duas vezes', () => {
  const clock = new StudyClock();
  clock.setBlock(block,0);
  assert.equal(clock.flush(1200)?.minutes,0.02);
  assert.equal(clock.setBlock(null,1200),null);
  assert.equal(clock.flush(60000),null);
});

test('frações curtas não são arredondadas para zero', () => {
  const clock = new StudyClock();
  clock.setBlock(block,0);
  let total=0;
  for(let i=1;i<=120;i++) total += clock.flush(i*500)?.minutes ?? 0;
  assert.ok(Math.abs(total-1)<1e-9);
});
