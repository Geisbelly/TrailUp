import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDamageToBattleState, buildBattleRuntimeKey, findStoredBattle, selectClassBattles, restoreBattleStates } from './battleRuntime';
import type { IABattleRuntimeState } from '@/interfaces/personalizacao/IAContracts';

const battle = (extra = {}): IABattleRuntimeState => ({ topicoId: 131, itemKey: 'content:192',
  enemy: { id: 'boss:131:192', name: 'Boss', hpMax: 180 }, currentHp: 180, currentShield: 36,
  totalDamage: 0, defeated: false, introShown: true, updatedAt: 1, ...extra });

test('acerto e conclusão descontam cumulativamente, primeiro escudo e depois vida', () => {
  const first = applyDamageToBattleState(battle(), 25).nextState;
  const second = applyDamageToBattleState(first, 34).nextState;
  assert.equal(second.currentShield, 0);
  assert.equal(second.currentHp, 157);
  assert.equal(second.totalDamage, 59);
});

test('dano excedente não infla total nem torna HP negativo', () => {
  const result = applyDamageToBattleState(battle({ currentHp: 5, currentShield: 3 }), 50);
  assert.equal(result.nextState.totalDamage, 8);
  assert.equal(result.nextState.currentHp, 0);
  assert.equal(result.defeatedNow, true);
  assert.equal(applyDamageToBattleState(result.nextState, 50).nextState, result.nextState);
});

test('novo ciclo de IA não reinicia boss; outro conteúdo mantém batalha independente', () => {
  const scope = { scope: 'item', topicoId: 131, itemKey: 'content:192' } as const;
  assert.equal(buildBattleRuntimeKey('aluno', scope, 'boss', 'a'), buildBattleRuntimeKey('aluno', scope, 'boss', 'b'));
  assert.notEqual(buildBattleRuntimeKey('aluno', scope, 'boss'), buildBattleRuntimeKey('aluno', { ...scope, itemKey: 'content:193' }, 'boss'));
});

test('recupera dano de chave antiga sem cruzar aluno ou conteúdo', () => {
  const state = battle({ totalDamage: 59, currentHp: 157, currentShield: 0 });
  const key = buildBattleRuntimeKey('aluno', { scope: 'item', topicoId: 131, itemKey: 'content:192' }, state.enemy.id);
  const stored = { 'aluno:131:content:192:old-cycle:boss:131:192': state };
  assert.equal(findStoredBattle(stored, key), state);
  assert.equal(findStoredBattle(stored, key.replace('aluno:', 'outro:')), null);
});

test('perfil soma bosses dos conteúdos e remove duplicatas de ciclos antigos', () => {
  const stored = {
    'aluno:131:a:old': battle({ totalDamage: 20 }),
    'aluno:131:a:new': battle({ totalDamage: 40 }),
    'aluno:131:b': battle({ itemKey: 'content:193', enemy: { id: 'boss2' }, totalDamage: 25 }),
    'outro:131:b': battle({ totalDamage: 300 }),
    'aluno:999:b': battle({ topicoId: 999, totalDamage: 300 }),
  };
  const selected = selectClassBattles(stored, 'aluno', [131]);
  assert.equal(selected.length, 2);
  assert.equal(selected.reduce((sum, state) => sum + state.totalDamage, 0), 65);
});

test('hidratação tardia preserva batalha anterior e dano dado antes de terminar a leitura', () => {
  const scope = { scope: 'item', topicoId: 131, itemKey: 'content:192' } as const;
  const key = buildBattleRuntimeKey('aluno', scope, 'boss:131:192');
  const old = { 'aluno:131:content:192:old-cycle:boss:131:192': battle({ totalDamage: 59, currentHp: 157, currentShield: 0 }) };
  const live = { [key]: applyDamageToBattleState(battle(), 12).nextState };
  const restored = restoreBattleStates(old, live)[key];
  assert.equal(restored.totalDamage, 71);
  assert.equal(restored.currentHp, 145);
});
