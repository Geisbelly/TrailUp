// Structured logger zero-dep. Pretty em dev, JSON em prod.
//
// Uso:
//   const log = createLogger({ ctx: "brainhex" });
//   log.info("server on http://localhost", { port: 3000 });
//   const jobLog = log.child({ personalizacaoId: 42 });
//   jobLog.warn("retry", { attempt: 2 });
//
// Env:
//   LOG_LEVEL  = debug | info | warn | error   (default info)
//   LOG_FORMAT = pretty | json                  (default: json se NODE_ENV=production, senão pretty)

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg:  string, fields?: LogFields): void;
  warn(msg:  string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(extraContext: LogFields): Logger;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveMinLevel(): number {
  const env = (process.env.LOG_LEVEL ?? "").toLowerCase();
  return LEVEL_PRIORITY[env as LogLevel] ?? LEVEL_PRIORITY.info;
}

function resolveFormat(): "pretty" | "json" {
  const env = (process.env.LOG_FORMAT ?? "").toLowerCase();
  if (env === "pretty" || env === "json") return env;
  return process.env.NODE_ENV === "production" ? "json" : "pretty";
}

// Serialização segura — Error vira { message, stack }, demais valores via JSON.
function formatValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (v instanceof Error) return JSON.stringify({ message: v.message, stack: v.stack });
  if (typeof v === "string") {
    // sem espaços ou caractere especial: imprime cru; senão JSON.stringify
    return /^[\w.\-:/]+$/.test(v) ? v : JSON.stringify(v);
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function serializeForJson(v: unknown): unknown {
  if (v instanceof Error) return { message: v.message, stack: v.stack };
  return v;
}

interface LoggerInternals {
  context: LogFields;
  minLevel: number;
  format: "pretty" | "json";
  // Injeção para testes:
  out?:    (line: string) => void;
  errOut?: (line: string) => void;
  now?:    () => Date;
}

function emit(internals: LoggerInternals, level: LogLevel, msg: string, fields?: LogFields): void {
  if (LEVEL_PRIORITY[level] < internals.minLevel) return;

  const merged: LogFields = { ...internals.context, ...(fields ?? {}) };
  const ts = (internals.now ?? (() => new Date()))().toISOString();
  const sinkInfo = internals.out    ?? ((l: string) => console.log(l));
  const sinkErr  = internals.errOut ?? ((l: string) => console.error(l));
  const sink = (level === "error" || level === "warn") ? sinkErr : sinkInfo;

  if (internals.format === "json") {
    const obj: Record<string, unknown> = { ts, level, msg };
    for (const [k, v] of Object.entries(merged)) {
      obj[k] = serializeForJson(v);
    }
    sink(JSON.stringify(obj));
  } else {
    const time = ts.slice(11, 23); // HH:MM:SS.mmm
    const padded = level.toUpperCase().padEnd(5);
    const kv = Object.entries(merged)
      .map(([k, v]) => `${k}=${formatValue(v)}`)
      .join(" ");
    sink(`${time} ${padded} ${msg}${kv ? " " + kv : ""}`);
  }
}

function buildLogger(internals: LoggerInternals): Logger {
  return {
    debug: (msg, fields) => emit(internals, "debug", msg, fields),
    info:  (msg, fields) => emit(internals, "info",  msg, fields),
    warn:  (msg, fields) => emit(internals, "warn",  msg, fields),
    error: (msg, fields) => emit(internals, "error", msg, fields),
    child: (extraContext: LogFields) =>
      buildLogger({ ...internals, context: { ...internals.context, ...extraContext } }),
  };
}

export interface CreateLoggerOptions {
  out?:    (line: string) => void;
  errOut?: (line: string) => void;
  now?:    () => Date;
  // override env-derived defaults (útil em testes)
  minLevel?: LogLevel;
  format?:   "pretty" | "json";
}

export function createLogger(context: LogFields = {}, opts: CreateLoggerOptions = {}): Logger {
  return buildLogger({
    context,
    minLevel: opts.minLevel ? LEVEL_PRIORITY[opts.minLevel] : resolveMinLevel(),
    format:   opts.format   ?? resolveFormat(),
    out:      opts.out,
    errOut:   opts.errOut,
    now:      opts.now,
  });
}
