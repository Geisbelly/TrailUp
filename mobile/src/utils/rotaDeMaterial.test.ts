import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrainHexProfile } from '../constants/brainHexProfiles';
import {
  assinaturaDaRota,
  assinaturaDosPerfis,
  candidatosPorConteudo,
  chaveDoPerfilDaRota,
  filtrarRegistrosDaRota,
  pesosDaRota,
  politicaDoTopico,
  rotaDoTopico,
  type PesoDePerfil,
} from './rotaDeMaterial';

// Fase 2 do roteiro de diversidade (spec 2026-11-11-mistura-de-material-por-conteudo): cada
// conteúdo do tópico vem inteiro de um perfil, distribuído pelo vetor por Sainte-Laguë.

const todos = (ids: number[], perfis: BrainHexProfile[]) => new Map(ids.map((id) => [id, perfis]));
const contar = (rota: Map<number, BrainHexProfile>) => {
  const cont: Record<string, number> = {};
  for (const perfil of rota.values()) cont[perfil] = (cont[perfil] ?? 0) + 1;
  return cont;
};
const pesos6040: PesoDePerfil[] = [
  { perfil: 'daredevil', peso: 0.6 },
  { perfil: 'survivor', peso: 0.4 },
];

test('perfil único: todo conteúdo que tem o ativo vai para o ativo', () => {
  const rota = rotaDoTopico({
    conteudos: [1, 2, 3],
    candidatos: new Map<number, BrainHexProfile[]>([
      [1, ['daredevil', 'survivor']],
      [2, ['daredevil', 'survivor']],
      [3, ['daredevil']],
    ]),
    pesos: pesos6040,
    perfilAtivo: 'survivor',
    politica: 'perfil_unico',
    iniciados: new Map(),
  });
  assert.deepEqual([...rota], [
    [1, 'survivor'],
    [2, 'survivor'],
  ]);
});

test('proporcional: 60/40 em 10 conteúdos dá 6 e 4', () => {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const rota = rotaDoTopico({
    conteudos: ids,
    candidatos: todos(ids, ['daredevil', 'survivor']),
    pesos: pesos6040,
    perfilAtivo: 'daredevil',
    politica: 'proporcional',
    iniciados: new Map(),
  });
  assert.deepEqual(contar(rota), { daredevil: 6, survivor: 4 });
});

test('conteúdo iniciado mantém o perfil e conta cadeira', () => {
  const rota = rotaDoTopico({
    conteudos: [1, 2],
    candidatos: todos([1, 2], ['daredevil', 'survivor']),
    pesos: [
      { perfil: 'daredevil', peso: 0.5 },
      { perfil: 'survivor', peso: 0.5 },
    ],
    perfilAtivo: 'survivor',
    politica: 'proporcional',
    iniciados: new Map([[1, 'survivor' as BrainHexProfile]]),
  });
  assert.equal(rota.get(1), 'survivor');
  assert.equal(rota.get(2), 'daredevil');
});

test('iniciado vale também na política de perfil único', () => {
  const rota = rotaDoTopico({
    conteudos: [1, 2],
    candidatos: todos([1, 2], ['daredevil', 'survivor']),
    pesos: pesos6040,
    perfilAtivo: 'survivor',
    politica: 'perfil_unico',
    iniciados: new Map([[1, 'daredevil' as BrainHexProfile]]),
  });
  assert.equal(rota.get(1), 'daredevil');
  assert.equal(rota.get(2), 'survivor');
});

test('acrescentar um conteúdo no fim não muda os anteriores', () => {
  const base = {
    pesos: pesos6040,
    perfilAtivo: 'daredevil' as BrainHexProfile,
    politica: 'proporcional' as const,
    iniciados: new Map<number, BrainHexProfile>(),
  };
  const cinco = rotaDoTopico({ ...base, conteudos: [1, 2, 3, 4, 5], candidatos: todos([1, 2, 3, 4, 5], ['daredevil', 'survivor']) });
  const seis = rotaDoTopico({ ...base, conteudos: [1, 2, 3, 4, 5, 6], candidatos: todos([1, 2, 3, 4, 5, 6], ['daredevil', 'survivor']) });
  for (const id of [1, 2, 3, 4, 5]) assert.equal(seis.get(id), cinco.get(id));
});

test('conteúdo sem candidato fica fora (material do professor)', () => {
  const rota = rotaDoTopico({
    conteudos: [1, 2],
    candidatos: new Map<number, BrainHexProfile[]>([[1, ['daredevil']]]),
    pesos: pesos6040,
    perfilAtivo: 'daredevil',
    politica: 'proporcional',
    iniciados: new Map(),
  });
  assert.deepEqual([...rota], [[1, 'daredevil']]);
});

test('no empate de quociente ganha o perfil ativo', () => {
  const rota = rotaDoTopico({
    conteudos: [1],
    candidatos: todos([1], ['daredevil', 'survivor']),
    pesos: [
      { perfil: 'daredevil', peso: 0.5 },
      { perfil: 'survivor', peso: 0.5 },
    ],
    perfilAtivo: 'survivor',
    politica: 'proporcional',
    iniciados: new Map(),
  });
  assert.equal(rota.get(1), 'survivor');
});

test('chave desligada: sempre perfil único, com probabilidade 1', () => {
  assert.deepEqual(politicaDoTopico('desligada', 'aluno-1', 7), { politica: 'perfil_unico', probabilidade: 1 });
});

