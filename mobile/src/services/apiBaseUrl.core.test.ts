import assert from "node:assert/strict";
import test from "node:test";

import {
  isNetworkRequestFailedError,
  metroHostBaseUrl,
  montarCandidatos,
} from "./apiBaseUrl.core";

const API = "https://api.trailup.exemplo";

function candidatos(over: Partial<Parameters<typeof montarCandidatos>[0]> = {}) {
  return montarCandidatos({
    envValue: null,
    plataforma: "android",
    metroHostUri: null,
    dev: false,
    ...over,
  });
}

test("build instalado sem env nao inventa URL nenhuma", () => {
  // O bug: `http://10.0.2.2:8000` (host do emulador) entrava sempre, a lista
  // nunca ficava vazia, e a falta de configuracao virava um "Network request
  // failed" indistinguivel de API hibernando.
  assert.deepEqual(candidatos({ dev: false, envValue: "" }), []);
  assert.deepEqual(candidatos({ dev: false, envValue: null }), []);
  assert.deepEqual(candidatos({ dev: false, envValue: "nao-e-url" }), []);
});

test("build instalado avisa quando fica sem API", () => {
  let avisos = 0;
  candidatos({ dev: false, envValue: "", aoFicarSemApi: () => (avisos += 1) });
  assert.equal(avisos, 1, "o aviso e a unica pista que sobra em producao");
});

test("com env valido o aviso nao sai", () => {
  let avisos = 0;
  const lista = candidatos({
    dev: false,
    envValue: API,
    aoFicarSemApi: () => (avisos += 1),
  });
  assert.deepEqual(lista, [API]);
  assert.equal(avisos, 0);
});

test("build instalado nao adiciona o host do emulador nem o do Metro", () => {
  const lista = candidatos({
    dev: false,
    envValue: API,
    metroHostUri: "192.168.0.10:8081",
  });
  assert.deepEqual(lista, [API], "em producao so vale o que foi configurado");
});

test("em dev o IP do Metro vem primeiro, e o padrao local fecha a lista", () => {
  const lista = candidatos({
    dev: true,
    envValue: API,
    metroHostUri: "192.168.0.10:8081",
  });
  assert.equal(lista[0], "http://192.168.0.10:8000", "Metro primeiro: IP sempre atual");
  assert.ok(lista.includes(API));
  assert.ok(lista.includes("http://10.0.2.2:8000"), "padrao do emulador segue em dev");
});

test("em dev sem env ainda ha por onde tentar", () => {
  const lista = candidatos({ dev: true, envValue: "" });
  assert.ok(lista.length > 0);
  assert.ok(lista.includes("http://10.0.2.2:8000"));
});

test("localhost configurado de proposito e mapeado no Android nos dois modos", () => {
  // Vale em producao porque veio do env: e intencao explicita de quem buildou.
  for (const dev of [true, false]) {
    const lista = candidatos({ dev, envValue: "http://localhost:8000" });
    assert.ok(
      lista.includes("http://10.0.2.2:8000"),
      `dev=${dev}: localhost precisa virar 10.0.2.2 no Android`
    );
  }
});

test("no iOS o padrao local e localhost, nao o host do emulador Android", () => {
  const lista = candidatos({ dev: true, envValue: "", plataforma: "ios" });
  assert.ok(lista.includes("http://localhost:8000"));
  assert.ok(!lista.includes("http://10.0.2.2:8000"));
});

test("a lista nao repete candidato", () => {
  const lista = candidatos({ dev: true, envValue: "http://10.0.2.2:8000" });
  assert.equal(new Set(lista).size, lista.length);
});

test("metroHostBaseUrl ignora host local e entrada invalida", () => {
  assert.equal(metroHostBaseUrl("localhost:8081"), null);
  assert.equal(metroHostBaseUrl("127.0.0.1:8081"), null);
  assert.equal(metroHostBaseUrl(null), null);
  assert.equal(metroHostBaseUrl(""), null);
  assert.equal(metroHostBaseUrl("10.1.2.3:8081"), "http://10.1.2.3:8000");
});

test("isNetworkRequestFailedError reconhece as variantes que importam", () => {
  for (const m of [
    "Network request failed",
    "TypeError: Failed to fetch",
    "Load failed",
    "NetworkError when attempting to fetch resource",
  ]) {
    assert.ok(isNetworkRequestFailedError(new Error(m)), m);
  }
  assert.ok(!isNetworkRequestFailedError(new Error("401 Unauthorized")));
});
