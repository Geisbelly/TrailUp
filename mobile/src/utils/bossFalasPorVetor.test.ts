import assert from 'node:assert/strict';
import test from 'node:test';
import { montarFalasDoAluno, perfilDoBoss, pesosDeBatalha } from './bossFalasPorVetor';

// Fase 3 do roteiro de diversidade: o boss falava só com a voz do perfil ativo. Agora cada boss
// fala com a voz de um perfil de batalha representativo do aluno, sorteado na proporção do vetor.

const linha = (conteudo_id: number, perfil: string, nome: string) => ({
  conteudo_id,
  perfil,
  nome,
  falas: { entrada: [`entrada de ${nome}`], dano: [`golpe em ${nome}`] },
});

test('pesos ficam só com os perfis de batalha representativos e somam 1', () => {
  const pesos = pesosDeBatalha(
    [
      { nome: 'daredevil', afinidade: 40 },
      { nome: 'achiever', afinidade: 30 }, // representativo, mas sem batalha
      { nome: 'survivor', afinidade: 20 },
      { nome: 'conqueror', afinidade: 10 }, // tem batalha, mas não é representativo
    ],
    'achiever',
  );
  assert.deepEqual(
    pesos.map((p) => p.perfil),
    ['daredevil', 'survivor'],
  );
  assert.ok(Math.abs(pesos[0].peso - 40 / 60) < 1e-9);
  assert.ok(Math.abs(pesos.reduce((soma, p) => soma + p.peso, 0) - 1) < 1e-9);
});

test('sem perfil de batalha representativo, fica o perfil ativo, como antes', () => {
  assert.deepEqual(pesosDeBatalha([{ nome: 'seeker', afinidade: 60 }, { nome: 'socializer', afinidade: 40 }], 'seeker'), [
    { perfil: 'seeker', peso: 1 },
  ]);
  assert.deepEqual(pesosDeBatalha(null, 'mastermind'), [{ perfil: 'mastermind', peso: 1 }]);
});

test('o sorteio é estável: o mesmo aluno e conteúdo dão sempre o mesmo perfil', () => {
  const pesos = [
    { perfil: 'daredevil', peso: 0.5 },
    { perfil: 'conqueror', peso: 0.5 },
  ] as const;
  const primeiro = perfilDoBoss([...pesos], 'aluno-1:192');
  for (let i = 0; i < 20; i += 1) assert.equal(perfilDoBoss([...pesos], 'aluno-1:192'), primeiro);
});

test('o sorteio segue a proporção do vetor ao longo da trilha', () => {
  const pesos = [
    { perfil: 'daredevil' as const, peso: 0.7 },
    { perfil: 'survivor' as const, peso: 0.3 },
  ];
  let daredevil = 0;
  const total = 2000;
  for (let conteudo = 1; conteudo <= total; conteudo += 1) {
    if (perfilDoBoss(pesos, `aluno-7:${conteudo}`) === 'daredevil') daredevil += 1;
  }
  assert.ok(Math.abs(daredevil / total - 0.7) < 0.04, `daredevil saiu em ${daredevil} de ${total}`);
});

test('perfil único dá sempre o mesmo perfil', () => {
  for (let conteudo = 1; conteudo <= 50; conteudo += 1) {
    assert.equal(perfilDoBoss([{ perfil: 'survivor', peso: 1 }], `a:${conteudo}`), 'survivor');
  }
});

test('cada boss fala com uma voz só, e só entre os perfis que têm falas para ele', () => {
  const linhas = [
    linha(10, 'daredevil', 'Fera'),
    linha(10, 'survivor', 'Sentinela'),
    linha(11, 'survivor', 'Muralha'), // só survivor gerou para o 11
  ];
  const pesos = [
    { perfil: 'daredevil' as const, peso: 0.9 },
    { perfil: 'survivor' as const, peso: 0.1 },
  ];
  const mapa = montarFalasDoAluno(linhas, pesos, 'aluno-1');

  assert.ok(['Fera', 'Sentinela'].includes(mapa[10].nome));
  assert.equal(mapa[10].falas.dano?.[0], `golpe em ${mapa[10].nome}`);
  assert.equal(mapa[11].nome, 'Muralha');
});

test('linha de perfil fora dos pesos não entra', () => {
  const mapa = montarFalasDoAluno([linha(12, 'conqueror', 'Tirano')], [{ perfil: 'survivor', peso: 1 }], 'aluno-1');
  assert.deepEqual(mapa, {});
});
