import assert from 'node:assert/strict';
import test from 'node:test';
import type { IABattleConfig, IACharacterCue } from '../interfaces/personalizacao/IAContracts';
import { aplicarFalasNoBoss, conteudoDoBoss, cueDoBoss, duracaoDaFala, enfileirarCue, escolherFala, falaDoGolpe, lerFalasDoBoss, MOMENTOS_BOSS } from './bossFalas';

const linha = {
  conteudo_id: 192,
  nome: 'Guardiã das Frações',
  falas: {
    entrada: ['Você acha que divide um inteiro sem mim?'],
    derrota: ['O denominador era seu desde o início.'],
    dano: ['Esse numerador doeu!', 'Equivalência certeira, hein.'],
    metade_vida: ['Metade de mim já virou fração sua.'],
    um_quarto_vida: ['Só me resta um quarto de inteiro.'],
    alerta_tempo: ['O tempo se divide e está acabando.'],
    contra_ataque: ['Recompus meu inteiro. De novo!'],
    vitoria: ['Você dominou as frações deste conteúdo.'],
  },
};
const mapa = lerFalasDoBoss([linha]);
const sombra: IABattleConfig = {
  enemy: { id: 'sombra-do-topico', name: 'Sombra do Tópico', hpMax: 100, introLine: 'Eu vou cair conforme você avançar.', defeatLine: 'Você dominou este tópico.' },
  victoryMessage: 'Tópico dominado. O inimigo foi derrotado.',
};

test('lê as linhas de boss_falas por conteúdo, com todos os momentos', () => {
  assert.deepEqual(Object.keys(mapa), ['192']);
  assert.equal(mapa[192].nome, 'Guardiã das Frações');
  assert.deepEqual(Object.keys(mapa[192].falas).sort(), [...MOMENTOS_BOSS].sort());
});

test('linha malformada some e momento malformado cai na fala fixa', () => {
  const lido = lerFalasDoBoss([
    { conteudo_id: 'x', nome: 'A', falas: {} },
    { conteudo_id: 5, nome: '  ', falas: {} },
    { conteudo_id: 6, nome: 'Eco', falas: { dano: ['ok, golpe', 3, ''], entrada: 'não é lista' } },
    { conteudo_id: 7, nome: 'Sem falas', falas: null },
  ]);
  assert.deepEqual(Object.keys(lido).sort(), ['6', '7']);
  assert.deepEqual(lido[6].falas, { dano: ['ok, golpe'] });
  assert.deepEqual(lido[7].falas, {});
  assert.deepEqual(lerFalasDoBoss(null), {});
});

test('o conteúdo do boss vem do escopo, senão do inimigo', () => {
  assert.equal(conteudoDoBoss('content:192', null), 192);
  assert.equal(conteudoDoBoss(null, { itemKey: 'content:7', contentId: 9 }), 7);
  assert.equal(conteudoDoBoss('question:3', { contentId: 9 }), 9);
  assert.equal(conteudoDoBoss(null, null), null);
});

test('aplica nome e falas geradas sem trocar o id do boss', () => {
  const aplicado = aplicarFalasNoBoss(sombra, mapa, 'content:192');
  // O id entra na chave do estado salvo: trocá-lo zeraria a vida do boss do aluno.
  assert.equal(aplicado.enemy.id, 'sombra-do-topico');
  assert.equal(aplicado.enemy.name, 'Guardiã das Frações');
  assert.equal(aplicado.enemy.introLine, linha.falas.entrada[0]);
  assert.equal(aplicado.enemy.defeatLine, linha.falas.derrota[0]);
  assert.equal(aplicado.enemy.contentId, 192);
  assert.equal(aplicado.victoryMessage, linha.falas.vitoria[0]);
});

test('sem falas para o conteúdo, o boss fica como estava', () => {
  assert.equal(aplicarFalasNoBoss(sombra, mapa, 'content:999'), sombra);
  assert.equal(aplicarFalasNoBoss(sombra, mapa, null), sombra);
  assert.equal(aplicarFalasNoBoss(sombra, {}, 'content:192'), sombra);
  const soNome = aplicarFalasNoBoss(sombra, { 192: { nome: 'Eco', falas: {} } }, 'content:192');
  assert.equal(soNome.enemy.name, 'Eco');
  assert.equal(soNome.enemy.introLine, sombra.enemy.introLine);
  assert.equal(soNome.victoryMessage, sombra.victoryMessage);
});

test('confronto do módulo com sourceItemKey também recebe as falas', () => {
  const aplicado = aplicarFalasNoBoss({ ...sombra, sourceItemKey: 'content:192' }, mapa, null);
  assert.equal(aplicado.enemy.name, 'Guardiã das Frações');
});

