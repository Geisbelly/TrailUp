import assert from 'node:assert/strict';
import test from 'node:test';
import { chavesDaRotaParaApagar } from './chavesDoCacheDaRota';

// Com a mistura ligada, a chave do cache da trilha leva os pesos (`chaveDoPerfilDaRota`). Cada
// mudança de afinidade e a primeira renderização com `perfis = []` deixavam uma entrada que nunca
// era apagada.

const BASE = '@trailup/personalizacao-v4/aluno-1/7/';
const ROTA_A = `${BASE}seeker|r1:alternancia:seeker=0.600|survivor=0.400`;
const ROTA_B = `${BASE}seeker|r1:alternancia:seeker=0.550|survivor=0.450`;
const ROTA_OUTRO_ATIVO = `${BASE}survivor|r1:alternancia:seeker=0.550|survivor=0.450`;

test('apaga as assinaturas velhas da mesma turma e guarda a atual', () => {
  assert.deepEqual(chavesDaRotaParaApagar([ROTA_A, ROTA_B, ROTA_OUTRO_ATIVO], BASE, ROTA_B), [ROTA_A, ROTA_OUTRO_ATIVO]);
});

test('não apaga a chave de perfil puro: é a da mistura desligada, no máximo 7 por turma', () => {
  assert.deepEqual(chavesDaRotaParaApagar([`${BASE}seeker`, `${BASE}survivor`, ROTA_A], BASE, ROTA_B), [ROTA_A]);
});

test('com a mistura desligada, as assinaturas que sobraram também saem', () => {
  assert.deepEqual(chavesDaRotaParaApagar([ROTA_A, `${BASE}seeker`], BASE, `${BASE}seeker`), [ROTA_A]);
});

test('não toca em outra turma, outro aluno nem outro cache', () => {
  const outras = [
    '@trailup/personalizacao-v4/aluno-1/8/seeker|r1:alternancia:seeker=1.000',
    '@trailup/personalizacao-v4/aluno-2/7/seeker|r1:alternancia:seeker=1.000',
    '@trailup/progresso-itens-v1/aluno-1/7/seeker|r1:alternancia:seeker=1.000',
    '@trailup/personalizacao-v4/aluno-1/70/seeker|r1:alternancia:seeker=1.000',
  ];
  assert.deepEqual(chavesDaRotaParaApagar(outras, BASE, ROTA_B), []);
});

test('base sem barra no fim não casa com a turma de prefixo parecido', () => {
  assert.deepEqual(
    chavesDaRotaParaApagar(['@trailup/personalizacao-v4/aluno-1/70/seeker|x'], '@trailup/personalizacao-v4/aluno-1/7', `${BASE}seeker`),
    [],
  );
});
