import { test } from "node:test";
import assert from "node:assert/strict";
import { createDedupedTimeoutRunner } from "./dedupedTimeoutRunner";

// Util: cria uma Promise resolvida manualmente para controlar ordem.
function deferred<T = void>() {
  let resolve!: (v: T | PromiseLike<T>) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("chamadas concorrentes com a mesma chave reutilizam a mesma execucao", async () => {
  const runner = createDedupedTimeoutRunner<string, string>();
  let starts = 0;
  const d = deferred<string>();

  const start = () => {
    starts += 1;
    return d.promise;
  };

  const p1 = runner.run("k1", start, { timeoutMs: 10_000 });
  const p2 = runner.run("k1", start, { timeoutMs: 10_000 });

  assert.equal(starts, 1);
  d.resolve("ok");
  assert.equal(await p1, "ok");
  assert.equal(await p2, "ok");
});

test("apos o timeout, uma nova chamada com a mesma chave inicia trabalho novo em vez de reaproveitar a execucao travada", async (t) => {
  // Timers falsos: um setTimeout real + unref() confunde o rastreamento de
  // promises pendentes do test runner do Node entre subtestes.
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const runner = createDedupedTimeoutRunner<string, string>();
  let starts = 0;
  const stuck = deferred<string>(); // nunca resolve — simula chamada SDK travada

  const firstAttempt = runner.run(
    "k1",
    () => {
      starts += 1;
      return stuck.promise;
    },
    { timeoutMs: 5 },
  );

  const rejection = assert.rejects(firstAttempt, /timeout/);
  t.mock.timers.tick(5);
  await rejection;
  assert.equal(starts, 1);

  const d2 = deferred<string>();
  const retry = runner.run(
    "k1",
    () => {
      starts += 1;
      return d2.promise;
    },
    { timeoutMs: 10_000 },
  );

  // O retry deve ter iniciado um NOVO trabalho, não reaproveitado o travado.
  assert.equal(starts, 2);
  d2.resolve("recovered");
  assert.equal(await retry, "recovered");
  stuck.resolve("late");
});

test("isActive reflete a execucao em andamento e libera apos concluir", async () => {
  const runner = createDedupedTimeoutRunner<string, string>();
  const d = deferred<string>();

  const p = runner.run("k1", () => d.promise, { timeoutMs: 10_000 });
  assert.equal(runner.isActive("k1"), true);

  d.resolve("done");
  await p;
  assert.equal(runner.isActive("k1"), false);
});
