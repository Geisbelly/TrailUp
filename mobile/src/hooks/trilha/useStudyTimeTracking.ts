import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { ProgressoItemPersonalizado, StudyBlockSnapshot } from './types';
import { StudyClock, type StudyInterval } from '@/utils/studyClock';
import { persistirIntervaloDeEstudo } from './persistirIntervalo';

type Args = {
  currentStudyBlockSignature: Omit<StudyBlockSnapshot, 'startedAtMs'> | null;
  registrarTempoTopico: (id: number, min: number) => Promise<void>;
  registrarTempoConteudo: (topico: number, conteudo: number, min: number) => Promise<void>;
  registrarTempoAtividade: (topico: number, atividade: number, min: number) => Promise<void>;
  registrarSessaoConteudo: (topico: number, conteudo: number, startedAtMs: number, endedAtMs: number) => Promise<void>;
  registrarSessaoAtividade: (topico: number, atividade: number, startedAtMs: number, endedAtMs: number) => Promise<void>;
  salvarProgressoItemPersonalizado: (payload: ProgressoItemPersonalizado) => Promise<void>;
  reloadRanking: () => void;
  telemetrySessionActive: boolean;
  flushTelemetryTime: () => Promise<unknown>;
};

export function useStudyTimeTracking(args: Args) {
  const callbacks = useRef(args);
  const previousArgs = useRef(args);
  callbacks.current = args;
  const clock = useRef(new StudyClock(AppState.currentState !== 'background' && AppState.currentState !== 'inactive'));
  const persist = useCallback(async (interval: StudyInterval | null, owner?: Args) => {
    if (!interval) return;
    // Capture callbacks before awaiting: changing topic/profile cannot reassign this interval.
    const current = owner ?? callbacks.current;
    try {
      await persistirIntervaloDeEstudo(interval, current);
    } catch (error) {
      console.warn('[Tempo] Falha ao salvar intervalo de estudo:', error);
    }
  }, []);

  const flushStudyTime = useCallback(() => persist(clock.current.flush(Date.now())), [persist]);
  useEffect(() => {
    const previous = previousArgs.current;
    const now = Date.now();
    if (previous.telemetrySessionActive !== args.telemetrySessionActive) {
      void persist(clock.current.flush(now), previous);
    }
    void persist(clock.current.setBlock(args.currentStudyBlockSignature, now), previous);
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
