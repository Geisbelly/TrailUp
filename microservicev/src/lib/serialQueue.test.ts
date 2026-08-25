import { test } from "node:test";
import assert from "node:assert/strict";
import { createKeyedQueue } from "./serialQueue";

// Util: cria uma Promise resolvida manualmente para controlar ordem.
function deferred<T = void>() {
  let resolve!: (v: T | PromiseLike<T>) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("mesma chave: tasks rodam em série, não sobrepostas", async () => {
  const q = createKeyedQueue<string>();
  const events: string[] = [];
  const d1 = deferred();
  const d2 = deferred();

  const p1 = q.enqueue("a", async () => {
    events.push("1-start");
    await d1.promise;
    events.push("1-end");
  });
  const p2 = q.enqueue("a", async () => {
    events.push("2-start");
    await d2.promise;
    events.push("2-end");
  });

  // Microtask flush — 1-start já saiu, 2-start não pode ter saído ainda.
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["1-start"]);

  d1.resolve();
  await p1;
  // 2 só começa depois de 1 terminar.
  assert.deepEqual(events, ["1-start", "1-end", "2-start"]);

  d2.resolve();
  await p2;
  assert.deepEqual(events, ["1-start", "1-end", "2-start", "2-end"]);
});

test("chaves diferentes: tasks rodam em paralelo", async () => {
  const q = createKeyedQueue<string>();
  const events: string[] = [];
  const dA = deferred();
  const dB = deferred();

  const pA = q.enqueue("a", async () => { events.push("A-start"); await dA.promise; events.push("A-end"); });
  const pB = q.enqueue("b", async () => { events.push("B-start"); await dB.promise; events.push("B-end"); });

  await Promise.resolve();
  await Promise.resolve();
  // Ambas começaram porque chaves são distintas.
  assert.deepEqual(events.sort(), ["A-start", "B-start"]);

  dB.resolve();
  await pB;
  dA.resolve();
  await pA;
});

test("erro em uma task não bloqueia a próxima da mesma chave", async () => {
  const q = createKeyedQueue<string>();
  let ran2 = false;

  const p1 = q.enqueue("k", async () => { throw new Error("boom"); });
  const p2 = q.enqueue("k", async () => { ran2 = true; return "ok"; });

  await assert.rejects(p1, /boom/);
  const result = await p2;
  assert.equal(result, "ok");
  assert.equal(ran2, true);
});

test("size() reflete chaves pendentes e limpa após drain", async () => {
  const q = createKeyedQueue<string>();
  const d = deferred();

  assert.equal(q.size(), 0);

  const p = q.enqueue("x", async () => { await d.promise; });
  assert.equal(q.size(), 1);

  d.resolve();
  await p;
  // Aguarda microtask do finally limpar o Map.
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(q.size(), 0);
});

test("valor de retorno propaga corretamente", async () => {
  const q = createKeyedQueue<number>();
  const r1 = await q.enqueue(1, async () => 42);
  const r2 = await q.enqueue(1, async () => "hello");
  assert.equal(r1, 42);
  assert.equal(r2, "hello");
});

test("encadeamento longo na mesma chave preserva ordem", async () => {
  const q = createKeyedQueue<string>();
  const order: number[] = [];
  const promises: Promise<void>[] = [];
  for (let i = 0; i < 20; i++) {
    promises.push(q.enqueue("k", async () => {
      order.push(i);
      // pequeno yield para forçar agendamento
      await Promise.resolve();
    }));
  }
  await Promise.all(promises);
  assert.deepEqual(order, Array.from({ length: 20 }, (_, i) => i));
});
