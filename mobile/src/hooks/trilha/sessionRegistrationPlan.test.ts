import assert from 'node:assert/strict';
import test from 'node:test';
import { planSessionRegistrations } from './sessionRegistrationPlan';

const baseBlock = {
  key: 'k', topicoId: 131, isPersonalizedLocal: false,
  itemKey: null, itemTitle: null, itemKind: 'content' as const,
};

test('bloco de conteúdo gera plano de sessão de content', () => {
  const plans = planSessionRegistrations({
    block: { ...baseBlock, conteudoId: 192, atividadeId: null },
    startedAtMs: 1000, endedAtMs: 4000, minutes: 0.05,
  });
  assert.deepEqual(plans, [
    { scope: 'content', topicoId: 131, conteudoId: 192, atividadeId: null, startedAtMs: 1000, endedAtMs: 4000 },
  ]);
});

test('bloco de atividade gera plano de sessão de activity', () => {
  const plans = planSessionRegistrations({
    block: { ...baseBlock, conteudoId: null, atividadeId: 55, itemKind: 'activity' },
    startedAtMs: 1000, endedAtMs: 4000, minutes: 0.05,
  });
  assert.deepEqual(plans, [
    { scope: 'activity', topicoId: 131, conteudoId: null, atividadeId: 55, startedAtMs: 1000, endedAtMs: 4000 },
  ]);
});

test('atividade vinculada a um conteudo (vinculadoConteudoId) gera SO a sessao de activity, nao as duas', () => {
  // atualBlock.vinculadoConteudoId preenche conteudoId no bloco de atividade
  // (ver [id].tsx) so como referencia -- nao significa que o aluno esteja
  // consumindo o conteudo separadamente. Emitir os dois contava o mesmo
  // intervalo duas vezes (bug real: sessoes de content e activity com os
  // mesmos aberto_em/fechado_em no banco).
  const plans = planSessionRegistrations({
    block: { ...baseBlock, itemKind: 'activity', conteudoId: 194, atividadeId: 1100 },
    startedAtMs: 1000, endedAtMs: 4000, minutes: 0.05,
  });
  assert.deepEqual(plans, [
    { scope: 'activity', topicoId: 131, conteudoId: null, atividadeId: 1100, startedAtMs: 1000, endedAtMs: 4000 },
  ]);
});

test('bloco de cards conta como sessao de content', () => {
  const plans = planSessionRegistrations({
    block: { ...baseBlock, itemKind: 'cards', conteudoId: 200, atividadeId: null },
    startedAtMs: 1000, endedAtMs: 4000, minutes: 0.05,
  });
  assert.deepEqual(plans, [
    { scope: 'content', topicoId: 131, conteudoId: 200, atividadeId: null, startedAtMs: 1000, endedAtMs: 4000 },
  ]);
});

test('ids zero ou negativos não geram plano', () => {
  const plans = planSessionRegistrations({
    block: { ...baseBlock, conteudoId: 0, atividadeId: -1 },
    startedAtMs: 1000, endedAtMs: 4000, minutes: 0.05,
  });
  assert.deepEqual(plans, []);
});