test('sorteia entre as falas do momento e devolve null sem fala', () => {
  assert.equal(escolherFala(mapa[192], 'dano', () => 0), 'Esse numerador doeu!');
  assert.equal(escolherFala(mapa[192], 'dano', () => 0.99), 'Equivalência certeira, hein.');
  assert.equal(escolherFala(mapa[192], 'dano', () => 1), 'Equivalência certeira, hein.');
  assert.equal(escolherFala(undefined, 'dano'), null);
  assert.equal(escolherFala({ nome: 'Eco', falas: {} }, 'entrada'), null);
});

const golpe = (hpAntes: number, hpDepois: number, extra: Partial<Parameters<typeof falaDoGolpe>[0]> = {}) =>
  falaDoGolpe({ falas: mapa[192], hpAntes, hpDepois, hpMax: 100, derrotado: false, aleatorio: () => 0, ...extra });

test('golpe comum provoca; cruzar metade e um quarto anuncia o marco uma vez', () => {
  assert.deepEqual(golpe(100, 80), { momento: 'dano', texto: 'Esse numerador doeu!', marcos: [] });
  const metade = golpe(60, 45);
  assert.equal(metade.momento, 'metade_vida');
  assert.deepEqual(metade.marcos, ['metade_vida']);
  // Já anunciado: o próximo golpe abaixo de 50% volta a ser provocação.
  assert.equal(golpe(45, 40, { marcosAnunciados: ['metade_vida'] }).momento, 'dano');
  const quarto = golpe(30, 20, { marcosAnunciados: ['metade_vida'] });
  assert.equal(quarto.momento, 'um_quarto_vida');
  assert.deepEqual(quarto.marcos, ['metade_vida', 'um_quarto_vida']);
});

test('um golpe que cruza os dois marcos anuncia o quarto e marca os dois', () => {
  const r = golpe(80, 20);
  assert.equal(r.momento, 'um_quarto_vida');
  assert.deepEqual(r.marcos.sort(), ['metade_vida', 'um_quarto_vida']);
});

test('golpe final fala a derrota, não provoca', () => {
  const r = golpe(10, 0, { derrotado: true });
  assert.equal(r.momento, 'derrota');
  assert.equal(r.texto, linha.falas.derrota[0]);
});

test('sem falas geradas, nenhum golpe fala (a batalha fica como era)', () => {
  for (const [antes, depois, derrotado] of [[100, 80, false], [60, 45, false], [10, 0, true]] as const) {
    assert.equal(golpe(antes, depois, { falas: undefined, derrotado }).texto, null);
  }
  // O marco cruzado conta mesmo sem fala: não volta a disparar quando as falas chegarem.
  assert.deepEqual(golpe(60, 45, { falas: undefined }).marcos, ['metade_vida']);
});

const cue = (id: string, extra: Partial<IACharacterCue> = {}): IACharacterCue => ({ id, message: id, createdAt: 0, ...extra });

test('o balão pega o aviso do boss deste tópico e deste conteúdo, nunca o do guia', () => {
  const fila = [
    cue('guia', { featureKey: 'mentor_character', topicoId: 131 }),
    cue('outro-topico', { featureKey: 'battle_mode', topicoId: 9 }),
    cue('outro-conteudo', { featureKey: 'battle_mode', topicoId: 131, itemKey: 'content:7' }),
    cue('boss', { featureKey: 'battle_mode', topicoId: 131, itemKey: 'content:192' }),
  ];
  assert.equal(cueDoBoss(fila, 131, 'content:192')?.id, 'boss');
  // Confronto do módulo: qualquer aviso do boss do tópico.
  assert.equal(cueDoBoss(fila, 131, null)?.id, 'outro-conteudo');
  assert.equal(cueDoBoss(fila, null, null), null);
  assert.equal(cueDoBoss([fila[0]], 131, null), null);
});

test('a fala fica na tela o tempo de ler: 6 s a 12 s', () => {
  assert.equal(duracaoDaFala('Curta.'), 6000);
  assert.ok(duracaoDaFala('x'.repeat(120)) > 6000);
  assert.equal(duracaoDaFala('x'.repeat(400)), 12000);
});

test('falas do boss não empurram a dica do guia para fora da fila', () => {
  let fila: IACharacterCue[] = [cue('guia', { featureKey: 'mentor_character' })];
  for (let i = 0; i < 6; i += 1) fila = enfileirarCue(fila, cue(`golpe-${i}`, { featureKey: 'battle_mode' }));
  assert.deepEqual(fila.map((c) => c.id), ['guia', 'golpe-4', 'golpe-5']);
  for (let i = 0; i < 5; i += 1) fila = enfileirarCue(fila, cue(`dica-${i}`));
  assert.deepEqual(fila.filter((c) => c.featureKey !== 'battle_mode').map((c) => c.id), ['dica-2', 'dica-3', 'dica-4']);
  assert.deepEqual(fila.filter((c) => c.featureKey === 'battle_mode').map((c) => c.id), ['golpe-4', 'golpe-5']);
});

