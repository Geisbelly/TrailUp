import { test } from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency } from "./boundedConcurrency";

test("limita concorrência e preserva a ordem dos resultados", async () => {
  let active = 0;
  let maximumActive = 0;

  const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, (6 - item) * 2));
    active -= 1;
    return `resultado-${item}`;
  });

  assert.equal(maximumActive, 2);
  assert.deepEqual(result, [
    "resultado-1",
    "resultado-2",
    "resultado-3",
    "resultado-4",
    "resultado-5",
  ]);
});

test("não agenda novos itens após a primeira falha", async () => {
  const started: number[] = [];

  await assert.rejects(
    mapWithConcurrency([1, 2, 3, 4], 2, async (item) => {
      started.push(item);
      if (item === 1) throw new Error("falha do bloco");
      await new Promise((resolve) => setTimeout(resolve, 5));
      return item;
    }),
    /falha do bloco/,
  );

  assert.deepEqual(started, [1, 2]);
});

test("recusa limite de concorrência inválido", async () => {
  await assert.rejects(
    mapWithConcurrency([1], 0, async (item) => item),
    /inteiro positivo/,
  );
});
