// Semáforo in-process: garante que no máximo `limit` tarefas registradas via
// run() executem ao mesmo tempo neste processo Node, independente de quantas
// chegarem (chamadas assíncronas ao longo do tempo, não um lote fixo — para
// isso ver mapWithConcurrency em boundedConcurrency.ts). Tarefas em excesso
// esperam numa fila FIFO até uma vaga ser liberada.
//
// Uso típico: proteger memória de um processo com poucos recursos (Render)
// contra rajadas de jobs pesados (geração de mídia) vindas de qualquer rota.

export interface ConcurrencyGate {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export function createConcurrencyGate(limit: number): ConcurrencyGate {
  const parsedLimit = Number(limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    throw new Error("limit deve ser um inteiro positivo");
  }

  let active = 0;
  const queue: Array<() => void> = [];

  function dequeueNext(): void {
    if (active >= parsedLimit) return;
    const start = queue.shift();
    if (!start) return;
    start();
  }

  function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active += 1;
        fn().then(
          (value) => { active -= 1; resolve(value); dequeueNext(); },
          (error) => { active -= 1; reject(error); dequeueNext(); },
        );
      };
      queue.push(start);
      dequeueNext();
    });
  }

  return { run };
}
