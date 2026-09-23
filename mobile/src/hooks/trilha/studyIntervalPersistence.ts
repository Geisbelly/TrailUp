import type { StudyInterval } from '@/utils/studyClock';
import type { ProgressoItemPersonalizado } from './types';
import { planSessionRegistrations } from './sessionRegistrationPlan';

export type StudyIntervalCallbacks = {
  registrarTempoTopico: (id: number, min: number) => Promise<void>;
  registrarTempoConteudo: (topico: number, conteudo: number, min: number) => Promise<void>;
  registrarTempoAtividade: (topico: number, atividade: number, min: number) => Promise<void>;
  registrarSessaoConteudo: (topico: number, conteudo: number, startedAtMs: number, endedAtMs: number) => Promise<void>;
  registrarSessaoAtividade: (topico: number, atividade: number, startedAtMs: number, endedAtMs: number) => Promise<void>;
  salvarProgressoItemPersonalizado: (payload: ProgressoItemPersonalizado) => Promise<void>;
  telemetrySessionActive: boolean;
  flushTelemetryTime: () => Promise<unknown>;
};

/**
 * Grava um intervalo fechado pelo StudyClock. Fica fora de
 * `useStudyTimeTracking.ts` (que importa AppState) para ser testável com
 * node:test, como `sessionRegistrationPlan.ts`.
 *
 * O destino do tempo NÃO depende da telemetria. Até aqui, com a telemetria
 * desligada, o intervalo ia para `registrarTempoDireto`
 * (`trailup_registrar_intervalo_estudo`), que soma o mesmo minuto no tópico,
 * no conteúdo e na atividade de uma vez. Esse desvio vinha de quando o tempo
 * era derivado da telemetria; a sessão (20260921_01) não depende dela, e o
 * tópico já tem o próprio relógio (`useTopicScreenTimeTracking`). Medido no
 * banco em 22/09: o mesmo minuto entrou duas vezes no tópico 135 e no
 * conteúdo 195.
 */
export async function persistStudyInterval(interval: StudyInterval, current: StudyIntervalCallbacks) {
  const { block, minutes } = interval;
  if (block.conteudoId != null && block.conteudoId > 0)
    await current.registrarTempoConteudo(block.topicoId, block.conteudoId, minutes);
  if (block.atividadeId != null && block.atividadeId > 0)
    await current.registrarTempoAtividade(block.topicoId, block.atividadeId, minutes);
  // A sessão real de abertura/fechamento é o que vale para
  // tempo_gasto_min (20260921_01) — os dois registros acima são só
  // bookkeeping de visita, não escrevem tempo.
  for (const plan of planSessionRegistrations(interval)) {
    if (plan.scope === 'content') {
      await current.registrarSessaoConteudo(plan.topicoId, plan.conteudoId!, plan.startedAtMs, plan.endedAtMs);
    } else {
      await current.registrarSessaoAtividade(plan.topicoId, plan.atividadeId!, plan.startedAtMs, plan.endedAtMs);
    }
  }
  if (current.telemetrySessionActive) await current.flushTelemetryTime();
  // Recarrega o tópico (refreshTopico) só depois de a sessão chegar ao banco.
  await current.registrarTempoTopico(block.topicoId, minutes);
  if (block.isPersonalizedLocal && block.itemKey && block.itemTitle) {
    await current.salvarProgressoItemPersonalizado({
      topicoId: block.topicoId, itemKey: block.itemKey, itemKind: block.itemKind,
      itemTitle: block.itemTitle, status: 'em_andamento', percentualConcluido: 0,
      tempoGastoMin: minutes, metadata: { source: 'mobile_trilha_tempo', personalized: true },
    });
  }
}
