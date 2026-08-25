// Fila serial por chave (in-process). Garante que callbacks enfileirados
// com a mesma chave executam em ordem, sem sobreposição. Chaves diferentes
// rodam em paralelo. Limpa a entrada do Map quando a última task termina.
//
// Uso típico: serializar read-modify-write em recursos compartilhados
// dentro de uma única instância Node (ex.: mergePersonalizacaoMateriais).
// LIMITAÇÃO: não protege entre instâncias — para isso, use advisory
// lock no Postgres ou equivalente.

export interface KeyedQueue<K> {
  enqueue<T>(key: K, fn: () => Promise<T>): Promise<T>;
  size(): number; // qtd de chaves com tasks pendentes (útil em testes)
}

export function createKeyedQueue<K>(): KeyedQueue<K> {
  const pending = new Map<K, Promise<unknown>>();

  function enqueue<T>(key: K, fn: () => Promise<T>): Promise<T> {
    const prev = pending.get(key) ?? Promise.resolve();
    // .then(fn, fn) garante que fn roda mesmo se prev rejeitou
    // (sem propagar a rejeição anterior para o caller atual).
    const next = prev.then(fn, fn) as Promise<T>;
    pending.set(key, next);
    // Limpa a entrada quando esta task for a última do encadeamento.
    // Usa .then(cleanup, cleanup) (não .finally) para consumir eventual
    // rejeição — caso contrário a callback do .finally cria uma promise
    // órfã que vira unhandledRejection.
    const cleanup = () => {
      if (pending.get(key) === next) pending.delete(key);
    };
    void next.then(cleanup, cleanup);
    return next;
  }

  return {
    enqueue,
    size: () => pending.size,
  };
}
