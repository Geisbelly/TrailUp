import type { BrainHexProfile } from '@/constants/brainHexProfiles';

type BossTopic = { id: number; conteudos?: { id: number; metadata?: unknown }[] };

// Bosses do catálogo cuja cor dominante é a da cor-assinatura do perfil
// (microservice/src/constants/brainHex.ts). Os PNGs são pintados à mão, com vários matizes por
// arte; recolorir no app (tintColor/matriz) achataria a arte num tom só, então o perfil escolhe
// entre variantes que já existem — o catálogo traz famílias inteiras repetidas em cores
// diferentes (01–06, 07–12, 13–20). O Survivor (ardósia, quase sem saturação) não tem par nas
// famílias: fica com o necromante, o único boss dessaturado, e os golems glaciais, que têm o
// mesmo matiz frio. `contentBossVisual.test.ts` mede o matiz de cada PNG contra o do perfil.
export const BOSSES_DO_PERFIL: Record<BrainHexProfile, readonly string[]> = {
  seeker: ['boss-04', 'boss-10', 'boss-13', 'boss-18', 'boss-28'],
  survivor: ['boss-29', 'boss-23', 'boss-24', 'boss-25', 'boss-26', 'boss-27'],
  daredevil: ['boss-01', 'boss-07', 'boss-17', 'boss-30'],
  mastermind: ['boss-03', 'boss-09', 'boss-15', 'boss-20', 'boss-31'],
  conqueror: ['boss-02', 'boss-08', 'boss-14', 'boss-19'],
  socializer: ['boss-06', 'boss-12', 'boss-21'],
  achiever: ['boss-05', 'boss-11', 'boss-16'],
};

export function resolveContentBossVisual(
  topics: BossTopic[], topicId?: number | null, itemKey?: string | null, contentId?: number | null,
): string | null {
  const keyMatch = /^content:(\d+)$/.exec(itemKey ?? '');
  const id = keyMatch ? Number(keyMatch[1]) : contentId;
  if (!id || !topicId) return null;
  const metadata = topics.find((topic) => topic.id === topicId)?.conteudos?.find((content) => content.id === id)?.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>).boss_visual;
  return typeof value === 'string' && /^boss-(0[1-9]|[12]\d|3[01])$/.test(value) ? value : null;
}

/** Boss "Automático": um da paleta do perfil, sempre o mesmo para o mesmo confronto. */
export function bossDoPerfil(profile: BrainHexProfile, semente: string): string {
  const opcoes = BOSSES_DO_PERFIL[profile];
  // FNV-1a: estável entre sessões e aparelhos, para o boss não trocar a cada render.
  let hash = 0x811c9dc5;
  for (let i = 0; i < semente.length; i += 1) {
    hash ^= semente.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return opcoes[(hash >>> 0) % opcoes.length];
}

/**
 * A escolha explícita do professor vence, como ele a fez; no Automático (ou sem conteúdo), o
 * boss sai do catálogo do perfil. A imagem gerada pela IA (`enemy.avatarUrl`) não entra aqui
 * de propósito: o prompt dela não conhece a cor do perfil e o fluxo ainda não foi validado.
 */
export function resolveBossVisualId(
  topics: BossTopic[], profile: BrainHexProfile, topicId?: number | null, itemKey?: string | null, contentId?: number | null,
): string {
  const escolhido = resolveContentBossVisual(topics, topicId, itemKey, contentId);
  if (escolhido) return escolhido;
  const conteudo = /^content:(\d+)$/.exec(itemKey ?? '')?.[1] ?? (contentId ? String(contentId) : null);
  return bossDoPerfil(profile, conteudo ? `content:${conteudo}` : `topic:${topicId ?? ''}:${itemKey ?? ''}`);
}
