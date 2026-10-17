import assert from 'node:assert/strict';
import test from 'node:test';
import { houveVisita, payloadDeVisitaDoTopico } from './visitaDoTopico';

/**
 * Substitui `services/progressoTrilha.canonicalProgress.test.ts`, que fixava a
 * mesma regra numa funcao SEM NENHUM chamador em producao -- o modulo inteiro
 * era morto, e o teste dava a impressao de que o caminho estava guardado.
 * Agora o alvo e o payload que o app realmente grava.
 */

const DERIVADOS_NO_BANCO = ['status', 'percentual_concluido', 'tempo_gasto_min'] as const;

test('o payload de visita nao carrega nada que o banco deriva', () => {
  const payload = payloadDeVisitaDoTopico({
    alunoId: 'aluno-1',
    topicoId: 42,
    ultimaAtividade: 9,
    agoraIso: '2026-10-17T12:00:00.000Z',
  });

  for (const campo of DERIVADOS_NO_BANCO) {
    assert.equal(campo in payload, false, `${campo} e derivado no banco e nao pode ser gravado daqui`);
  }
});

test('o payload leva exatamente os metadados de visita', () => {
  assert.deepEqual(
    payloadDeVisitaDoTopico({
      alunoId: 'aluno-1',
      topicoId: 42,
      ultimaAtividade: 9,
      agoraIso: '2026-10-17T12:00:00.000Z',
    }),
    {
      aluno_id: 'aluno-1',
      topico_id: 42,
      ultima_atividade: 9,
      ultima_visualizacao: '2026-10-17T12:00:00.000Z',
      updated_at: '2026-10-17T12:00:00.000Z',
    }
  );
});

test('tópico sem última atividade grava null, não undefined', () => {
  const payload = payloadDeVisitaDoTopico({ alunoId: 'a', topicoId: 1, agoraIso: 'x' });
  assert.equal(payload.ultima_atividade, null);
  assert.equal('ultima_atividade' in payload, true);
});

test('o tempo e condicao da visita, nunca conteudo dela', () => {
  assert.equal(houveVisita(0.5), true);
  assert.equal(houveVisita(0), false);
  assert.equal(houveVisita(-3), false);
  assert.equal(houveVisita(null), false);
  assert.equal(houveVisita(undefined), false);
  assert.equal(houveVisita('nao e numero'), false);
  assert.equal(houveVisita(Number.NaN), false);
  assert.equal(houveVisita(Number.POSITIVE_INFINITY), false);
});
