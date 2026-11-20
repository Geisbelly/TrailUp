import assert from 'node:assert/strict';
import test from 'node:test';
import {
  criarDetectorDeTrocaDeStatus,
  estadoLocalDoEvento,
  eventoMudaProgresso,
  type TopicoLocal,
} from './ecoRealtime';

const topicos: TopicoLocal[] = [
  {
    id: 206,
    status: 'em andamento',
    percentual_concluido: 82,
    conteudos: [
      { id: 3861, status: 'em andamento', percentual_concluido: 40 },
      { id: 3862, status: 'concluido', percentual_concluido: 100 },
    ],
    atividades: [{ id: 900, status: 'não iniciado', percentual_concluido: null }],
  },
];

const update = (linha: Record<string, unknown>) => ({ eventType: 'UPDATE', new: linha });

test('a visita de minuto em minuto é eco: mesmo status e percentual, só a hora muda', () => {
  const linha = {
    aluno_id: 'a',
    conteudo_id: 3861,
    status: 'em andamento',
    percentual_concluido: 40,
    ultima_visualizacao: '2026-11-20T14:56:00Z',
    updated_at: '2026-11-20T14:56:00Z',
  };
  const local = estadoLocalDoEvento('conteudo_aluno', linha, topicos);
  assert.equal(eventoMudaProgresso(update(linha), local), false);
});

test('o tempo regravado pela telemetria também é eco', () => {
  const linha = { topico_id: 206, status: 'em andamento', percentual_concluido: 82, tempo_gasto_min: 7.7 };
  const local = estadoLocalDoEvento('topico_aluno', linha, topicos);
  assert.equal(eventoMudaProgresso(update(linha), local), false);
});

test('conteúdo concluído em outro aparelho relê', () => {
  const linha = { conteudo_id: 3861, status: 'concluido', percentual_concluido: 100 };
  assert.equal(eventoMudaProgresso(update(linha), estadoLocalDoEvento('conteudo_aluno', linha, topicos)), true);
});

test('percentual do tópico recalculado pelo banco relê, mesmo com o status igual', () => {
  const linha = { topico_id: 206, status: 'em andamento', percentual_concluido: 88 };
  assert.equal(eventoMudaProgresso(update(linha), estadoLocalDoEvento('topico_aluno', linha, topicos)), true);
});

test('acento e caixa do status não contam como mudança', () => {
  const linha = { atividade_id: 900, status: 'nao iniciado' };
  assert.equal(eventoMudaProgresso(update(linha), estadoLocalDoEvento('atividade_aluno', linha, topicos)), false);
  const concluido = { conteudo_id: 3862, status: 'Concluído', percentual_concluido: 100 };
  assert.equal(eventoMudaProgresso(update(concluido), estadoLocalDoEvento('conteudo_aluno', concluido, topicos)), false);
});

test('na dúvida relê: item desconhecido, INSERT, DELETE ou evento sem os campos', () => {
  const desconhecido = { conteudo_id: 1, status: 'em andamento' };
  assert.equal(estadoLocalDoEvento('conteudo_aluno', desconhecido, topicos), null);
  assert.equal(eventoMudaProgresso(update(desconhecido), null), true);

  const conhecido = { conteudo_id: 3861, status: 'em andamento', percentual_concluido: 40 };
  const local = estadoLocalDoEvento('conteudo_aluno', conhecido, topicos);
  assert.equal(eventoMudaProgresso({ eventType: 'INSERT', new: conhecido }, local), true);
  assert.equal(eventoMudaProgresso({ eventType: 'DELETE', new: {} }, local), true);
  assert.equal(eventoMudaProgresso(update({ conteudo_id: 3861, updated_at: 'x' }), local), true);
});

test('o mesmo id em tabelas diferentes não se confunde', () => {
  const linha = { topico_id: 3861, conteudo_id: 206 };
  assert.equal(estadoLocalDoEvento('topico_aluno', linha, topicos), null);
  assert.equal(estadoLocalDoEvento('conteudo_aluno', linha, topicos), null);
});

test('portões: só relê quando o status de alguma linha troca', () => {
  const trocou = criarDetectorDeTrocaDeStatus();
  const visita = (status: string) => update({ conteudo_id: 3861, status, updated_at: String(Math.random()) });
  assert.equal(trocou('conteudo_aluno', visita('em andamento')), true); // primeira vez: sem base
  for (let minuto = 0; minuto < 60; minuto += 1) {
    assert.equal(trocou('conteudo_aluno', visita('em andamento')), false);
  }
  assert.equal(trocou('conteudo_aluno', visita('concluido')), true);
  assert.equal(trocou('topico_aluno', update({ topico_id: 3861, status: 'concluido' })), true);
  assert.equal(trocou('conteudo_aluno', { eventType: 'DELETE', new: {} }), true);
});
