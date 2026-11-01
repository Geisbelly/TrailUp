import assert from "node:assert/strict";
import test from "node:test";

import { hostDaApi, montarCliente, TAMANHO_MAXIMO_CAMPO } from "./telemetriaCliente.core";

test("host da API: so host e porta, sem caminho, query nem credencial", () => {
  assert.equal(hostDaApi("https://api.trailup.promora.dev.br"), "api.trailup.promora.dev.br");
  assert.equal(hostDaApi("http://26.233.9.23:8000/api?x=1"), "26.233.9.23:8000");
  assert.equal(hostDaApi("https://user:senha@api.exemplo.test/v1"), "api.exemplo.test");
});

test("host da API: ausente ou invalida vira nulo, sem lancar", () => {
  assert.equal(hostDaApi(undefined), null);
  assert.equal(hostDaApi(null), null);
  assert.equal(hostDaApi(""), null);
  assert.equal(hostDaApi("nao e url"), null);
});

test("cliente de um build EAS de producao", () => {
  assert.deepEqual(
    montarCliente({
      appVersion: "1.0.4",
      buildProfile: "production",
      ambiente: "standalone",
      dev: false,
      plataforma: "android",
      apiBase: "https://api.trailup.promora.dev.br",
    }),
    {
      app_version: "1.0.4",
      build_profile: "production",
      ambiente: "standalone",
      dev: false,
      plataforma: "android",
      api_host: "api.trailup.promora.dev.br",
    }
  );
});

test("fora de build EAS o profile fica nulo, e o que nao e texto tambem", () => {
  const cliente = montarCliente({
    appVersion: 104,
    buildProfile: undefined,
    ambiente: "  ",
    dev: true,
    plataforma: "ios",
    apiBase: "http://10.0.2.2:8000",
  });
  assert.equal(cliente.app_version, null);
  assert.equal(cliente.build_profile, null);
  assert.equal(cliente.ambiente, null);
  assert.equal(cliente.dev, true);
  assert.equal(cliente.api_host, "10.0.2.2:8000");
});

test("campo longo e cortado no mesmo limite da API", () => {
  const cliente = montarCliente({
    appVersion: "x".repeat(500),
    buildProfile: null,
    ambiente: null,
    dev: false,
    plataforma: null,
    apiBase: null,
  });
  assert.equal(cliente.app_version?.length, TAMANHO_MAXIMO_CAMPO);
});
