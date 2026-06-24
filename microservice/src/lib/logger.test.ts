import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "./logger";

function captured() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout, stderr,
    out:    (l: string) => stdout.push(l),
    errOut: (l: string) => stderr.push(l),
  };
}

const fixedNow = () => new Date("2026-05-16T17:23:45.123Z");

test("pretty: formato HH:MM:SS.mmm LEVEL msg key=value", () => {
  const c = captured();
  const log = createLogger({ ctx: "brainhex" }, { format: "pretty", out: c.out, errOut: c.errOut, now: fixedNow });
  log.info("server on http://localhost", { port: 3000 });
  assert.equal(c.stdout.length, 1);
  assert.equal(c.stdout[0], '17:23:45.123 INFO  server on http://localhost ctx=brainhex port=3000');
});

test("json: emite uma linha JSON válida com ts/level/msg + campos", () => {
  const c = captured();
  const log = createLogger({ ctx: "brainhex" }, { format: "json", out: c.out, errOut: c.errOut, now: fixedNow });
  log.info("hello", { port: 3000 });
  const parsed = JSON.parse(c.stdout[0]);
  assert.equal(parsed.ts,    "2026-05-16T17:23:45.123Z");
  assert.equal(parsed.level, "info");
  assert.equal(parsed.msg,   "hello");
  assert.equal(parsed.ctx,   "brainhex");
  assert.equal(parsed.port,  3000);
});

test("warn e error vão para stderr; info e debug para stdout", () => {
  const c = captured();
  const log = createLogger({}, { format: "pretty", out: c.out, errOut: c.errOut, now: fixedNow, minLevel: "debug" });
  log.debug("d"); log.info("i"); log.warn("w"); log.error("e");
  assert.equal(c.stdout.length, 2); // debug + info
  assert.equal(c.stderr.length, 2); // warn + error
});

test("minLevel filtra mensagens abaixo do nível configurado", () => {
  const c = captured();
  const log = createLogger({}, { format: "pretty", out: c.out, errOut: c.errOut, now: fixedNow, minLevel: "warn" });
  log.debug("nope"); log.info("nope"); log.warn("yes"); log.error("yes");
  assert.equal(c.stdout.length, 0);
  assert.equal(c.stderr.length, 2);
});

test("child() herda contexto pai e adiciona o seu próprio", () => {
  const c = captured();
  const root = createLogger({ ctx: "brainhex" }, { format: "json", out: c.out, errOut: c.errOut, now: fixedNow });
  const job = root.child({ personalizacaoId: 42 });
  job.info("start");
  const parsed = JSON.parse(c.stdout[0]);
  assert.equal(parsed.ctx, "brainhex");
  assert.equal(parsed.personalizacaoId, 42);
});

test("fields da chamada sobrescrevem o contexto", () => {
  const c = captured();
  const log = createLogger({ ctx: "a", port: 1 }, { format: "json", out: c.out, errOut: c.errOut, now: fixedNow });
  log.info("test", { port: 2 });
  const parsed = JSON.parse(c.stdout[0]);
  assert.equal(parsed.port, 2);
  assert.equal(parsed.ctx,  "a");
});

test("Error é serializado como { message, stack } em JSON", () => {
  const c = captured();
  const log = createLogger({}, { format: "json", out: c.out, errOut: c.errOut, now: fixedNow });
  log.error("falhou", { err: new Error("boom") });
  const parsed = JSON.parse(c.stderr[0]);
  assert.equal(parsed.err.message, "boom");
  assert.match(parsed.err.stack, /Error: boom/);
});

test("pretty: strings sem espaço imprimem cru; com espaço viram JSON quoted", () => {
  const c = captured();
  const log = createLogger({}, { format: "pretty", out: c.out, errOut: c.errOut, now: fixedNow });
  log.info("test", { tag: "no-spaces", msg2: "with spaces" });
  assert.match(c.stdout[0], / tag=no-spaces /);
  assert.match(c.stdout[0], / msg2="with spaces"/);
});

test("null/undefined/boolean/number em JSON são preservados", () => {
  const c = captured();
  const log = createLogger({}, { format: "json", out: c.out, errOut: c.errOut, now: fixedNow });
  log.info("test", { a: null, b: undefined, c: true, d: 42 });
  const parsed = JSON.parse(c.stdout[0]);
  assert.equal(parsed.a, null);
  assert.ok(!("b" in parsed)); // JSON.stringify omite undefined
  assert.equal(parsed.c, true);
  assert.equal(parsed.d, 42);
});

test("child de child compõe contextos", () => {
  const c = captured();
  const log = createLogger({ a: 1 }, { format: "json", out: c.out, errOut: c.errOut, now: fixedNow });
  const l2 = log.child({ b: 2 });
  const l3 = l2.child({ c: 3 });
  l3.info("test");
  const parsed = JSON.parse(c.stdout[0]);
  assert.equal(parsed.a, 1);
  assert.equal(parsed.b, 2);
  assert.equal(parsed.c, 3);
});
