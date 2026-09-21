import { bossVisuals } from '@/constants/bossVisuals';
import { useTrilha } from '@/context/TrilhaContext';
import { resolveContentBossVisual } from '@/utils/contentBossVisual';

export function useContentBossVisual(topicId?: number | null, itemKey?: string | null, contentId?: number | null) {
  const { classeAtual } = useTrilha();
  const id = resolveContentBossVisual(classeAtual?.topicos ?? [], topicId, itemKey, contentId);
  return id ? bossVisuals[id] : null;
}
