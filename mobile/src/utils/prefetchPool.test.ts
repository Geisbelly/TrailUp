import assert from "node:assert/strict";
import test from "node:test";

import { executarComConcorrencia } from "./prefetchPool";

function adiar(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

test("processa todos os itens", async () => {
  const vistos: number[] = [];

  await executarComConcorrencia([1, 2, 3, 4, 5], 2, async (n) => {
    vistos.push(n);
  });

  assert.deepEqual(vistos.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test("nunca passa do limite de tarefas simultaneas", async () => {
  let emVoo = 0;
  let pico = 0;

  await executarComConcorrencia([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
    emVoo += 1;
    pico = Math.max(pico, emVoo);
    await adiar(5);
    emVoo -= 1;
  });

  assert.equal(pico, 3);
});

// O prefetch de um material que falha nao pode levar junto os outros: era esse
// o comportamento do laco serial com try/catch por item, e ele precisa
// sobreviver a paralelizacao.
test("falha de um item nao interrompe os demais", async () => {
  const concluidos: number[] = [];

  await executarComConcorrencia([1, 2, 3, 4], 2, async (n) => {
    if (n === 2) throw new Error("falhou de proposito");
    concluidos.push(n);
  });

  assert.deepEqual(concluidos.sort((a, b) => a - b), [1, 3, 4]);
});

test("limite menor que 1 vira execucao serial em vez de travar", async () => {
  let emVoo = 0;
  let pico = 0;

  await executarComConcorrencia([1, 2, 3], 0, async () => {
    emVoo += 1;
    pico = Math.max(pico, emVoo);
    await adiar(2);
    emVoo -= 1;
  });

  assert.equal(pico, 1);
});

test("lista vazia nao explode", async () => {
  await executarComConcorrencia([], 4, async () => {
    throw new Error("nao deveria ser chamado");
  });
});

test("aguarda todas as tarefas antes de resolver", async () => {
  let terminadas = 0;

  await executarComConcorrencia([1, 2, 3, 4, 5], 2, async () => {
    await adiar(5);
    terminadas += 1;
  });

  assert.equal(terminadas, 5);
});
