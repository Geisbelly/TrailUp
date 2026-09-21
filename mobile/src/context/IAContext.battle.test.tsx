import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require('react-dom/server') as { renderToString: (element: React.ReactElement) => string };
const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { exports };
};
mockModule('@/context/SessaoContext', { useUsuario: () => ({ usuario: { id: 'aluno', perfilAtivo: 'conqueror', perfis: [{ nome: 'conqueror', afinidade: 100 }] } }) });
mockModule('@/constants/profileImages', { getBrainHexGuideName: () => 'Guia' });
mockModule('@react-native-async-storage/async-storage', { __esModule: true, default: { getItem: async () => null, setItem: async () => undefined } });
mockModule('@/utils/trilhaCheckpoint', { clearTrilhaCheckpoint: async () => undefined });
const { IAProvider, useIA } = require('./IAContext') as typeof import('./IAContext');
const { useTopicoCompletion } = require('@/hooks/trilha/useTopicoCompletion') as typeof import('@/hooks/trilha/useTopicoCompletion');

test('provider real recebe acerto + conclusão sem render intermediário e conserva ambos os danos', () => {
  let context!: ReturnType<typeof useIA>;
  function Probe() { context = useIA(); return null; }
  // No effects/network: exercise exactly the two signals in the same render.
  renderToString(<IAProvider><Probe /></IAProvider>);
  const scope = { scope: 'topic', topicoId: 131 } as const;
  context.emitSignal({ type: 'topic_open', topicoId: 131 });
  assert.equal(context.getBattleState(scope)?.currentHp, 180);
  context.emitSignal({ type: 'activity_correct', topicoId: 131, activityId: 1068, meta: { acertosPercentual: 100 } });
  context.emitSignal({ type: 'activity_complete', topicoId: 131, activityId: 1068, meta: { acertosPercentual: 100 } });
  const state = context.getBattleState(scope);
  assert.equal(state?.totalDamage, 59);
  assert.equal(state?.currentShield, 0);
  assert.equal(state?.currentHp, 157);
  context.emitSignal({ type: 'content_open', topicoId: 131, contentId: 192 });
  assert.equal(context.getBattleState(scope)?.currentHp, 157, 'reabrir não restaura a vida');
});

test('concluir tópico preserva o dano para o perfil e para reabrir a batalha', async () => {
  let context!: ReturnType<typeof useIA>;
  let completion!: ReturnType<typeof useTopicoCompletion>;
  function Probe() {
    context = useIA();
    completion = useTopicoCompletion({
      topicoId: 131, topico: { id: 131, percentual_concluido: 100, next: [] },
      topicoConcluido: true, todosBlocosConcluidos: true, bloqueiaAvanco: false, atualBlock: null,
      getProximosTopicos: () => [], showDialog: () => undefined,
      flushStudyBatch: async () => null, recordAppEvent: () => undefined,
      // Also detects a regression if the old hook starts invoking this again.
      resetBattleState: context.resetBattleState,
    } as any);
    return null;
  }
  renderToString(<IAProvider><Probe /></IAProvider>);
  context.emitSignal({ type: 'content_complete', topicoId: 131, contentId: 192 });
  const scope = { scope: 'topic', topicoId: 131 } as const;
  const before = context.getBattleState(scope);
  assert.equal(before?.totalDamage, 12);
  await completion.handleConcluirTopico();
  assert.deepEqual(context.getBattleState(scope), before);
});
