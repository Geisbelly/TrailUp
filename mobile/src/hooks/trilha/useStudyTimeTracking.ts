import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { ProgressoItemPersonalizado, StudyBlockSnapshot } from './types';
import { StudyClock, type StudyInterval } from '@/utils/studyClock';
import { planSessionRegistrations } from './sessionRegistrationPlan';

type Args = {
  currentStudyBlockSignature: Omit<StudyBlockSnapshot, 'startedAtMs'> | null;
  registrarTempoTopico: (id: number, min: number) => Promise<void>;
  registrarTempoConteudo: (topico: number, conteudo: number, min: number) => Promise<void>;
  registrarTempoAtividade: (topico: number, atividade: number, min: number) => Promise<void>;
  registrarTempoDireto: (topico: number, conteudo: number | null, atividade: number | null, min: number) => Promise<void>;
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
    const { block, minutes } = interval;
    try {
      if (!current.telemetrySessionActive) {
        await current.registrarTempoDireto(block.topicoId,
          block.conteudoId != null && block.conteudoId > 0 ? block.conteudoId : null,
          block.atividadeId != null && block.atividadeId > 0 ? block.atividadeId : null, minutes);
      } else {
        if (block.conteudoId != null && block.conteudoId > 0)
          await current.registrarTempoConteudo(block.topicoId, block.conteudoId, minutes);
        if (block.atividadeId != null && block.atividadeId > 0)
          await current.registrarTempoAtividade(block.topicoId, block.atividadeId, minutes);
        // A sessão real de abertura/fechamento é o que vale para
        // tempo_gasto_min (20260921_01) — os dois registros acima são só
        // bookkeeping de visita, não escrevem mais tempo.
        for (const plan of planSessionRegistrations(interval)) {
          if (plan.scope === 'content') {
            await current.registrarSessaoConteudo(plan.topicoId, plan.conteudoId!, plan.startedAtMs, plan.endedAtMs);
          } else {
            await current.registrarSessaoAtividade(plan.topicoId, plan.atividadeId!, plan.startedAtMs, plan.endedAtMs);
          }
        }
        // Primeiro entrega os segundos; só então lê as métricas derivadas.
        // Antes a tela recarregava a projeção ANTES de o lote chegar ao banco.
        await current.flushTelemetryTime();
        await current.registrarTempoTopico(block.topicoId, minutes);
      }
      if (block.isPersonalizedLocal && block.itemKey && block.itemTitle) {
        await current.salvarProgressoItemPersonalizado({
          topicoId: block.topicoId, itemKey: block.itemKey, itemKind: block.itemKind,
          itemTitle: block.itemTitle, status: 'em_andamento', percentualConcluido: 0,
          tempoGastoMin: minutes, metadata: { source: 'mobile_trilha_tempo', personalized: true },
        });
      }
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
