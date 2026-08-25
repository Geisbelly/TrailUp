import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "./rateLimit";

// Clock injetável para tornar todos os testes determinísticos.
function fakeClock(initial = 0) {
  let t = initial;
  return {
    now:     () => t,
    advance: (ms: number) => { t += ms; },
    set:     (ms: number) => { t = ms; },
  };
}

test("permite requests dentro do limite", () => {
  const c = fakeClock();
  const l = createRateLimiter({ windowMs: 1000, max: 3, now: c.now, cleanupChance: 0 });
  assert.equal(l.check("ip1").allowed, true);
  assert.equal(l.check("ip1").allowed, true);
  assert.equal(l.check("ip1").allowed, true);
});

test("rejeita request acima do limite", () => {
  const c = fakeClock();
  const l = createRateLimiter({ windowMs: 1000, max: 2, now: c.now, cleanupChance: 0 });
  assert.equal(l.check("ip1").allowed, true);
  assert.equal(l.check("ip1").allowed, true);
  const r = l.check("ip1");
  assert.equal(r.allowed, false);
  assert.equal(r.remaining, 0);
  assert.ok(r.resetMs > 0 && r.resetMs <= 1000);
});

test("remaining decresce a cada request permitido", () => {
  const c = fakeClock();
  const l = createRateLimiter({ windowMs: 1000, max: 3, now: c.now, cleanupChance: 0 });
  assert.equal(l.check("ip1").remaining, 2);
  assert.equal(l.check("ip1").remaining, 1);
  assert.equal(l.check("ip1").remaining, 0);
});

test("janela desliza: após windowMs, timestamps antigos saem", () => {
  const c = fakeClock();
  const l = createRateLimiter({ windowMs: 1000, max: 2, now: c.now, cleanupChance: 0 });
  l.check("ip1");                       // t=0
  l.check("ip1");                       // t=0, max atingido
  assert.equal(l.check("ip1").allowed, false);
  c.advance(1001);                      // janela passou
  assert.equal(l.check("ip1").allowed, true);
});

test("janela parcial: timestamp único expira mas resto permanece", () => {
  const c = fakeClock();
  const l = createRateLimiter({ windowMs: 1000, max: 2, now: c.now, cleanupChance: 0 });
  l.check("ip1");           // t=0
  c.advance(600);
  l.check("ip1");           // t=600
  // Agora 2 no bucket: t=0 e t=600. Próxima deve rejeitar.
  assert.equal(l.check("ip1").allowed, false);
  c.advance(401);           // total=1001; só t=0 expira (1001 > 1000), t=600 fica
  // Agora 1 no bucket (t=600). Mais uma deve passar.
  assert.equal(l.check("ip1").allowed, true);
});

test("chaves diferentes têm contadores isolados", () => {
  const c = fakeClock();
  const l = createRateLimiter({ windowMs: 1000, max: 1, now: c.now, cleanupChance: 0 });
  assert.equal(l.check("ip1").allowed, true);
  assert.equal(l.check("ip1").allowed, false);
  assert.equal(l.check("ip2").allowed, true);    // ip2 não afetado por ip1
  assert.equal(l.check("ip3").allowed, true);
});

test("resetMs é proporcional ao tempo desde o request mais antigo", () => {
  const c = fakeClock();
  const l = createRateLimiter({ windowMs: 1000, max: 1, now: c.now, cleanupChance: 0 });
  l.check("ip1");           // t=0
  c.advance(300);
  const r = l.check("ip1"); // t=300, rejeitado
  assert.equal(r.allowed, false);
  assert.equal(r.resetMs, 700);
});

test("size() reflete chaves rastreadas", () => {
  const c = fakeClock();
  const l = createRateLimiter({ windowMs: 1000, max: 5, now: c.now, cleanupChance: 0 });
  assert.equal(l.size(), 0);
  l.check("a"); l.check("b"); l.check("c");
  assert.equal(l.size(), 3);
});

test("max=0 sempre rejeita", () => {
  const c = fakeClock();
  const l = createRateLimiter({ windowMs: 1000, max: 0, now: c.now, cleanupChance: 0 });
  assert.equal(l.check("ip1").allowed, false);
});

test("cleanup explícito (via cleanupChance=1) remove keys com bucket vazio", () => {
  const c = fakeClock();
  const l = createRateLimiter({ windowMs: 1000, max: 5, now: c.now, cleanupChance: 1 });
  l.check("expired");
  c.advance(1001);
  l.check("active");        // dispara cleanup, "expired" deve sumir
  assert.equal(l.size(), 1);
});
