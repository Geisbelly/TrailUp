import assert from "node:assert/strict";
import test from "node:test";

import {
  conferirEnvDoBuild,
  mensagemDaConferencia,
  FORA_DO_DEV,
  SEMPRE,
} from "./envDoBuild";

/**
 * As `EXPO_PUBLIC_*` entram no bundle em tempo de BUILD. Medido no repositório: `eas.json` não
 * declara `env` em profile nenhum, não existe `.easignore`, e o `.gitignore` tem `.env` — o EAS
 * não envia o arquivo, e as variáveis só podem vir das EAS Environment Variables. Nada no
 * repositório dizia quais são (#97).
 *
 * Faltar não dá erro: sem `EXPO_PUBLIC_APITRAIUP_URL` o app cai nos palpites locais, que num
 * aparelho real não resolvem, e a telemetria grava sem análise. Por isso a conferência barra o
 * BUILD — depois de gerado, é tarde.
 */
const COMPLETO = {
  EXPO_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "chave-publica",
  EXPO_PUBLIC_APITRAIUP_URL: "https://api.exemplo.test",
};

test("build completo passa", () => {
  const c = conferirEnvDoBuild({ ...COMPLETO, EAS_BUILD_PROFILE: "production" });
  assert.equal(c.ok, true);
  assert.deepEqual(c.faltando, []);
});

test("production exige a URL da API; development nao", () => {
  // Em `development` o app acha o Metro pelo IP. Nos profiles que viram APK/AAB nao ha Metro
  // nenhum, e e' ali que a ausencia vira o defeito da #96.
  const semApi = { ...COMPLETO, EXPO_PUBLIC_APITRAIUP_URL: "" };

  const prod = conferirEnvDoBuild({ ...semApi, EAS_BUILD_PROFILE: "production" });
  assert.deepEqual(prod.faltando, ["EXPO_PUBLIC_APITRAIUP_URL"]);
  assert.equal(prod.ok, false);

  const dev = conferirEnvDoBuild({ ...semApi, EAS_BUILD_PROFILE: "development" });
  assert.equal(dev.ok, true, "development nao pode ser barrado por isso");
});

test("os profiles de distribuicao sao todos tratados como producao", () => {
  // `preview` e `productionAAB` tambem viram artefato instalado. Esquecer um deles deixaria o
  // mesmo defeito passar por outro caminho.
  for (const profile of ["preview", "production", "productionAAB"]) {
    const c = conferirEnvDoBuild({ ...COMPLETO, EXPO_PUBLIC_APITRAIUP_URL: "" }, profile);
    assert.deepEqual(c.faltando, ["EXPO_PUBLIC_APITRAIUP_URL"], profile);
  }
});

test("variavel so com espaco conta como ausente", () => {
  const c = conferirEnvDoBuild({ ...COMPLETO, EXPO_PUBLIC_SUPABASE_URL: "   " }, "production");
  assert.deepEqual(c.faltando, ["EXPO_PUBLIC_SUPABASE_URL"]);
});

test("URL sem esquema e recusada, nao aceita calada", () => {
  // `fetch("/api/...")` num aparelho nao vai a lugar nenhum: o erro apareceria so' em runtime,
  // no celular do aluno.
  for (const valor of ["/api", "api.exemplo.test", "ftp://x"]) {
    const c = conferirEnvDoBuild({ ...COMPLETO, EXPO_PUBLIC_APITRAIUP_URL: valor }, "production");
    assert.equal(c.ok, false, valor);
    assert.equal(c.invalidas[0]?.nome, "EXPO_PUBLIC_APITRAIUP_URL", valor);
  }
});

test("a chave anon nao e validada como URL", () => {
  // Ela nao termina em _URL; validar formato dela aqui seria inventar regra.
  const c = conferirEnvDoBuild({ ...COMPLETO, EXPO_PUBLIC_SUPABASE_ANON_KEY: "nao-e-url" }, "production");
  assert.equal(c.ok, true);
});

test("a mensagem diz o que falta E onde se define", () => {
  const c = conferirEnvDoBuild({ EAS_BUILD_PROFILE: "production" });
  const msg = mensagemDaConferencia(c);
  for (const nome of [...SEMPRE, ...FORA_DO_DEV]) {
    assert.ok(msg.includes(nome), `a mensagem nao cita ${nome}`);
  }
  assert.ok(msg.includes("EAS Environment Variables"), "nao diz onde definir");
  assert.ok(msg.includes(".env.example"), "nao aponta a lista canonica");
});

test("sem profile no ambiente, assume development", () => {
  // Build local roda sem `EAS_BUILD_PROFILE`. Assumir produção barraria `npm start`.
  const c = conferirEnvDoBuild({ ...COMPLETO, EXPO_PUBLIC_APITRAIUP_URL: "" });
  assert.equal(c.profile, "development");
  assert.equal(c.ok, true);
});
