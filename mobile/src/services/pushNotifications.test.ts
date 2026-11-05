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
      if (name === '@/services/focoLocal') return { emFocoNoAparelho: () => false };
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

test('a rotina vira um disparo por horário e por dia escolhido', () => {
  const { service } = loadService('web', 'standalone');
  const base = {
    id: 1, tipo: 'revisao_diaria', recorrencia: 'diaria', gatilho: 'horario' as const, titulo: null,
    corpo: null, hora_local: 19, minuto_local: 30, timezone: 'UTC', prioridade: 0, contexto: null,
    ativo: true, proxima_execucao: null,
  };
  // Objetos nascem dentro do `vm`: comparar em texto, não por protótipo.
  const texto = (r: typeof base & Record<string, unknown>) =>
    service.disparosDaRotina(r).map((d) => `${d.hora}:${d.minuto}@${d.diaDaSemana}`).join(' ');
  // Sem dias nem lista (app e banco antigos): um disparo diário, como antes.
  assert.equal(texto(base), '19:30@null');
  // Os 7 dias são "todo dia".
  assert.equal(texto({ ...base, dias_semana: [1, 2, 3, 4, 5, 6, 7] }), '19:30@null');
  // Segunda (ISO 1) e domingo (ISO 7) viram 2 e 1 no Expo; os horários saem em ordem.
  assert.equal(texto({ ...base, dias_semana: [7, 1], horarios: [1200, 480] }), '8:0@2 8:0@1 20:0@2 20:0@1');
  assert.equal(texto({ ...base, hora_local: null as unknown as number }), '');
});
