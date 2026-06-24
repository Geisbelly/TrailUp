import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { buildApp } from "../server";

// Starts an Express app on a random port and returns base URL + close function.
async function startTestServer(opts: Parameters<typeof buildApp>[0] = {}) {
  const app = buildApp(opts);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  const base = `http://127.0.0.1:${addr.port}`;
  const close = () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res())));
  return { base, close };
}

// ─── GET /api/health ─────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  let base: string;
  let close: () => Promise<void>;

  before(async () => ({ base, close } = await startTestServer()));
  after(async () => close());

  it("retorna 200 com status ok", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json() as { status: string; auth: boolean };
    assert.equal(body.status, "ok");
    assert.equal(body.auth, false); // sem secret
  });

  it("auth=true quando apiSharedSecret configurado", async () => {
    const { base: b, close: c } = await startTestServer({ apiSharedSecret: "test-secret" });
    try {
      const res = await fetch(`${b}/api/health`);
      const body = await res.json() as { auth: boolean };
      assert.equal(body.auth, true);
    } finally {
      await c();
    }
  });
});

// ─── Rota desconhecida → 404 ─────────────────────────────────────────────────

describe("rota desconhecida", () => {
  let base: string;
  let close: () => Promise<void>;

  before(async () => ({ base, close } = await startTestServer()));
  after(async () => close());

  it("retorna 404", async () => {
    const res = await fetch(`${base}/nao-existe`);
    assert.equal(res.status, 404);
  });
});

// ─── Auth middleware ──────────────────────────────────────────────────────────

describe("auth middleware", () => {
  const SECRET = "supersecret";
  let base: string;
  let close: () => Promise<void>;

  before(async () => ({ base, close } = await startTestServer({ apiSharedSecret: SECRET })));
  after(async () => close());

  it("401 sem header", async () => {
    const res = await fetch(`${base}/api/v1/archive`, { method: "POST" });
    assert.equal(res.status, 401);
  });

  it("401 com secret errado", async () => {
    const res = await fetch(`${base}/api/v1/archive`, {
      method: "POST",
      headers: { "x-api-secret": "wrong" },
    });
    assert.equal(res.status, 401);
  });

  it("passa auth com secret correto (400 de validação — não 401)", async () => {
    const res = await fetch(`${base}/api/v1/archive`, {
      method: "POST",
      headers: { "x-api-secret": SECRET, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400); // auth OK, mas body inválido
  });
});

// ─── POST /api/v1/archive — validação ────────────────────────────────────────

describe("POST /api/v1/archive validação", () => {
  let base: string;
  let close: () => Promise<void>;

  before(async () => ({ base, close } = await startTestServer()));
  after(async () => close());

  const post = (body: unknown) =>
    fetch(`${base}/api/v1/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("400 quando body vazio", async () => {
    const res = await post({});
    assert.equal(res.status, 400);
  });

  it("400 quando profile inválido", async () => {
    const res = await post({ profile: "naoexiste", class_name: "Aula 1", processed: {} });
    assert.equal(res.status, 400);
  });

  it("503 quando Supabase não configurado (profile válido)", async () => {
    const res = await post({ profile: "achiever", class_name: "Aula 1", processed: { slides: [] } });
    // Sem SUPABASE_URL/KEY → 503
    assert.equal(res.status, 503);
  });
});

// ─── POST /api/personalizar — validação ──────────────────────────────────────

describe("POST /api/personalizar validação", () => {
  let base: string;
  let close: () => Promise<void>;

  before(async () => ({ base, close } = await startTestServer()));
  after(async () => close());

  const post = (body: unknown) =>
    fetch(`${base}/api/personalizar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("400 quando body inválido", async () => {
    const res = await post({});
    assert.equal(res.status, 400);
  });

  it("400 quando URL de fonte é privada (SSRF)", async () => {
    const res = await post({
      profile: "achiever",
      personalizacao_id: "pid-1",
      fontes: [{ url: "http://192.168.1.1/arquivo.pdf", tipo: "pdf" }],
    });
    assert.equal(res.status, 400);
  });
});

// ─── Rate limiter ─────────────────────────────────────────────────────────────

describe("rate limiter", () => {
  let base: string;
  let close: () => Promise<void>;

  before(async () =>
    ({ base, close } = await startTestServer({ rateLimitWindowMs: 5000, rateLimitMax: 3 }))
  );
  after(async () => close());

  it("retorna 429 após exceder o limite", async () => {
    const route = `${base}/api/v1/archive`;
    const opts = { method: "POST", headers: { "content-type": "application/json" }, body: "{}" };
    // 3 primeiras passam pelo rate limiter (ainda que retornem 400 de validação)
    await Promise.all([fetch(route, opts), fetch(route, opts), fetch(route, opts)]);
    const last = await fetch(route, opts);
    assert.equal(last.status, 429);
  });

  it("health não sofre rate limit", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => fetch(`${base}/api/health`))
    );
    for (const r of results) assert.equal(r.status, 200);
  });
});

// ─── x-request-id propagation ────────────────────────────────────────────────

describe("x-request-id header", () => {
  let base: string;
  let close: () => Promise<void>;

  before(async () => ({ base, close } = await startTestServer()));
  after(async () => close());

  it("ecoa o requestId enviado pelo cliente", async () => {
    const id = "test-req-abc123";
    const res = await fetch(`${base}/api/health`, { headers: { "x-request-id": id } });
    assert.equal(res.headers.get("x-request-id"), id);
  });

  it("gera requestId quando não enviado", async () => {
    const res = await fetch(`${base}/api/health`);
    const header = res.headers.get("x-request-id");
    assert.ok(header && header.length > 0, "deve gerar x-request-id");
  });
});
