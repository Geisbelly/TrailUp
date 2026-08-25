import { test } from "node:test";
import assert from "node:assert/strict";
import { createConcurrencyGate } from "./concurrencyGate";

test("executa ate `limit` tarefas em paralelo e enfileira o restante", async () => {
  const gate = createConcurrencyGate(2);
  let active = 0;
  let peak = 0;
  const releases: Array<() => void> = [];

  const task = () => gate.run(() => new Promise<void>((resolve) => {
    active += 1;
    peak = Math.max(peak, active);
    releases.push(() => {
      active -= 1;
      resolve();
    });
  }));

  const results = [task(), task(), task()];
  // As duas primeiras devem ter iniciado; a terceira fica enfileirada.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 2);
  assert.equal(peak, 2);

  releases[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 2); // a terceira assumiu a vaga liberada
  assert.equal(peak, 2);

  releases[1]();
  releases[2]();
  await Promise.all(results);
  assert.equal(active, 0);
});

test("propaga o valor de retorno e o erro de cada tarefa individualmente", async () => {
  const gate = createConcurrencyGate(1);
  const ok = await gate.run(async () => "valor");
  assert.equal(ok, "valor");

  await assert.rejects(
    () => gate.run(async () => { throw new Error("falhou"); }),
    /falhou/,
  );

  // Uma falha nao trava o gate para as proximas tarefas.
  const next = await gate.run(async () => "depois-da-falha");
  assert.equal(next, "depois-da-falha");
});

test("limit invalido lanca erro", () => {
  assert.throws(() => createConcurrencyGate(0));
  assert.throws(() => createConcurrencyGate(-1));
  assert.throws(() => createConcurrencyGate(1.5));
});
