import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(path.resolve('src/services/pushNotifications.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

function loadService(os: string, executionEnvironment: string, appOwnership?: string) {
  let loads = 0;
  let handlers = 0;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === 'expo-constants') return { executionEnvironment, appOwnership };
      if (name === 'react-native') return { Platform: { OS: os } };
      if (name === 'expo-notifications') {
        loads += 1;
        return { setNotificationHandler() { handlers += 1; } };
      }
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return {
    service: exports as typeof import('./pushNotifications'),
    loads: () => loads,
    handlers: () => handlers,
  };
}

for (const environment of [
  { os: 'android', runtime: 'storeClient' },
  { os: 'ios', runtime: 'storeClient' },
  { os: 'android', runtime: '', ownership: 'expo' },
  { os: 'web', runtime: 'standalone' },
]) {
  test(`does not load native notifications in ${JSON.stringify(environment)}`, async () => {
    const { service, loads } = loadService(environment.os, environment.runtime, environment.ownership);
    assert.equal(loads(), 0);
    await service.configurarHandlerDeNotificacao();
    await service.garantirCanalAndroid();
    assert.equal((await service.registrarParaPush()).token, null);
    assert.equal(await service.agendarRotinasLocais([]), 0);
    await service.cancelarRotinasLocais();
    const remove = await service.ouvirAberturaDeNotificacao(() => assert.fail('unexpected callback'));
    remove();
    assert.equal(loads(), 0);
  });
}

test('loads notifications lazily and configures the handler once in a development build', async () => {
  const { service, loads, handlers } = loadService('android', 'bare');
  assert.equal(loads(), 0);
  await service.configurarHandlerDeNotificacao();
  await service.configurarHandlerDeNotificacao();
  assert.equal(loads(), 1);
  assert.equal(handlers(), 1);
});
