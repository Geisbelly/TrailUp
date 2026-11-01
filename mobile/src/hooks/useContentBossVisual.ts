import { bossVisuals } from '@/constants/bossVisuals';
import { useTrilha } from '@/context/TrilhaContext';
import { resolveBossVisualId } from '@/utils/contentBossVisual';

/** Arte do boss: a escolhida pelo professor ou, no Automático, uma da paleta do perfil do aluno. */
export function useContentBossVisual(topicId?: number | null, itemKey?: string | null, contentId?: number | null) {
  const { classeAtual, perfil } = useTrilha();
  return bossVisuals[resolveBossVisualId(classeAtual?.topicos ?? [], perfil, topicId, itemKey, contentId)];
}
