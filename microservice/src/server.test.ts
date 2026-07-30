import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  buildApp,
  MEDIA_PIPELINE_VERSION,
  PRESENTATION_DESIGN_VERSION,
  PRESENTATION_ENGINE_VERSION,
  PRESENTATION_SCHEMA_VERSION,
  buildPresentationMaterialMetadata,
  renderAndUploadPresentation,
} from "../server";
import {
  buildPresentationVersionMetadata,
  generationStorageSegment,
  versionStoragePath,
} from "./constants/pipelineVersions";
if (!process.env.OPENAI_API_KEY?.trim()) {
  process.env.OPENAI_API_KEY = "test-openai-key";
}

// Starts an Express app on a random port and returns base URL + close function.
async function startTestServer(opts: Parameters<typeof buildApp>[0] = {}) {
  const app = buildApp({
    presentationRendererReadiness: async () => ({
      ready: true,
      checked_at: "2026-07-28T00:00:00.000Z",
      browser: "Chrome/Test",
    }),
    ...opts,
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  const base = `http://127.0.0.1:${addr.port}`;
  const close = () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res())));
  return { base, close };
}

const enrichedContentBlock = () => ({
  id: "bloco-01",
  ordem: 1,
  tema: "Redes",
  topico: "DNS",
  objetivos: ["Compreender e aplicar a resolução de nomes."],
  conteudo_base: "DNS resolve nomes.",
  conteudo_aprofundado:
    "DNS resolve nomes e conecta endereços legíveis aos servidores corretos. "
    + "O processo consulta uma hierarquia distribuída, mantém respostas em cache "
    + "e permite que o navegador encontre uma aplicação sem memorizar números.",
  conceitos_chave: ["DNS", "resolução distribuída"],
  exemplos_contextos: ["Abrir um endereço no navegador."],
  ponte_proximo_bloco: "A resposta permite iniciar a requisição HTTP.",
  source_ids: ["conteudo:1"],
});

