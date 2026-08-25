// Rate limiter sliding-window in-process. Por chave (tipicamente IP).
//
// Limitação: cada instância tem o seu próprio contador. Para enforcement
// cross-instance, use Redis ou store compartilhado. Para a maioria dos
// deploys single-node, isto é suficiente.

export interface RateCheckResult {
  allowed:    boolean;
  remaining:  number;
  resetMs:    number; // ms até o limite recomeçar a expirar
}

export interface RateLimiter {
  check(key: string): RateCheckResult;
  size(): number;     // chaves rastreadas (útil em testes)
}

export interface RateLimiterOptions {
  windowMs:  number;
  max:       number;
  now?:      () => number; // injetável para testes
  cleanupChance?: number;  // probabilidade de varrer buckets velhos a cada check (default 0.01)
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, number[]>();
  const now      = opts.now      ?? (() => Date.now());
  const cleanupChance = opts.cleanupChance ?? 0.01;

  function cleanupOldKeys(currentMs: number): void {
    for (const [key, timestamps] of buckets) {
      const fresh = timestamps.filter((t) => currentMs - t < opts.windowMs);
      if (fresh.length === 0) buckets.delete(key);
      else if (fresh.length !== timestamps.length) buckets.set(key, fresh);
    }
  }

  return {
    check(key: string): RateCheckResult {
      const currentMs = now();
      if (Math.random() < cleanupChance) cleanupOldKeys(currentMs);

      const timestamps = buckets.get(key) ?? [];
      const fresh      = timestamps.filter((t) => currentMs - t < opts.windowMs);

      if (fresh.length >= opts.max) {
        const oldest = fresh[0];
        return {
          allowed:   false,
          remaining: 0,
          resetMs:   opts.windowMs - (currentMs - oldest),
        };
      }

      fresh.push(currentMs);
      buckets.set(key, fresh);
      return {
        allowed:   true,
        remaining: opts.max - fresh.length,
        resetMs:   opts.windowMs,
      };
    },

    size: () => buckets.size,
  };
}
