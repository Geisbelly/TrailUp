import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { ScrollView, type LayoutChangeEvent } from 'react-native';

/** Centraliza ao entrar/retomar ou mudar o alvo; não disputa o scroll manual. */
export function useTrailAutoFocus(topicId: string | null, center: number | null, horizontal = false) {
  const ref = useRef<ScrollView>(null);
  const focused = useIsFocused();
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const last = useRef('');
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setViewport(horizontal ? event.nativeEvent.layout.width : event.nativeEvent.layout.height);
  }, [horizontal]);
  const onContentSizeChange = useCallback((width: number, height: number) => {
    setContent(horizontal ? width : height);
  }, [horizontal]);
  useEffect(() => {
    if (!focused) { last.current = ''; return; }
    if (!topicId || center == null || !viewport || !content) return;
    const signature = `${topicId}:${center}:${viewport}:${content}`;
    if (last.current === signature) return;
    const frame = requestAnimationFrame(() => {
      const offset = Math.min(Math.max(0, content - viewport), Math.max(0, center - viewport / 2));
      ref.current?.scrollTo(horizontal ? { x: offset, animated: false } : { y: offset, animated: false });
      last.current = signature;
    });
    return () => cancelAnimationFrame(frame);
  }, [center, content, focused, horizontal, topicId, viewport]);
  return { ref, onLayout, onContentSizeChange };
}
