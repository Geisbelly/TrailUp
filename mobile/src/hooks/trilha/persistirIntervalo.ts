import type { StudyInterval } from '@/utils/studyClock';
import { planSessionRegistrations } from './sessionRegistrationPlan';
import type { ProgressoItemPersonalizado } from './types';

/**
 * O que fica gravado quando um intervalo de bloco (conteúdo/atividade) fecha.
 *
 * Mora fora de `useStudyTimeTracking.ts` pelo mesmo motivo de
 * `sessionRegistrationPlan.ts`: aquele arquivo importa `AppState` de
 * react-native e não carrega no runner de node — a decisão de QUEM grava o
 * tempo nunca teve teste, e foi aí que entrou a contagem dobrada descrita
 * abaixo.
 *
 * ## Uma fonte só para o tempo: `estudo_sessoes`
 *
 * Desde `20260921_01` o tempo exibido é
 * `tempo_gasto_min = tempo_direto_min + trailup_tempo_sessao_min(...)`, e o
 * cliente alimenta a segunda parcela registrando o intervalo real de
 * abertura/fechamento. Isso **não depende da telemetria**: é relógio de
 * parede do próprio app.
 *
 * Havia aqui um desvio por `telemetrySessionActive` que, com a telemetria
 * desligada, mandava o intervalo para `trailup_registrar_intervalo_estudo`
 * (o livro-caixa `tempo_direto_min`) em vez de registrar a sessão. Esse RPC
 * credita SEMPRE o tópico, além do conteúdo/atividade — e o tópico já é
 * contado, no mesmo intervalo de parede, por `useTopicScreenTimeTracking`,
 * que roda independentemente da telemetria. Resultado: dez minutos de estudo
 * viravam vinte em `topico_aluno.tempo_gasto_min` para todo aluno que
 * recusou a telemetria (e, por alguns segundos, para quem aceitou — o sinal
 * nasce falso e só vira verdadeiro quando a sessão de telemetria sobe).
 *
 * Conteúdo e atividade não dobravam: o caminho antigo era o único a gravar o
 * tempo deles. Por isso o sintoma aparecia só no tópico, que é justamente
 * onde a soma devia bater com o tempo de tela.
 *
 * Agora o intervalo sempre vira sessão. `telemetrySessionActive` sobrou só
 * para decidir se há lote de telemetria a despachar antes de a tela reler as
 * métricas derivadas.
 */
export type GravadoresDoIntervalo = {
  /** Visita, não tempo: `registrarVisita` carimba `ultima_visualizacao`. */
  registrarTempoConteudo: (topico: number, conteudo: number, min: number) => Promise<void>;
  /** Visita, não tempo. */
  registrarTempoAtividade: (topico: number, atividade: number, min: number) => Promise<void>;
  /** Visita, e o upsert que garante a linha de `topico_aluno` que a sessão atualiza. */
  registrarTempoTopico: (topico: number, min: number) => Promise<void>;
  registrarSessaoConteudo: (topico: number, conteudo: number, startedAtMs: number, endedAtMs: number) => Promise<void>;
  registrarSessaoAtividade: (topico: number, atividade: number, startedAtMs: number, endedAtMs: number) => Promise<void>;
  salvarProgressoItemPersonalizado: (payload: ProgressoItemPersonalizado) => Promise<void>;
  telemetrySessionActive: boolean;
  flushTelemetryTime: () => Promise<unknown>;
};

export async function persistirIntervaloDeEstudo(
  interval: StudyInterval,
  gravadores: GravadoresDoIntervalo
) {
  const { block, minutes } = interval;

  // A visita vem antes da sessão de propósito: `trailup_registrar_sessao_estudo`
  // só faz UPDATE (nunca INSERT, para não inventar item iniciado), então a
  // linha precisa existir para o tempo cair em algum lugar.
  if (block.conteudoId != null && block.conteudoId > 0) {
    await gravadores.registrarTempoConteudo(block.topicoId, block.conteudoId, minutes);
  }
  if (block.atividadeId != null && block.atividadeId > 0) {
    await gravadores.registrarTempoAtividade(block.topicoId, block.atividadeId, minutes);
  }

  for (const plan of planSessionRegistrations(interval)) {
    if (plan.scope === 'content') {
      await gravadores.registrarSessaoConteudo(plan.topicoId, plan.conteudoId!, plan.startedAtMs, plan.endedAtMs);
    } else {
      await gravadores.registrarSessaoAtividade(plan.topicoId, plan.atividadeId!, plan.startedAtMs, plan.endedAtMs);
    }
  }

  // Primeiro entrega os segundos; só então lê as métricas derivadas. Antes a
  // tela recarregava a projeção ANTES de o lote chegar ao banco.
  if (gravadores.telemetrySessionActive) {
    await gravadores.flushTelemetryTime();
  }
  await gravadores.registrarTempoTopico(block.topicoId, minutes);

  if (block.isPersonalizedLocal && block.itemKey && block.itemTitle) {
    await gravadores.salvarProgressoItemPersonalizado({
      topicoId: block.topicoId, itemKey: block.itemKey, itemKind: block.itemKind,
      itemTitle: block.itemTitle, status: 'em_andamento', percentualConcluido: 0,
      tempoGastoMin: minutes, metadata: { source: 'mobile_trilha_tempo', personalized: true },
    });
  }
}
