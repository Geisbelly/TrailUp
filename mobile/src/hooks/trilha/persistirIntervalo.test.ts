import assert from 'node:assert/strict';
import test from 'node:test';
import { persistirIntervaloDeEstudo, type GravadoresDoIntervalo } from './persistirIntervalo';

const bloco = {
  key: 'content:192', topicoId: 131, conteudoId: 192, atividadeId: null,
  isPersonalizedLocal: false, itemKey: null, itemTitle: null, itemKind: 'content' as const,
};

const intervalo = { block: bloco, startedAtMs: 1_000, endedAtMs: 601_000, minutes: 10 };

function espiao(telemetrySessionActive: boolean) {
  const chamadas: string[] = [];
  const gravadores: GravadoresDoIntervalo = {
    registrarTempoConteudo: async (t, c, m) => { chamadas.push(`visitaConteudo(${t},${c},${m})`); },
    registrarTempoAtividade: async (t, a, m) => { chamadas.push(`visitaAtividade(${t},${a},${m})`); },
    registrarTempoTopico: async (t, m) => { chamadas.push(`visitaTopico(${t},${m})`); },
    registrarSessaoConteudo: async (t, c, i, f) => { chamadas.push(`sessaoConteudo(${t},${c},${i},${f})`); },
    registrarSessaoAtividade: async (t, a, i, f) => { chamadas.push(`sessaoAtividade(${t},${a},${i},${f})`); },
    salvarProgressoItemPersonalizado: async (p) => { chamadas.push(`progresso(${p.itemKey})`); },
    telemetrySessionActive,
    flushTelemetryTime: async () => { chamadas.push('flushTelemetria'); return null; },
  };
  return { chamadas, gravadores };
}

test('o intervalo vira sessão de conteúdo, com o relógio de parede do bloco', async () => {
  const { chamadas, gravadores } = espiao(true);
  await persistirIntervaloDeEstudo(intervalo, gravadores);
  assert.ok(chamadas.includes('sessaoConteudo(131,192,1000,601000)'));
});

/**
 * O defeito: com a telemetria desligada este caminho gravava
 * `trailup_registrar_intervalo_estudo`, que credita SEMPRE o tópico em
 * `tempo_direto_min` — enquanto `useTopicScreenTimeTracking` já contava o
 * mesmo intervalo de parede como sessão de 'topic'. Dez minutos viravam
 * vinte em `topico_aluno.tempo_gasto_min`.
 *
 * O invariante que impede a volta: tirando o despacho do lote de telemetria,
 * o que é GRAVADO não pode depender de a telemetria estar ligada.
 */
test('o que é gravado não muda com a telemetria — só o despacho do lote muda', async () => {
  const ligada = espiao(true);
  const desligada = espiao(false);
  await persistirIntervaloDeEstudo(intervalo, ligada.gravadores);
  await persistirIntervaloDeEstudo(intervalo, desligada.gravadores);

  assert.deepEqual(
    ligada.chamadas.filter((c) => c !== 'flushTelemetria'),
    desligada.chamadas
  );
  assert.ok(ligada.chamadas.includes('flushTelemetria'));
  assert.ok(!desligada.chamadas.includes('flushTelemetria'));
});

test('a visita vem antes da sessão: o UPDATE da sessão precisa da linha', async () => {
  const { chamadas, gravadores } = espiao(true);
  await persistirIntervaloDeEstudo(intervalo, gravadores);
  assert.ok(chamadas.indexOf('visitaConteudo(131,192,10)') < chamadas.indexOf('sessaoConteudo(131,192,1000,601000)'));
});

test('bloco de atividade grava sessão de activity, e nenhuma de content', async () => {
  const { chamadas, gravadores } = espiao(true);
  await persistirIntervaloDeEstudo({
    ...intervalo,
    block: { ...bloco, key: 'activity:55', conteudoId: null, atividadeId: 55, itemKind: 'activity' },
  }, gravadores);
  assert.ok(chamadas.includes('sessaoAtividade(131,55,1000,601000)'));
  assert.ok(!chamadas.some((c) => c.startsWith('sessaoConteudo')));
});

test('item personalizado também é gravado com a telemetria desligada', async () => {
  const { chamadas, gravadores } = espiao(false);
  await persistirIntervaloDeEstudo({
    ...intervalo,
    block: { ...bloco, isPersonalizedLocal: true, itemKey: 'md-1', itemTitle: 'Introdução' },
  }, gravadores);
  assert.ok(chamadas.includes('progresso(md-1)'));
});
