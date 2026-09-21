/**
 * `currentStudyBlockSignature` (em `[id].tsx`) só existe com um bloco de
 * conteúdo/atividade aberto — tempo só de tela do tópico (resumo, navegação)
 * nunca gerava nenhum sinal. Este bloco é independente disso: só depende de
 * a tela do tópico estar focada.
 *
 * Fica num módulo sem import de react-native (diferente de
 * `useTopicScreenTimeTracking.ts`, que usa AppState) para ser testável com
 * node:test.
 */
export function topicBlockFor(topicoId: number | null, isScreenFocused: boolean) {
  if (!isScreenFocused || !topicoId) return null;
  return {
    key: `topic:${topicoId}`,
    topicoId,
    conteudoId: null,
    atividadeId: null,
    isPersonalizedLocal: false,
    itemKey: null,
    itemTitle: null,
    itemKind: 'content' as const,
  };
}