// ─── GET /api/health ─────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  let base: string;
  let close: () => Promise<void>;

  before(async () => ({ base, close } = await startTestServer()));
  after(async () => close());

  it("retorna 200 com status ok", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json() as {
      status: string;
      auth: boolean;
      presentation_renderer: { ready: boolean };
    };
    assert.equal(body.status, "ok");
    assert.equal(body.auth, false); // sem secret
    assert.equal(body.presentation_renderer.ready, true);
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

  it("expõe as versoes do pipeline e o commit implantado no Render", async () => {
    const { base: b, close: c } = await startTestServer({
      renderGitCommit: "abc123render",
    });
    try {
      const res = await fetch(`${b}/api/health`);
      const body = await res.json() as {
        media_pipeline_version: string;
        presentation_engine_version: string;
        presentation_schema: string;
        presentation_design_version: string;
        content_enrichment_provider: string;
        render_git_commit: string;
      };
      assert.equal(body.media_pipeline_version, MEDIA_PIPELINE_VERSION);
      assert.equal(body.presentation_engine_version, PRESENTATION_ENGINE_VERSION);
      assert.equal(body.presentation_schema, PRESENTATION_SCHEMA_VERSION);
      assert.equal(
        body.presentation_design_version,
        PRESENTATION_DESIGN_VERSION,
      );
      assert.equal(body.content_enrichment_provider, "openai");
      assert.equal(body.render_git_commit, "abc123render");
    } finally {
      await c();
    }
  });

  it("retorna 503 quando o Chromium nao consegue gerar o PDF de probe", async () => {
    const { base: b, close: c } = await startTestServer({
      presentationRendererReadiness: async () => ({
        ready: false,
        checked_at: "2026-07-28T00:00:00.000Z",
        error: "Chrome do Puppeteer nao encontrado",
      }),
    });
    try {
      const res = await fetch(`${b}/api/health`);
      assert.equal(res.status, 503);
      const body = await res.json() as {
        status: string;
        presentation_renderer: { ready: boolean; error?: string };
      };
      assert.equal(body.status, "degraded");
      assert.equal(body.presentation_renderer.ready, false);
      assert.match(body.presentation_renderer.error ?? "", /Chrome do Puppeteer/);
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

  it("409 quando a chave de geracao esta ausente", async () => {
    const res = await post({
      profile: "seeker",
      personalizacao_id: 257,
      fontes: [],
      content_blocks: [enrichedContentBlock()],
    });
    assert.equal(res.status, 409);
  });

  it("aguarda o runner quando wait_for_completion=true", async () => {
    const calls: unknown[] = [];
    const { base: syncBase, close: closeSync } = await startTestServer({
      personalizacaoJobRunner: async (params) => {
        calls.push(params);
      },
    });
    try {
      const res = await fetch(`${syncBase}/api/personalizar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: "seeker",
          personalizacao_id: 257,
          fontes: [],
          content_blocks: [enrichedContentBlock()],
          classe_id: 32,
          topico_id: 121,
          conteudo_id: 126,
          ciclo_id: "ciclo-257",
          source_hash: "hash-257",
          generation_key: "ciclo-257:hash-257",
          required_media_pipeline_version: MEDIA_PIPELINE_VERSION,
          required_presentation_engine_version: PRESENTATION_ENGINE_VERSION,
          required_presentation_design_version: PRESENTATION_DESIGN_VERSION,
          presentation_theme: {
            subject: "Sistemas distribuídos",
            style_name: "Atlas Técnico",
            layout_sequence: ["cover", "split", "cards", "finale"],
          },
          wait_for_completion: true,
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json() as {
        status: string;
        personalizacao_id: number;
        media_pipeline_version: string;
        presentation_engine_version: string;
      };
      assert.equal(body.status, "completed");
      assert.equal(body.personalizacao_id, 257);
      assert.equal(body.media_pipeline_version, MEDIA_PIPELINE_VERSION);
      assert.equal(body.presentation_engine_version, PRESENTATION_ENGINE_VERSION);
      assert.equal(calls.length, 1);
      const call = calls[0] as {
        storagePath: string;
        presentationTheme: { style_name?: string };
      };
      assert.equal(
        call.storagePath,
        versionStoragePath(
          "brainhex/seeker/classe-32/topico-121/conteudo-126",
          "ciclo-257:hash-257",
        ),
      );
      assert.equal(call.presentationTheme.style_name, "Atlas Técnico");
    } finally {
      await closeSync();
    }
  });

  it("propaga falha do runner no modo wait_for_completion", async () => {
    const { base: syncBase, close: closeSync } = await startTestServer({
      personalizacaoJobRunner: async () => {
        throw new Error("persistencia indisponivel");
      },
    });
    try {
      const res = await fetch(`${syncBase}/api/personalizar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: "seeker",
          personalizacao_id: 257,
          fontes: [],
          content_blocks: [enrichedContentBlock()],
          ciclo_id: "ciclo-257",
          source_hash: "hash-257",
          generation_key: "ciclo-257:hash-257",
          wait_for_completion: true,
        }),
      });

      assert.equal(res.status, 500);
      const body = await res.json() as { status: string; error: string };
      assert.equal(body.status, "failed");
      assert.match(body.error, /persistencia indisponivel/);
    } finally {
      await closeSync();
    }
  });

  it("rejeita versoes obrigatorias incompativeis antes de iniciar o job", async () => {
    const calls: unknown[] = [];
    const { base: guardedBase, close: closeGuarded } = await startTestServer({
      personalizacaoJobRunner: async (params) => {
        calls.push(params);
      },
    });
    const basePayload = {
      profile: "seeker",
      personalizacao_id: 257,
      fontes: [],
      content_blocks: [enrichedContentBlock()],
      ciclo_id: "ciclo-257",
      source_hash: "hash-257",
      generation_key: "ciclo-257:hash-257",
      wait_for_completion: true,
    };
    try {
      for (const required of [
        { required_media_pipeline_version: "2026-07-27.1" },
        { required_presentation_engine_version: "legacy-pdf-v1" },
        { required_presentation_design_version: "legacy-theme-v1" },
      ]) {
        const res = await fetch(`${guardedBase}/api/personalizar`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...basePayload, ...required }),
        });
        assert.equal(res.status, 409);
        const body = await res.json() as {
          status: string;
          incompatible_versions: unknown[];
          media_pipeline_version: string;
          presentation_engine_version: string;
        };
        assert.equal(body.status, "incompatible_version");
        assert.equal(body.incompatible_versions.length, 1);
        assert.equal(body.media_pipeline_version, MEDIA_PIPELINE_VERSION);
        assert.equal(body.presentation_engine_version, PRESENTATION_ENGINE_VERSION);
      }
      assert.equal(calls.length, 0);
    } finally {
      await closeGuarded();
    }
  });

  it("inclui as versoes do pipeline na resposta 202", async () => {
    const { base: asyncBase, close: closeAsync } = await startTestServer({
      personalizacaoJobRunner: async () => undefined,
    });
    try {
      const res = await fetch(`${asyncBase}/api/personalizar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: "seeker",
          personalizacao_id: 258,
          fontes: [],
          content_blocks: [enrichedContentBlock()],
          ciclo_id: "ciclo-258",
          source_hash: "hash-258",
          generation_key: "ciclo-258:hash-258",
        }),
      });
      assert.equal(res.status, 202);
      const body = await res.json() as {
        media_pipeline_version: string;
        presentation_engine_version: string;
      };
      assert.equal(body.media_pipeline_version, MEDIA_PIPELINE_VERSION);
      assert.equal(body.presentation_engine_version, PRESENTATION_ENGINE_VERSION);
    } finally {
      await closeAsync();
    }
  });
});

// ─── POST /api/personalizar — limite de concorrencia ─────────────────────────

describe("POST /api/personalizar concorrencia", () => {
  it("nao roda mais que maxConcurrentPersonalizacaoJobs jobs ao mesmo tempo neste processo", { timeout: 10_000 }, async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const { base, close } = await startTestServer({
      maxConcurrentPersonalizacaoJobs: 1,
      personalizacaoJobRunner: () => new Promise<void>((resolve) => {
        active += 1;
        peak = Math.max(peak, active);
        releases.push(() => {
          active -= 1;
          resolve();
        });
      }),
    });

    const post = (personalizacaoId: number) =>
      fetch(`${base}/api/personalizar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: "seeker",
          personalizacao_id: personalizacaoId,
          fontes: [],
          content_blocks: [enrichedContentBlock()],
          ciclo_id: `ciclo-${personalizacaoId}`,
          source_hash: `hash-${personalizacaoId}`,
          generation_key: `ciclo-${personalizacaoId}:hash-${personalizacaoId}`,
          wait_for_completion: true,
        }),
      });

    let requests: Promise<Response>[] = [];
    try {
      requests = [post(1), post(2), post(3)];
      // Da tempo das 3 requisicoes chegarem na rota antes de liberar qualquer job.
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(active, 1);
      assert.equal(peak, 1);

      releases.shift()!();
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(active, 1);
      assert.equal(peak, 1);

      releases.shift()!();
      await new Promise((resolve) => setTimeout(resolve, 50));
      releases.shift()!();

      const responses = await Promise.all(requests);
      for (const res of responses) assert.equal(res.status, 200);
      assert.equal(peak, 1);
    } finally {
      // Garante que nenhuma requisicao fique presa esperando o runner mockado
      // (senao server.close() nunca resolve, mesmo com a falha ja reportada).
      while (releases.length) releases.shift()!();
      await Promise.allSettled(requests);
      await close();
    }
  });
});

