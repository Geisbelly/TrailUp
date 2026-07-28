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
