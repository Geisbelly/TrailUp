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

function provider(records: unknown[], cardsError: unknown = null, recordsError: unknown = null) {
  return new TrailupApiProvider({
    apiBaseCandidates: [],
    supabase: { from(table: string) {
      const query = {
        select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(resolve(table === 'conteudo_personalizado'
            ? { data: records, error: recordsError }
            : { data: [], error: cardsError }));
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
