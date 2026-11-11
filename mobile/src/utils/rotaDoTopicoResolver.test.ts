import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrainHexProfile } from '../constants/brainHexProfiles';
import { politicaDoTopico } from './rotaDeMaterial';
import { perfilDoRegistroCarimbado, podePedirMidiaDoRegistro, resolverRegistrosDoTopico } from './rotaDoTopicoResolver';

// Tarefa 5 da mistura de material por conteúdo: o tópico inteiro passa pela rota.

type Reg = { id: number; conteudo_id: number | null; brainhex_profile_key: BrainHexProfile; materiais: unknown };
const comTexto = { markdown: { payload: { markdown: '# aula' } } };
const reg = (id: number, conteudo_id: number | null, perfil: BrainHexProfile): Reg => ({
  id,
  conteudo_id,
  brainhex_profile_key: perfil,
  materiais: comTexto,
});

const ALUNO = 'aluno-1';
// Busca, e não número mágico: o sorteio é do FNV-1a, e o teste continua valendo se o aluno mudar.
const topicoCom = (politica: 'proporcional' | 'perfil_unico') => {
  for (let id = 1; id < 1000; id += 1) if (politicaDoTopico('alternancia', ALUNO, id).politica === politica) return id;
  throw new Error(`nenhum tópico com ${politica}`);
};

const conteudos = [10, 11, 12, 13].map((id, indice) => ({ id, ordem: indice + 1 }));
const registros = conteudos.flatMap((c, i) => [reg(100 + i, c.id, 'daredevil'), reg(200 + i, c.id, 'survivor')]);
const perfis = [
  { nome: 'daredevil', afinidade: 50 },
  { nome: 'survivor', afinidade: 50 },
];
const base = {
  registros,
  alunoId: ALUNO,
  classeId: 54,
  perfilAtivo: 'survivor' as BrainHexProfile,
  perfis,
  iniciados: new Map<number, BrainHexProfile>(),
  perfilDoRegistro: (r: Reg) => r.brainhex_profile_key,
};

test('chave desligada: só os registros do ativo, sem exposição', () => {
  const r = resolverRegistrosDoTopico({
    ...base,
    topico: { id: topicoCom('proporcional'), conteudos },
    config: { chave: 'desligada', bonus: 0.5 },
  });
  assert.deepEqual(
    r.registros.map((x) => x.id),
    [200, 201, 202, 203],
  );
  assert.deepEqual(r.exposicoes, []);
});

test('alternância num tópico proporcional: mistura os dois perfis e registra cada conteúdo', () => {
  const topicoId = topicoCom('proporcional');
  const r = resolverRegistrosDoTopico({ ...base, topico: { id: topicoId, conteudos }, config: { chave: 'alternancia', bonus: 0 } });
  const perfisUsados = new Set(r.registros.map((x) => x.brainhex_profile_key));
  assert.deepEqual([...perfisUsados].sort(), ['daredevil', 'survivor']);
  assert.equal(r.registros.length, 4);
  assert.equal(r.exposicoes.length, 4);
  for (const e of r.exposicoes) {
    assert.equal(e.politica, 'proporcional');
    assert.equal(e.prob_politica, 0.5);
    assert.equal(e.topico_id, topicoId);
    assert.equal(e.classe_id, 54);
    assert.equal(e.versao_alocador, 'rota-v1');
    assert.deepEqual(e.pesos, { daredevil: 0.5, survivor: 0.5 });
  }
  assert.match(r.assinatura, /^rota-v1:proporcional:/);
});

test('alternância num tópico de perfil único: como hoje, mas com exposição', () => {
  const r = resolverRegistrosDoTopico({
    ...base,
    topico: { id: topicoCom('perfil_unico'), conteudos },
    config: { chave: 'alternancia', bonus: 0.5 },
  });
  assert.deepEqual(
    r.registros.map((x) => x.id),
    [200, 201, 202, 203],
  );
  assert.equal(r.exposicoes.length, 4);
  assert.ok(r.exposicoes.every((e) => e.politica === 'perfil_unico' && e.prob_politica === 0.5));
});

test('conteúdo iniciado em survivor fica em survivor mesmo com 0,9 para o outro', () => {
  const r = resolverRegistrosDoTopico({
    ...base,
    perfis: [
      { nome: 'daredevil', afinidade: 90 },
      { nome: 'survivor', afinidade: 10 },
    ],
    perfilAtivo: 'daredevil',
    iniciados: new Map([[10, 'survivor' as BrainHexProfile]]),
    topico: { id: topicoCom('proporcional'), conteudos },
    config: { chave: 'alternancia', bonus: 0 },
  });
  const doDez = r.registros.filter((x) => x.conteudo_id === 10);
  assert.deepEqual(
    doDez.map((x) => x.brainhex_profile_key),
    ['survivor'],
  );
});

test('perfis vazios: o mesmo que perfil único', () => {
  const topico = { id: topicoCom('proporcional'), conteudos };
  const vazio = resolverRegistrosDoTopico({ ...base, perfis: [], topico, config: { chave: 'alternancia', bonus: 0.5 } });
  const unico = resolverRegistrosDoTopico({
    ...base,
    topico: { id: topicoCom('perfil_unico'), conteudos },
    config: { chave: 'alternancia', bonus: 0.5 },
  });
  assert.deepEqual(
    vazio.registros.map((x) => x.id),
    unico.registros.map((x) => x.id),
  );
});

test('conteúdo cujo registro do ativo não tem material continua com ele (como hoje)', () => {
  const semMaterial = { ...reg(300, 20, 'survivor'), materiais: {} };
  const r = resolverRegistrosDoTopico({
    ...base,
    registros: [...registros, semMaterial],
    topico: { id: topicoCom('proporcional'), conteudos: [...conteudos, { id: 20, ordem: 5 }] },
    config: { chave: 'alternancia', bonus: 0 },
  });
  assert.ok(r.registros.some((x) => x.id === 300));
  assert.ok(!r.exposicoes.some((e) => e.conteudo_id === 20));
});

test('registro sem conteúdo (legado) só fica se for do ativo', () => {
  const r = resolverRegistrosDoTopico({
    ...base,
    registros: [reg(1, null, 'survivor'), reg(2, null, 'daredevil')],
    topico: { id: topicoCom('proporcional'), conteudos: [] },
    config: { chave: 'alternancia', bonus: 0 },
  });
  assert.deepEqual(
    r.registros.map((x) => x.id),
    [1],
  );
});

// O pedido de mídia faltante vai à API sem perfil, e ela gera para o dominante. Registro de outro
// perfil da rota não pode disparar: a geração sairia no perfil errado e nunca o repararia.
test('mídia faltante: só o registro do perfil ativo (ou sem carimbo) pede', () => {
  assert.equal(podePedirMidiaDoRegistro({ brainhex_profile_key: 'survivor' }, 'survivor'), true);
  assert.equal(podePedirMidiaDoRegistro({ brainhex_profile_key: 'Daredevil' }, 'survivor'), false);
  assert.equal(podePedirMidiaDoRegistro({}, 'survivor'), true);
  assert.equal(podePedirMidiaDoRegistro({ brainhex_profile_key: null }, 'survivor'), true);
});

test('perfil carimbado: normaliza e devolve null sem carimbo', () => {
  assert.equal(perfilDoRegistroCarimbado({ brainhex_profile_key: ' Seeker ' }), 'seeker');
  assert.equal(perfilDoRegistroCarimbado({}), null);
});