describe("diagnostico da apresentacao", () => {
  it("classifica falha ao montar o HTML e nao tenta upload", async () => {
    let uploadCalls = 0;
    const result = await renderAndUploadPresentation({
      slides: [{ titulo: "Teste" }],
      profile: "seeker",
      bucket: "conteudo_aluno",
      presentationPath: "brainhex/seeker/apresentacao/teste.html",
      buildHtml: () => {
        throw new Error("slide invalido\ncom quebra de linha");
      },
      uploadHtml: async () => {
        uploadCalls += 1;
        return "https://example.test/nao-deveria-subir.html";
      },
    });

    assert.equal(result.presentationUrl, null);
    assert.deepEqual(result.failure, {
      stage: "render",
      error: "slide invalido com quebra de linha",
    });
    assert.equal(uploadCalls, 0);
  });

  it("classifica falha de upload separadamente", async () => {
    const result = await renderAndUploadPresentation({
      slides: [{ titulo: "Teste" }],
      profile: "seeker",
      bucket: "conteudo_aluno",
      presentationPath: "brainhex/seeker/apresentacao/teste.html",
      buildHtml: () => "<html></html>",
      uploadHtml: async () => {
        throw new Error("limite do bucket excedido");
      },
    });

    assert.equal(result.presentationUrl, null);
    assert.deepEqual(result.failure, {
      stage: "upload",
      error: "limite do bucket excedido",
    });
  });

  it("persiste engine e causa real sem anunciar URL legada", () => {
    const metadata = buildPresentationMaterialMetadata({
      generationKey: "ciclo-1:hash-a",
      presentationUrl: null,
      bucket: "conteudo_aluno",
      failure: {
        stage: "render",
        error: "slide invalido",
      },
      updatedAt: "2026-07-28T00:00:00.000Z",
    });

    assert.equal(metadata.status, "failed");
    assert.equal(metadata.engine, PRESENTATION_ENGINE_VERSION);
    assert.equal(metadata.schema, PRESENTATION_SCHEMA_VERSION);
    assert.equal(metadata.media_pipeline_version, MEDIA_PIPELINE_VERSION);
    assert.equal(metadata.generation_key, "ciclo-1:hash-a");
    assert.equal(metadata.error_stage, "render");
    assert.equal(metadata.error, "slide invalido");
  });
});

describe("identidade e Storage do pipeline de apresentacao", () => {
  it("deriva caminho deterministico e distinto a partir da generation_key", () => {
    const first = versionStoragePath("brainhex/seeker/topico-1/", "ciclo-1:hash-a");
    const same = versionStoragePath("brainhex/seeker/topico-1", "ciclo-1:hash-a");
    const second = versionStoragePath("brainhex/seeker/topico-1", "ciclo-2:hash-b");

    assert.equal(first, same);
    assert.notEqual(first, second);
    assert.match(generationStorageSegment("ciclo-1:hash-a"), /^generation-[a-f0-9]{64}$/);
  });

  it("identifica engine, schema, pipeline e geracao nos metadados", () => {
    assert.deepEqual(buildPresentationVersionMetadata("ciclo-1:hash-a"), {
      engine: PRESENTATION_ENGINE_VERSION,
      schema: PRESENTATION_SCHEMA_VERSION,
      design_system: PRESENTATION_DESIGN_VERSION,
      media_pipeline_version: MEDIA_PIPELINE_VERSION,
      generation_key: "ciclo-1:hash-a",
    });
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
