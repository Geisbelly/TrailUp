import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(path.resolve('src/services/notificacoesDb.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function loadService(authenticated: boolean, rpcError: unknown = null) {
  const calls: string[] = [];
  const warnings: unknown[][] = [];
  const exports = {};
  runInNewContext(compiled, {
    exports,
    console: { warn: (...args: unknown[]) => warnings.push(args) },
    require(name: string) {
      assert.equal(name, '@/database/supabase');
      return { supabase: {
        auth: { getSession: async () => ({ data: { session: authenticated ? { user: { id: 'aluno' } } : null }, error: null }) },
        rpc: async (fn: string) => { calls.push(fn); return { data: { sessao_id: 1 }, error: rpcError }; },
      } };
    },
  });
  return { service: exports as typeof import('./notificacoesDb'), calls, warnings };
}

test('does not send notification RPCs after logout', async () => {
  const { service, calls, warnings } = loadService(false);
  assert.equal(await service.enviarHeartbeat({ segundos: 10, timezone: 'UTC' }), null);
  assert.equal(await service.encerrarSessao(), null);
  assert.equal(await service.desativarDispositivo('test-token'), null);
  assert.equal((await service.listarRotinas()).length, 0);
  assert.equal(calls.length, 0);
  assert.equal(warnings.length, 0);
});

test('continues sending RPCs for an authenticated session', async () => {
  const { service, calls } = loadService(true);
  await service.enviarHeartbeat({ segundos: 10, timezone: 'UTC' });
  assert.deepEqual(calls, ['notificacoes_heartbeat']);
});

test('does not hide permission errors for an authenticated session', async () => {
  const { service, warnings } = loadService(true, { message: 'permission denied' });
  assert.equal(await service.encerrarSessao(), null);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][1], 'permission denied');
});
