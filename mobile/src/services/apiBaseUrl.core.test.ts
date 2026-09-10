import assert from "node:assert/strict";
import test from "node:test";

import { isNetworkRequestFailedError, metroHostBaseUrl, montarCandidatos } from "./apiBaseUrl.core";

const API = "https://api.trailup.exemplo";

function candidatos(over: Partial<Parameters<typeof montarCandidatos>[0]> = {}) {
  return montarCandidatos({ envValue: null, plataforma: "android", metroHostUri: null, dev: false, ...over });
}

test("build instalado sem env nao inventa URL nenhuma", () => {
  assert.deepEqual(candidatos({ envValue: "" }), []);
  assert.deepEqual(candidatos({ envValue: "nao-e-url" }), []);
});

test("com env valido o build instalado usa apenas a URL configurada", () => {
  assert.deepEqual(candidatos({ envValue: API }), [API]);
});

test("em dev o IP do Metro vem primeiro e o padrao local segue disponivel", () => {
  const lista = candidatos({ dev: true, envValue: API, metroHostUri: "192.168.0.10:8081" });
  assert.equal(lista[0], "http://192.168.0.10:8000");
  assert.ok(lista.includes(API));
  assert.ok(lista.includes("http://10.0.2.2:8000"));
});

test("localhost configurado e mapeado para Android", () => {
  assert.ok(candidatos({ envValue: "http://localhost:8000" }).includes("http://10.0.2.2:8000"));
});

test("metroHostBaseUrl ignora hosts locais e entradas invalidas", () => {
  assert.equal(metroHostBaseUrl("localhost:8081"), null);
  assert.equal(metroHostBaseUrl("127.0.0.1:8081"), null);
  assert.equal(metroHostBaseUrl("10.1.2.3:8081"), "http://10.1.2.3:8000");
});

test("isNetworkRequestFailedError reconhece falhas de rede", () => {
  assert.ok(isNetworkRequestFailedError(new Error("Network request failed")));
  assert.ok(isNetworkRequestFailedError(new Error("Failed to fetch")));
  assert.ok(!isNetworkRequestFailedError(new Error("401 Unauthorized")));
});