test('alternância: estável e perto de metade a metade', () => {
  const primeira = politicaDoTopico('alternancia', 'aluno-1', 7);
  assert.deepEqual(politicaDoTopico('alternancia', 'aluno-1', 7), primeira);
  assert.equal(primeira.probabilidade, 0.5);
  let proporcional = 0;
  for (let topico = 1; topico <= 2000; topico += 1) {
    if (politicaDoTopico('alternancia', 'aluno-9', topico).politica === 'proporcional') proporcional += 1;
  }
  assert.ok(proporcional / 2000 > 0.45 && proporcional / 2000 < 0.55, `proporcional em ${proporcional} de 2000`);
});

test('pesos: representativos com bônus no ativo, normalizados', () => {
  const pesos = pesosDaRota(
    [
      { nome: 'seeker', afinidade: 60 },
      { nome: 'survivor', afinidade: 40 },
    ],
    'survivor',
    0.5,
  );
  // survivor 40 × 1,5 = 60; seeker 60; soma 120.
  assert.deepEqual(
    pesos.map((p) => [p.perfil, Number(p.peso.toFixed(3))]),
    [
      ['seeker', 0.5],
      ['survivor', 0.5],
    ],
  );
});

test('pesos sem perfis: o ativo inteiro', () => {
  assert.deepEqual(pesosDaRota([], 'mastermind', 0.5), [{ perfil: 'mastermind', peso: 1 }]);
  assert.deepEqual(pesosDaRota(null, 'achiever', 0.5), [{ perfil: 'achiever', peso: 1 }]);
});

test('ativo fora dos representativos (conta de demonstração) entra com o bônus sobre zero', () => {
  // Sem afinidade, o ativo não ganha peso: a mistura fica com os representativos.
  const pesos = pesosDaRota([{ nome: 'seeker', afinidade: 60 }], 'achiever', 0.5);
  assert.deepEqual(pesos, [{ perfil: 'seeker', peso: 1 }]);
});

test('assinatura muda com a política e com os pesos', () => {
  const a = assinaturaDaRota('proporcional', pesos6040);
  assert.equal(a, 'rota-v1:proporcional:daredevil=0.600|survivor=0.400');
  assert.notEqual(assinaturaDaRota('perfil_unico', pesos6040), a);
});

test('chave do perfil da rota: desligada é o perfil puro; ligada leva os pesos', () => {
  assert.equal(chaveDoPerfilDaRota('desligada', 'survivor', pesos6040), 'survivor');
  assert.equal(chaveDoPerfilDaRota('alternancia', 'survivor', pesos6040), 'survivor|rota-v1:alternancia:daredevil=0.600|survivor=0.400');
});

test('assinatura dos perfis: mesmo conteúdo dá a mesma string, mesmo em array novo', () => {
  const a = [
    { nome: 'Seeker', afinidade: 60 },
    { nome: 'survivor', afinidade: 40 },
  ];
  const b = a.map((p) => ({ ...p }));
  assert.notEqual(a, b);
  assert.equal(assinaturaDosPerfis(a), assinaturaDosPerfis(b));
  assert.notEqual(assinaturaDosPerfis(a), assinaturaDosPerfis([{ nome: 'seeker', afinidade: 61 }, { nome: 'survivor', afinidade: 40 }]));
  assert.equal(assinaturaDosPerfis(null), assinaturaDosPerfis([]));
});

// --------------------------------------------------------------------------- registros da rota

type Reg = { id: number; conteudo_id: number | null; perfil: BrainHexProfile; materiais?: unknown };
const comTexto = { markdown: { payload: { markdown: '# aula' } } };
const reg = (id: number, conteudo_id: number | null, perfil: BrainHexProfile, materiais: unknown = comTexto): Reg => ({
  id,
  conteudo_id,
  perfil,
  materiais,
});
const perfilDe = (r: Reg) => r.perfil;

test('candidatos: só perfis da rota com material utilizável, na ordem da rota', () => {
  const candidatos = candidatosPorConteudo(
    [reg(1, 10, 'survivor'), reg(2, 10, 'daredevil'), reg(3, 11, 'daredevil', {}), reg(4, 11, 'seeker')],
    ['daredevil', 'survivor'],
    perfilDe,
  );
  assert.deepEqual(candidatos.get(10), ['daredevil', 'survivor']);
  // 11: o daredevil não tem material, e seeker não é da rota.
  assert.equal(candidatos.has(11), false);
});

test('filtro: fica o registro do perfil que a rota deu ao conteúdo', () => {
  const registros = [reg(1, 10, 'daredevil'), reg(2, 10, 'survivor'), reg(3, 11, 'daredevil')];
  const rota = new Map<number, BrainHexProfile>([
    [10, 'survivor'],
    [11, 'daredevil'],
  ]);
  assert.deepEqual(
    filtrarRegistrosDaRota(registros, rota, 'daredevil', perfilDe).map((r) => r.id),
    [2, 3],
  );
});

test('filtro: registro sem conteúdo só fica se for do perfil ativo', () => {
  const registros = [reg(1, null, 'survivor'), reg(2, null, 'daredevil')];
  assert.deepEqual(
    filtrarRegistrosDaRota(registros, new Map(), 'daredevil', perfilDe).map((r) => r.id),
    [2],
  );
});

test('filtro: conteúdo fora da rota não entra (vai pelo material do professor)', () => {
  assert.deepEqual(filtrarRegistrosDaRota([reg(1, 12, 'daredevil')], new Map(), 'daredevil', perfilDe), []);
});
