import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { ScrollView, type LayoutChangeEvent } from 'react-native';

/**
 * Centraliza ao entrar/retomar ou mudar o alvo; não disputa o scroll manual.
 *
 * `comFolga`: devolve `folga` (meia tela) para o mapa pôr em cima e embaixo do conteúdo. Sem ela,
 * o deslocamento é cortado em 0 e o nó das primeiras linhas fica preso no topo — e um mapa mais
 * curto que a tela nem rola. Com ela, qualquer nó cabe no meio e o mapa sempre se move.
 */
export function useTrailAutoFocus(topicId: string | null, center: number | null, horizontal = false, comFolga = false) {
  const ref = useRef<ScrollView>(null);
  const focused = useIsFocused();
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const last = useRef('');
  const folga = comFolga ? Math.round(viewport / 2) : 0;
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setViewport(horizontal ? event.nativeEvent.layout.width : event.nativeEvent.layout.height);
  }, [horizontal]);
  const onContentSizeChange = useCallback((width: number, height: number) => {
    setContent(horizontal ? width : height);
  }, [horizontal]);
  useEffect(() => {
    if (!focused) { last.current = ''; return; }
    if (!topicId || center == null || !viewport || !content) return;
    const alvo = center + folga;
    const signature = `${topicId}:${alvo}:${viewport}:${content}`;
    if (last.current === signature) return;
    const frame = requestAnimationFrame(() => {
      const offset = Math.min(Math.max(0, content - viewport), Math.max(0, alvo - viewport / 2));
      ref.current?.scrollTo(horizontal ? { x: offset, animated: false } : { y: offset, animated: false });
      last.current = signature;
    });
    return () => cancelAnimationFrame(frame);
  }, [center, content, focused, folga, horizontal, topicId, viewport]);
  return { ref, onLayout, onContentSizeChange, folga };
}
