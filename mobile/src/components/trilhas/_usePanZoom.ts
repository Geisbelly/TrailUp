import { useCallback } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

export function usePanZoom(opts?: { minScale?: number; maxScale?: number }) {
  const minS = opts?.minScale ?? 0.7;
  const maxS = opts?.maxScale ?? 2.0;

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);

  const pan = Gesture.Pan().onChange((e) => {
    tx.value += e.changeX;
    ty.value += e.changeY;
  });

  const pinch = Gesture.Pinch().onChange((e) => {
    const s = Math.min(maxS, Math.max(minS, scale.value * e.scale));
    scale.value = s;
  });

  const gestures = Gesture.Simultaneous(pan, pinch);

  const reset = useCallback(() => {
    tx.value = 0; ty.value = 0; scale.value = 1;
  }, []);

  return { tx, ty, scale, gestures, reset };
}
