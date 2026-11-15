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

test('focus and mute RPCs send the database parameter names', async () => {
  const sent: [string, unknown][] = [];
  const exports = {};
  runInNewContext(compiled, {
    exports,
    console: { warn: () => undefined },
    require: () => ({ supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'aluno' } } }, error: null }) },
      rpc: async (fn: string, args: unknown) => { sent.push([fn, args]); return { data: null, error: null }; },
    } }),
  });
  const service = exports as typeof import('./notificacoesDb');
  await service.iniciarFoco(25);
  await service.encerrarFoco();
  await service.silenciarTipo({ tipo: 'rank', silenciar: true, notificacaoId: 7 });
  // Objetos criados dentro do `vm` têm outro protótipo: compara pela forma.
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
    ['notificacoes_iniciar_foco', { p_minutos: 25 }],
    ['notificacoes_encerrar_foco', {}],
    ['notificacoes_silenciar_tipo', { p_tipo: 'rank', p_silenciar: true, p_notificacao_id: 7 }],
  ]);
  assert.equal(service.podeSilenciar('rank'), true);
  assert.equal(service.podeSilenciar('chat'), false);
  assert.equal(service.podeSilenciar('toString'), false);
});

function loadServiceComRespostas(respostas: { error: unknown }[]) {
  const sent: [string, unknown][] = [];
  const exports = {};
  runInNewContext(compiled, {
    exports,
    console: { warn: () => undefined },
    require: () => ({ supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'aluno' } } }, error: null }) },
      rpc: async (fn: string, args: unknown) => {
        sent.push([fn, args]);
        return { data: null, ...(respostas.shift() ?? { error: null }) };
      },
    } }),
  });
  return { service: exports as typeof import('./notificacoesDb'), sent };
}

test('heartbeat tells the database how much of it was on the trail', async () => {
  const { service, sent } = loadServiceComRespostas([]);
  await service.enviarHeartbeat({ segundos: 60, timezone: 'UTC', sessaoId: 3, segundosNaTrilha: 45, naTrilha: true });
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
    ['notificacoes_heartbeat', {
      p_segundos: 60, p_timezone: 'UTC', p_sessao_id: 3, p_segundos_trilha: 45, p_na_trilha: true,
    }],
  ]);
});

test('heartbeat falls back to the old signature while the migration is not in the database', async () => {
  const { service, sent } = loadServiceComRespostas([{ error: { code: 'PGRST202', message: 'not found' } }]);
  await service.enviarHeartbeat({ segundos: 60, timezone: 'UTC', segundosNaTrilha: 60, naTrilha: true });
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
    ['notificacoes_heartbeat', {
      p_segundos: 60, p_timezone: 'UTC', p_sessao_id: null, p_segundos_trilha: 60, p_na_trilha: true,
    }],
    ['notificacoes_heartbeat', { p_segundos: 60, p_timezone: 'UTC', p_sessao_id: null }],
  ]);
});

test('heartbeat does not retry on other errors', async () => {
  const { service, sent } = loadServiceComRespostas([{ error: { code: '42501', message: 'permission denied' } }]);
  assert.equal(await service.enviarHeartbeat({ segundos: 60, timezone: 'UTC' }), null);
  assert.equal(sent.length, 1);
});
