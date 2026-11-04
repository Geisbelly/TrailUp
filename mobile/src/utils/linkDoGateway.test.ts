import assert from "node:assert/strict";
import test from "node:test";

import { aplicarAssinatura, caminhoParaAssinar, criarAssinador, type RespostaDeLinks } from "./linkDoGateway";

const BASE = "https://x.supabase.co/functions/v1/storage-redirect";
const AGORA = 1_800_000_000;

function emitido(caminho: string, sig = "assinatura") {
  return `${BASE}?path=${encodeURIComponent(caminho)}&u=aluno&exp=${AGORA + 7200}&sig=${sig}`;
}

function gatewayFalso() {
  const chamadas: string[][] = [];
  const pedir = async (caminhos: string[]): Promise<RespostaDeLinks> => {
    chamadas.push(caminhos);
    return {
      expira_em: AGORA + 7200,
      links: Object.fromEntries(caminhos.filter((c) => !c.startsWith("proibido/")).map((c) => [c, emitido(c)])),
    };
  };
  return { pedir, chamadas };
}

test("reconhece a URL do gateway sem assinatura e ignora o resto", () => {
  assert.equal(caminhoParaAssinar(`${BASE}?path=brainhex%2F1%2Faudio.mp3&v=3`), "brainhex/1/audio.mp3");
  assert.equal(caminhoParaAssinar(emitido("a/b.mp3")), null);
  assert.equal(caminhoParaAssinar("https://outro.site/a.mp3"), null);
  assert.equal(caminhoParaAssinar("file:///cache/a.mp3"), null);
  assert.equal(caminhoParaAssinar("a/b.mp3"), null);
});

test("a assinatura entra sem tirar o path, a revisão nem o proxy", () => {
  const url = new URL(aplicarAssinatura(`${BASE}?path=a%2Fb.html&v=7&proxy=1`, emitido("a/b.html", "xyz")));
  assert.equal(url.searchParams.get("path"), "a/b.html");
  assert.equal(url.searchParams.get("v"), "7");
  assert.equal(url.searchParams.get("proxy"), "1");
  assert.equal(url.searchParams.get("sig"), "xyz");
});

test("o prefetch de vários materiais vira um pedido só", async () => {
  const { pedir, chamadas } = gatewayFalso();
  const { assinar } = criarAssinador(pedir, () => AGORA);
  const urls = await Promise.all([
    assinar(`${BASE}?path=a%2F1.mp3`),
    assinar(`${BASE}?path=a%2F2.pdf`),
    assinar(`${BASE}?path=a%2F1.mp3&v=2`),
  ]);
  assert.equal(chamadas.length, 1);
  assert.deepEqual(chamadas[0], ["a/1.mp3", "a/2.pdf"]);
  for (const url of urls) assert.equal(new URL(url).searchParams.get("sig"), "assinatura");
});

test("reaproveita o link até faltar pouco para vencer", async () => {
  const { pedir, chamadas } = gatewayFalso();
  let agora = AGORA;
  const { assinar } = criarAssinador(pedir, () => agora);
  await assinar(`${BASE}?path=a%2F1.mp3`);
  agora += 3600;
  await assinar(`${BASE}?path=a%2F1.mp3`);
  assert.equal(chamadas.length, 1);
  agora = AGORA + 7200 - 60;
  await assinar(`${BASE}?path=a%2F1.mp3`);
  assert.equal(chamadas.length, 2);
});

test("sem link (offline, gateway antigo, caminho negado) devolve a URL original", async () => {
  const { assinar } = criarAssinador(gatewayFalso().pedir, () => AGORA);
  assert.equal(await assinar(`${BASE}?path=proibido%2Fx.mp3`), `${BASE}?path=proibido%2Fx.mp3`);

  const offline = criarAssinador(async () => {
    throw new Error("rede");
  }, () => AGORA);
  assert.equal(await offline.assinar(`${BASE}?path=a%2F1.mp3`), `${BASE}?path=a%2F1.mp3`);
});
