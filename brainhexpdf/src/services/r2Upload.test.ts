import assert from 'node:assert/strict';
import test from 'node:test';

import { FUNCAO_DE_UPLOAD, FuncaoDeUploadNaoPublicada, uploadPeloSupabase, urlDoGateway } from './r2Upload';

const SUPA = { SUPABASE_URL: 'https://proj.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico' };
const ASSINADA = 'https://conta.r2.cloudflarestorage.com/trailup/deck.html?X-Amz-Signature=abc';
const DECK = 'brainhex/seeker/classe-54/topico-1/apresentacao/material-1.html';

type Chamada = { url: string; init: RequestInit };

function fetchFalso(respostas: Response[]): { fetchImpl: typeof fetch; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    const r = respostas.shift();
    if (!r) throw new Error('chamada a mais');
    return r;
  }) as typeof fetch;
  return { fetchImpl, chamadas };
}

async function comEnv<T>(vars: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const antes: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    antes[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('pede a URL ao Supabase com a chave de servico e sobe o deck direto no R2', async () => {
  const { fetchImpl, chamadas } = fetchFalso([
    new Response(JSON.stringify({ url: ASSINADA }), { status: 200 }),
    new Response('', { status: 200 }),
  ]);

  await comEnv(SUPA, () => uploadPeloSupabase(DECK, Buffer.from('<html>'), 'text/html; charset=utf-8', fetchImpl));

  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[0].url, `https://proj.supabase.co/functions/v1/${FUNCAO_DE_UPLOAD}`);
  assert.equal(chamadas[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(chamadas[0].init.body)), { path: DECK });
  assert.equal((chamadas[0].init.headers as Record<string, string>).Authorization, 'Bearer chave-de-servico');
  assert.equal(chamadas[1].url, ASSINADA);
  assert.equal(chamadas[1].init.method, 'PUT');
  // O PUT vai ao R2 sem a chave de servico.
  assert.deepEqual(chamadas[1].init.headers, { 'Content-Type': 'text/html; charset=utf-8' });
  assert.equal(Buffer.from(chamadas[1].init.body as Uint8Array).toString(), '<html>');
});

test('funcao nao publicada (404 da plataforma) lanca FuncaoDeUploadNaoPublicada', async () => {
  const { fetchImpl, chamadas } = fetchFalso([new Response('{"code":"NOT_FOUND"}', { status: 404 })]);

  await assert.rejects(
    comEnv(SUPA, () => uploadPeloSupabase(DECK, Buffer.from('x'), 'text/html', fetchImpl)),
    FuncaoDeUploadNaoPublicada,
  );
  assert.equal(chamadas.length, 1);
});

const FALHAS: Array<[string, () => Response[]]> = [
  ['funcao recusa (500)', () => [new Response('{"error":"nao configurado"}', { status: 500 })]],
  ['resposta sem url', () => [new Response('{}', { status: 200 })]],
  ['R2 recusa o PUT', () => [new Response(JSON.stringify({ url: ASSINADA }), { status: 200 }), new Response('no', { status: 403 })]],
];
for (const [nome, respostas] of FALHAS) {
  test(`falha lanca erro comum, nao FuncaoDeUploadNaoPublicada: ${nome}`, async () => {
    const { fetchImpl } = fetchFalso(respostas());
    await assert.rejects(
      comEnv(SUPA, () => uploadPeloSupabase(DECK, Buffer.from('x'), 'text/html', fetchImpl)),
      (e: unknown) => e instanceof Error && !(e instanceof FuncaoDeUploadNaoPublicada),
    );
  });
}

test('sem SUPABASE_URL ou chave de servico nem pede a URL', async () => {
  const { fetchImpl, chamadas } = fetchFalso([]);
  await assert.rejects(
    comEnv({ ...SUPA, SUPABASE_SERVICE_ROLE_KEY: undefined }, () =>
      uploadPeloSupabase(DECK, Buffer.from('x'), 'text/html', fetchImpl),
    ),
  );
  assert.equal(chamadas.length, 0);
});

test('urlDoGateway monta a URL de leitura, e sem SUPABASE_URL devolve null', async () => {
  assert.equal(
    await comEnv(SUPA, () => urlDoGateway(DECK)),
    `https://proj.supabase.co/functions/v1/storage-redirect?path=${DECK}`,
  );
  assert.equal(await comEnv({ SUPABASE_URL: undefined }, () => urlDoGateway(DECK)), null);
});
