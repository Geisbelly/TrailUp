import assert from 'node:assert/strict';
import test from 'node:test';
import { persistStudyInterval, type StudyIntervalCallbacks } from './studyIntervalPersistence';

const baseBlock = {
  key: 'k', topicoId: 135, isPersonalizedLocal: false,
  itemKey: null, itemTitle: null, itemKind: 'content' as const,
};

function registrador(telemetrySessionActive: boolean) {
  const chamadas: string[] = [];
  const anota = (nome: string) => async (...args: unknown[]) => { chamadas.push(`${nome}:${args.slice(0, 3).join(',')}`); };
  const callbacks = {
    registrarTempoTopico: anota('visita-topico'),
    registrarTempoConteudo: anota('visita-conteudo'),
    registrarTempoAtividade: anota('visita-atividade'),
    // O caminho antigo de "tempo direto" credita tópico, conteúdo e atividade
    // de uma vez. Fica aqui como espião: nenhum intervalo pode passar por ele.
    registrarTempoDireto: anota('direto'),
    registrarSessaoConteudo: anota('sessao-content'),
    registrarSessaoAtividade: anota('sessao-activity'),
    salvarProgressoItemPersonalizado: anota('item-personalizado'),
    telemetrySessionActive,
    flushTelemetryTime: anota('flush-telemetria'),
  } as StudyIntervalCallbacks;
  return { chamadas, callbacks };
}

const intervaloDeAtividadeVinculada = {
  block: { ...baseBlock, itemKind: 'activity' as const, conteudoId: 195, atividadeId: 1103 },
  startedAtMs: 1_000, endedAtMs: 61_000, minutes: 1,
};

test('telemetria desligada: atividade vinculada a conteúdo grava só a sessão de activity', async () => {
  // Bug real (22/09, tópico 135): sem telemetria o intervalo ia para o caminho
  // "direto", que somava o mesmo minuto no tópico (já contado pela tela do
  // tópico), no conteúdo 195 e na atividade 1103 ao mesmo tempo.
  const { chamadas, callbacks } = registrador(false);
  await persistStudyInterval(intervaloDeAtividadeVinculada, callbacks);

  assert.equal(chamadas.filter((c) => c.startsWith('direto')).length, 0, chamadas.join(' | '));
  assert.deepEqual(chamadas.filter((c) => c.startsWith('sessao-')), ['sessao-activity:135,1103,1000']);
});

test('telemetria desligada: conteúdo grava a sessão de content, sem crédito extra no tópico', async () => {
  const { chamadas, callbacks } = registrador(false);
  await persistStudyInterval(
    { block: { ...baseBlock, conteudoId: 195, atividadeId: null }, startedAtMs: 1_000, endedAtMs: 31_000, minutes: 0.5 },
    callbacks,
  );

  assert.equal(chamadas.filter((c) => c.startsWith('direto')).length, 0, chamadas.join(' | '));
  assert.deepEqual(chamadas.filter((c) => c.startsWith('sessao-')), ['sessao-content:135,195,1000']);
});

test('a telemetria só é descarregada quando a sessão de telemetria está ativa', async () => {
  const desligada = registrador(false);
  await persistStudyInterval(intervaloDeAtividadeVinculada, desligada.callbacks);
  assert.equal(desligada.chamadas.filter((c) => c.startsWith('flush-telemetria')).length, 0);

  const ligada = registrador(true);
  await persistStudyInterval(intervaloDeAtividadeVinculada, ligada.callbacks);
  assert.equal(ligada.chamadas.filter((c) => c.startsWith('flush-telemetria')).length, 1);
});

test('a sessão chega ao banco antes de a tela recarregar o tópico', async () => {
  // registrarTempoTopico recarrega o tópico (refreshTopico); se rodar antes da
  // sessão, a tela mostra o tempo de antes do intervalo.
  for (const telemetria of [false, true]) {
    const { chamadas, callbacks } = registrador(telemetria);
    await persistStudyInterval(intervaloDeAtividadeVinculada, callbacks);
    const sessao = chamadas.findIndex((c) => c.startsWith('sessao-activity'));
    const recarga = chamadas.findIndex((c) => c.startsWith('visita-topico'));
    assert.ok(sessao >= 0 && recarga > sessao, `telemetria=${telemetria}: ${chamadas.join(' | ')}`);
  }
});
