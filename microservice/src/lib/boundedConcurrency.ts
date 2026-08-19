/**
 * Executa itens com concorrência limitada e devolve os resultados na mesma
 * ordem da entrada. Ao ocorrer uma falha, não agenda novos itens, mas aguarda
 * os workers já iniciados antes de propagar o primeiro erro.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const parsedConcurrency = Number(concurrency);
  if (!Number.isInteger(parsedConcurrency) || parsedConcurrency < 1) {
    throw new Error("concurrency deve ser um inteiro positivo");
  }

  const results = new Array<R>(items.length);
  const workerCount = Math.min(parsedConcurrency, items.length);
  let nextIndex = 0;
  let hasError = false;
  let firstError: unknown;

  const runWorker = async () => {
    while (!hasError) {
      const index = nextIndex;
      if (index >= items.length) return;
      nextIndex += 1;

      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        hasError = true;
        firstError = error;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  if (hasError) throw firstError;
  return results;
}

/**
 * Como mapWithConcurrency, mas tolera falha individual em vez de propagar a
 * primeira e parar de agendar - equivalente a Promise.allSettled com
 * concorrência limitada. Usado onde falha de UM item nunca deve derrubar os
 * outros (ex.: geração de áudio por parte - ver runPipeline em server.ts),
 * mas disparar tudo de uma vez sem limite estoura RPM de provedores externos
 * (reproduzido em produção: Gemini TTS free tier permite só ~10 req/min).
 */
export async function settleWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  return mapWithConcurrency(items, concurrency, async (item, index) => {
    try {
      const value = await worker(item, index);
      return { status: "fulfilled", value } as PromiseFulfilledResult<R>;
    } catch (reason) {
      return { status: "rejected", reason } as PromiseRejectedResult;
    }
  });
}
