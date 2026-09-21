import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { StudyClock, type StudyInterval } from '@/utils/studyClock';
import { topicBlockFor } from './topicScreenBlock';

type Args = {
  topicoId: number | null;
  isScreenFocused: boolean;
  registrarSessaoTopico: (topicoId: number, startedAtMs: number, endedAtMs: number) => Promise<void>;
};

export function useTopicScreenTimeTracking({ topicoId, isScreenFocused, registrarSessaoTopico }: Args) {
  const callbackRef = useRef(registrarSessaoTopico);
  callbackRef.current = registrarSessaoTopico;
  const clock = useRef(new StudyClock(AppState.currentState !== 'background' && AppState.currentState !== 'inactive'));

  const persist = useCallback(async (interval: StudyInterval | null) => {
    if (!interval) return;
    try {
      await callbackRef.current(interval.block.topicoId, interval.startedAtMs, interval.endedAtMs);
    } catch (error) {
      console.warn('[Tempo] Falha ao salvar sessão de tópico:', error);
    }
  }, []);

  useEffect(() => {
    void persist(clock.current.setBlock(topicBlockFor(topicoId, isScreenFocused), Date.now()));
  }, [isScreenFocused, persist, topicoId]);

  useEffect(() => {
    const currentClock = clock.current;
    const interval = setInterval(() => { void persist(currentClock.flush(Date.now())); }, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      void persist(currentClock.setForeground(state === 'active', Date.now()));
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
      void persist(currentClock.setBlock(null, Date.now()));
    };
  }, [persist]);
}
