// Deduplica execucoes concorrentes por chave e aplica um timeout duro por
// chamador. O SDK do Gemini/OpenAI nao expoe AbortSignal aqui, entao o
// timeout nao cancela o trabalho real — apenas para de esperar por ele.
//
// Por isso, quando o timeout dispara, o slot da chave e liberado de
// imediato (em vez de esperar o trabalho travado eventualmente resolver).
// Sem isso, qualquer retry com a mesma chave reataria na mesma execucao
// zumbi e esperaria outro timeout inteiro antes de falhar de novo,
// travando retries indefinidamente ate o processo ser reciclado.

export interface DedupedTimeoutRunner<K, T> {
  run(key: K, startWork: () => Promise<T>, options: { timeoutMs: number; onReuse?: () => void }): Promise<T>;
  isActive(key: K): boolean;
}

export function createDedupedTimeoutRunner<K, T>(): DedupedTimeoutRunner<K, T> {
  const active = new Map<K, Promise<T>>();

  function evictIfCurrent(key: K, work: Promise<T>): void {
    if (active.get(key) === work) {
      active.delete(key);
    }
  }

  async function run(
    key: K,
    startWork: () => Promise<T>,
    options: { timeoutMs: number; onReuse?: () => void },
  ): Promise<T> {
    const existing = active.get(key);
    if (existing) {
      options.onReuse?.();
      return existing;
    }

    const work = startWork();
    active.set(key, work);
    void work.then(
      () => evictIfCurrent(key, work),
      () => evictIfCurrent(key, work),
    );

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        evictIfCurrent(key, work);
        reject(new Error(`job timeout apos ${options.timeoutMs}ms`));
      }, options.timeoutMs);
      timeoutHandle.unref();
    });

    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  return {
    run,
    isActive: (key: K) => active.has(key),
  };
}
