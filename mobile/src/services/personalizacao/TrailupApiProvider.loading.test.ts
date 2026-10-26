import assert from 'node:assert/strict';
import test from 'node:test';
/* eslint-disable @typescript-eslint/no-require-imports */
const dbPath = require.resolve('@/database/supabase');
(require.cache as Record<string, unknown>)[dbPath] = { exports: { supabase: {} } };
const apiPath = require.resolve('@/services/apiBaseUrl');
(require.cache as Record<string, unknown>)[apiPath] = { exports: {
  resolveApiBaseCandidates: () => [], isNetworkRequestFailedError: () => false,
} };
const { TrailupApiProvider } = require('./TrailupApiProvider') as typeof import('./TrailupApiProvider');

function provider(records: unknown[], cardsError: unknown = null, recordsError: unknown = null, cards: unknown[] = []) {
  return new TrailupApiProvider({
    apiBaseCandidates: [],
    supabase: { from(table: string) {
      let start = 0, end = Infinity;
      const query = {
        range(from: number, to: number) { start = from; end = to + 1; return this; },
        select() { return this; }, eq() { return this; }, order() { return this; }, limit(n: number) { end = n; return this; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(resolve(table === 'conteudo_personalizado'
            ? { data: records.slice(start, end), error: recordsError }
            : { data: cards.slice(start, end), error: cardsError }));
        },
      };
      return query;
    } } as any,
  });
}

const params = { classeId: 54, topicoId: 131, brainhexProfileKey: 'conqueror' };
const material = { id: 10, topico_id: 131, conteudo_id: 192, brainhex_profile_key: 'conqueror',
  materiais: { markdown: { arquivo_url: 'https://example.test/material.md' } } };

test('falha nos cards não esconde texto, áudio, slides e questões persistidos', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const result = await provider([material], { code: '42501' }).listarPersonalizacoesPersistidasPerfil(params);
    assert.equal(result.total, 1);
    assert.deepEqual(result.itens[0].materiais, material.materiais);
  } finally { console.warn = warn; }
});

test('perfil sem material não recebe silenciosamente conteúdo de outro guia', async () => {
  const result = await provider([{ ...material, brainhex_profile_key: 'seeker' }]).listarPersonalizacoesPersistidasPerfil(params);
  assert.equal(result.total, 0);
});

test('erro na consulta principal não é convertido em lista vazia', async () => {
  const error = new Error('consulta indisponível');
  await assert.rejects(provider([], null, error).listarPersonalizacoesPersistidasPerfil(params), error);
});


test('material e cards sem identificação não são inventados como mastermind', async () => {
  const unidentified = { ...material, id: 11, brainhex_profile_key: null };
  const known = { ...material, brainhex_profile_key: 'mastermind' };
  const result = await provider([unidentified, known], null, null, [
    { id: 9, topico_id: 131, conteudo_id: 192, titulo: 'Sem proveniência', metadata: {} },
  ]).listarPersonalizacoesPersistidasPerfil({ ...params, brainhexProfileKey: 'mastermind' });
  assert.deepEqual(result.itens.map(item => item.id), [10]);
  assert.equal(result.itens[0].materiais?.cards, undefined);
});

test('perfil procurado depois de muitos registros de outros perfis continua disponível', async () => {
  const others = Array.from({ length: 110 }, (_, id) => ({ ...material, id: id + 100, brainhex_profile_key: 'seeker' }));
  const result = await provider([...others, material]).listarPersonalizacoesPersistidasPerfil({ ...params, limit: 1 });
  assert.deepEqual(result.itens.map(item => item.id), [10]);
});

test('identificação legada explícita ou no caminho continua utilizável; chave canônica prevalece', async () => {
  const result = await provider([
    { ...material, id: 20, brainhex_profile_key: null, plano: { perfil_dominante: 'conqueror' } },
    { ...material, id: 21, brainhex_profile_key: null, materiais: { markdown: { arquivo_url: 'https://example.test/brainhex/conqueror/texto.md' } } },
    { ...material, id: 22, brainhex_profile_key: 'seeker', plano: { perfil_dominante: 'conqueror' } },
  ]).listarPersonalizacoesPersistidasPerfil(params);
  assert.deepEqual(result.itens.map(item => item.id), [20, 21]);
});

test('perfil solicitado desconhecido é rejeitado antes da leitura', async () => {
  await assert.rejects(provider([{ ...material, brainhex_profile_key: 'inventado' }])
    .listarPersonalizacoesPersistidasPerfil({ ...params, brainhexProfileKey: 'inventado' }), /Perfil/);
});
