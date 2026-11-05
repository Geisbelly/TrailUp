import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

// Sobe o server.ts de verdade: um teste do middleware sozinho nao veria uma
// rota registrada antes dele. A lista sai do proprio arquivo, entao POST novo
// entra aqui sem ninguem lembrar. Variaveis vazias ganham do .env local, e sem
// chaves nem Supabase nada sai da maquina.
const raiz = process.cwd();
const fonte = readFileSync(path.join(raiz, "server.ts"), "utf-8");
const rotasPost = [...fonte.matchAll(/^app\.post\('([^']+)'/gm)].map((m) => m[1]).filter((rota) => rota !== "*");

const SEGREDO = "segredo-de-teste";
const ENV_LIMPO: Record<string, string> = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  GEMINI_API_KEY: "",
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`GEMINI_API_KEY_${n}`, ""])),
};

function portaLivre(): Promise<number> {
  return new Promise((resolve) => {
    const servidor = createServer();
    servidor.listen(0, "127.0.0.1", () => {
      const { port } = servidor.address() as { port: number };
      servidor.close(() => resolve(port));
    });
  });
}

async function subir(segredo: string) {
  const porta = await portaLivre();
  const processo = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    cwd: raiz,
    env: { ...process.env, ...ENV_LIMPO, NODE_ENV: "production", PORT: String(porta), API_SHARED_SECRET: segredo },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${porta}`;
  for (let tentativa = 0; tentativa < 150; tentativa++) {
    const pronto = await fetch(`${base}/health`).then((r) => r.ok, () => false);
    if (pronto) return { base, processo };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  processo.kill();
  throw new Error("server.ts nao subiu em 30 s");
}

const postar = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: "{}" });

let comSegredo: { base: string; processo: ChildProcess };
let semSegredo: { base: string; processo: ChildProcess };

before(async () => {
  [comSegredo, semSegredo] = await Promise.all([subir(SEGREDO), subir("")]);
});

after(() => {
  comSegredo?.processo.kill();
  semSegredo?.processo.kill();
});

test("a lista de rotas tem as 13 conhecidas", () => {
  assert.equal(rotasPost.length, 13, rotasPost.join(", "));
  assert.ok(rotasPost.includes("/api/v1/render-and-store"));
});

test("todo POST responde 401 sem o segredo ou com o segredo errado", async () => {
  for (const rota of rotasPost) {
    assert.equal((await postar(comSegredo.base + rota)).status, 401, rota);
    assert.equal((await postar(comSegredo.base + rota, { "x-api-secret": "errado" })).status, 401, rota);
  }
});

test("sem API_SHARED_SECRET em producao, todo POST responde 503", async () => {
  for (const rota of rotasPost) {
    assert.equal((await postar(semSegredo.base + rota)).status, 503, rota);
  }
});

test("render-and-store com o segredo chega na validacao", async () => {
  const resposta = await postar(`${comSegredo.base}/api/v1/render-and-store`, { "x-api-secret": SEGREDO });
  assert.equal(resposta.status, 400);
  assert.equal((await resposta.json()).stage, "validate");
});

test("rota de deck recusa o que nao e' deck antes de abrir o Storage", async () => {
  const fora = [
    "/api/v1/decks/conteudos/brainhex/a/b.html",
    "/api/v1/decks/conteudo_aluno/fontes/classe-1/prova.html",
    "/api/v1/decks/conteudo_aluno/brainhex/a/audio.mp3",
    "/api/v1/decks/conteudo_aluno/brainhex/%2E%2E/fontes/prova.html",
  ];
  for (const rota of fora) {
    assert.equal((await fetch(comSegredo.base + rota)).status, 404, rota);
  }
});

test("deck valido passa sem cabecalho e so' para na falta de Storage do teste", async () => {
  const resposta = await fetch(`${comSegredo.base}/api/v1/decks/conteudo_aluno/brainhex/a/apresentacao/m.html`);
  assert.equal(resposta.status, 500);
});
