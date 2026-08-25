import { test } from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency, settleWithConcurrency } from "./boundedConcurrency";

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

test("settleWithConcurrency limita a concorrencia real (nunca dispara tudo de uma vez)", async () => {
  // Regressao: parts.map(generatePartAudio) disparava TODAS as partes de
  // audio de um perfil ao mesmo tempo, sem limite - estourava RPM do Gemini
  // mesmo com rotacao de chave correta. settleWithConcurrency deve limitar
  // quantas rodam ao mesmo tempo, igual mapWithConcurrency.
  let active = 0;
  let maximumActive = 0;

  await settleWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, (6 - item) * 2));
    active -= 1;
    return `resultado-${item}`;
  });

  assert.equal(maximumActive, 2);
});

test("settleWithConcurrency preserva sucesso parcial (Promise.allSettled), nao propaga a primeira falha", async () => {
  // Diferente de mapWithConcurrency (que propaga a primeira falha e para de
  // agendar) - o fan-out de audio depende de tolerar falha de UMA parte sem
  // derrubar as outras (ver comentario em server.ts sobre allSettled).
  const results = await settleWithConcurrency(
    [1, 2, 3],
    2,
    async (item) => {
      if (item === 2) throw new Error(`falha na parte ${item}`);
      return `ok-${item}`;
    },
  );

  assert.equal(results.length, 3);
  assert.deepEqual(results[0], { status: "fulfilled", value: "ok-1" });
  assert.equal(results[1].status, "rejected");
  assert.match((results[1] as PromiseRejectedResult).reason.message, /falha na parte 2/);
  assert.deepEqual(results[2], { status: "fulfilled", value: "ok-3" });
});
