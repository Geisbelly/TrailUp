import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { StudyBlockSnapshot } from './types';
import { StudyClock, type StudyInterval } from '@/utils/studyClock';
import { persistStudyInterval, type StudyIntervalCallbacks } from './studyIntervalPersistence';

type Args = StudyIntervalCallbacks & {
  currentStudyBlockSignature: Omit<StudyBlockSnapshot, 'startedAtMs'> | null;
  reloadRanking: () => void;
};

export function useStudyTimeTracking(args: Args) {
  const callbacks = useRef(args);
  const previousArgs = useRef(args);
  callbacks.current = args;
  const clock = useRef(new StudyClock(AppState.currentState !== 'background' && AppState.currentState !== 'inactive'));
  const persist = useCallback(async (interval: StudyInterval | null, owner?: Args) => {
    if (!interval) return;
    // Capture callbacks before awaiting: changing topic/profile cannot reassign this interval.
    try {
      await persistStudyInterval(interval, owner ?? callbacks.current);
    } catch (error) {
      console.warn('[Tempo] Falha ao salvar intervalo de estudo:', error);
    }
  }, []);

  const flushStudyTime = useCallback(() => persist(clock.current.flush(Date.now())), [persist]);
  useEffect(() => {
    void persist(clock.current.setBlock(args.currentStudyBlockSignature, Date.now()), previousArgs.current);
    previousArgs.current = args;
  }, [args, persist]);

  useEffect(() => {
    const currentClock = clock.current;
    const interval = setInterval(() => { void flushStudyTime(); }, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      void persist(currentClock.setForeground(state === 'active', Date.now()));
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
      void persist(currentClock.setBlock(null, Date.now()));
    };
  }, [flushStudyTime, persist]);

  return { flushStudyTime };
}
