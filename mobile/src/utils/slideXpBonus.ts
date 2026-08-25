const SLIDE_ITEM_KEY_PREFIX = "slide:";
const PERCENT_PER_INTERACTION = 2;
const MAX_BONUS_PERCENT = 10;

export function isSlideItemKey(itemKey: string): boolean {
  return itemKey.startsWith(SLIDE_ITEM_KEY_PREFIX);
}

export function buildSlideBonusDedupeKey(topicoId: number, itemKey: string): string {
  return `${topicoId}:${itemKey}`;
}

export function computeSlideBonusPercent(dedupeKeys: ReadonlySet<string>): number {
  return Math.min(MAX_BONUS_PERCENT, dedupeKeys.size * PERCENT_PER_INTERACTION);
}
