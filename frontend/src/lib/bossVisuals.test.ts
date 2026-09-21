import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bossVisuals, normalizeBossVisual } from './bossVisuals';

describe('boss visual catalog', () => {
  it('ships all 31 visuals in both clients with identical IDs', () => {
    expect(bossVisuals).toHaveLength(31);
    expect(new Set(bossVisuals.map((item) => item.id)).size).toBe(31);
    for (const boss of bossVisuals) {
      const web = resolve('public/bosses', `${boss.id}.png`);
      const mobile = resolve('../mobile/src/assets/bosses', `${boss.id}.png`);
      expect(existsSync(web)).toBe(true);
      expect(existsSync(mobile)).toBe(true);
      expect(readFileSync(web).equals(readFileSync(mobile))).toBe(true);
      expect(normalizeBossVisual(boss.id)).toBe(boss.id);
    }
  });
  it('falls back to automatic for missing or unknown selections', () => {
    for (const value of [null, undefined, 'boss-32', 'constructor', 1]) expect(normalizeBossVisual(value)).toBe(null);
  });
});
