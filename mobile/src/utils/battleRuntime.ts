import type { IABattleRuntimeState, IAFeatureSelectorScope } from '@/interfaces/personalizacao/IAContracts';

type BattleScope = Extract<IAFeatureSelectorScope, { scope: 'topic' | 'item' }>;

/** An analysis cycle is not a new encounter. Content/enemy identity is stable. */
export function buildBattleRuntimeKey(userId: string, scope: BattleScope, enemyId: string,
  _cycleId?: string | null, _persistKey?: string | null) {
  return `${userId}:${scope.topicoId ?? 0}:${scope.scope === 'item' ? scope.itemKey : 'topic'}:battle:${enemyId}`;
}

export function findStoredBattle(states: Record<string, IABattleRuntimeState>, key: string) {
  if (states[key]) return states[key];
  const [prefix, enemy] = key.split(':battle:');
  // Recover previous on-device keys (which included the AI cycle) without
  // mixing students, topics or the different content bosses.
  return Object.entries(states)
    .filter(([oldKey]) => oldKey.startsWith(`${prefix}:`) && oldKey.endsWith(`:${enemy}`))
    .map(([, state]) => state)
    .sort((a, b) => b.totalDamage - a.totalDamage || b.updatedAt - a.updatedAt)[0] ?? null;
}

export function applyDamageToBattleState(state: IABattleRuntimeState, damage: number, now = Date.now()) {
  const normalized = Number.isFinite(damage) ? Math.max(0, Math.round(damage)) : 0;
  if (!normalized || state.defeated) return { nextState: state, defeatedNow: false };
  const shield = Math.max(0, state.currentShield);
  const hp = Math.max(0, state.currentHp);
  const applied = Math.min(normalized, shield + hp);
  const currentShield = Math.max(0, shield - applied);
  const currentHp = Math.max(0, hp - Math.max(0, applied - shield));
  const defeatedNow = hp > 0 && currentHp === 0;
  return { defeatedNow, nextState: { ...state, currentShield, currentHp,
    totalDamage: state.totalDamage + applied, defeated: currentHp === 0,
    defeatedAt: defeatedNow ? now : state.defeatedAt ?? null,
    lastDamageAt: now, encounterEndsAt: currentHp === 0 ? null : state.encounterEndsAt ?? null,
    updatedAt: now,
  } };
}

export function selectClassBattles(states: Record<string, IABattleRuntimeState>, userId: string | null,
  topicIds: number[]): IABattleRuntimeState[] {
  if (!userId) return [];
  const selected = new Map<string, IABattleRuntimeState>();
  for (const [key, state] of Object.entries(states)) {
    if (!key.startsWith(`${userId}:`) || !topicIds.includes(state.topicoId)) continue;
    const identity = `${state.topicoId}:${state.itemKey ?? 'topic'}:${state.enemy.id}`;
    const previous = selected.get(identity);
    if (!previous || state.totalDamage > previous.totalDamage ||
      (state.totalDamage === previous.totalDamage && state.updatedAt > previous.updatedAt)) {
      selected.set(identity, state);
    }
  }
  return [...selected.values()];
}

/** Storage can finish loading after the first content/signal initializes a boss. */
export function restoreBattleStates(saved: Record<string, IABattleRuntimeState>, live: Record<string, IABattleRuntimeState>) {
  const merged = { ...saved };
  for (const [key, state] of Object.entries(live)) {
    const restored = findStoredBattle(saved, key);
    merged[key] = restored ? applyDamageToBattleState(restored, state.totalDamage).nextState : state;
  }
  return merged;
}
