import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ANDROID_FORA_DO_DEV,
  conferirEnvDoBuild,
  mensagemDaConferencia,
  FORA_DO_DEV,
  SEMPRE,
} from "./envDoBuild";

type MontarConfig = ((contexto: { config: Record<string, unknown> }) => Record<string, unknown>) & {
  resolverGoogleServices: (ambiente: Record<string, string | undefined>, raiz: string) => string | null;
};
const montarConfig = createRequire(__filename)("../../app.config.js") as MontarConfig;
const { resolverGoogleServices } = montarConfig;

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

test("android de distribuicao exige o google-services.json; ios e development nao", () => {
  // Medido em 08/11 no 1.0.7: sem o arquivo o Firebase nao inicializa, o push token nao existe
  // e todo login Android chega sem token. O build saia normal.
  for (const profile of ["preview", "production", "productionAAB"]) {
    const android = conferirEnvDoBuild({ ...COMPLETO, EAS_BUILD_PLATFORM: "android" }, profile);
    assert.deepEqual(android.faltando, [...ANDROID_FORA_DO_DEV], profile);
    assert.equal(android.ok, false, profile);

    const comArquivo = conferirEnvDoBuild(
      { ...COMPLETO, EAS_BUILD_PLATFORM: "android", GOOGLE_SERVICES_JSON: "/tmp/eas/google-services.json" },
      profile,
    );
    assert.equal(comArquivo.ok, true, profile);

    assert.equal(conferirEnvDoBuild({ ...COMPLETO, EAS_BUILD_PLATFORM: "ios" }, profile).ok, true, profile);
  }
  const dev = conferirEnvDoBuild({ ...COMPLETO, EAS_BUILD_PLATFORM: "android" }, "development");
  assert.equal(dev.ok, true, "development nao pode ser barrado por isso");
});

test("a mensagem do firebase diz como criar a variavel de arquivo", () => {
  const msg = mensagemDaConferencia(
    conferirEnvDoBuild({ ...COMPLETO, EAS_BUILD_PLATFORM: "android" }, "production"),
  );
  assert.ok(msg.includes("GOOGLE_SERVICES_JSON: ausente"));
  assert.ok(msg.includes("--type file"));
  // A falta da URL da API nao cita o Firebase: a dica so aparece quando e' ela que falta.
  const semApi = mensagemDaConferencia(
    conferirEnvDoBuild({ ...COMPLETO, EXPO_PUBLIC_APITRAIUP_URL: "" }, "production"),
  );
  assert.ok(!semApi.includes("Firebase"));
});

test("app.config.js liga o arquivo do Firebase ao Android e nao inventa caminho", () => {
  const raiz = mkdtempSync(join(tmpdir(), "trailup-config-"));
  try {
    assert.equal(resolverGoogleServices({}, raiz), null);
    assert.equal(resolverGoogleServices({ GOOGLE_SERVICES_JSON: "  " }, raiz), null);
    assert.equal(
      resolverGoogleServices({ GOOGLE_SERVICES_JSON: "/eas/arquivo.json" }, raiz),
      "/eas/arquivo.json",
    );
    writeFileSync(join(raiz, "google-services.json"), "{}");
    assert.equal(resolverGoogleServices({}, raiz), "./google-services.json");
    // A variavel do EAS vence o arquivo local.
    assert.equal(resolverGoogleServices({ GOOGLE_SERVICES_JSON: "/eas/x.json" }, raiz), "/eas/x.json");
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }

  // O resto do app.json passa intacto.
  const anterior = process.env.GOOGLE_SERVICES_JSON;
  process.env.GOOGLE_SERVICES_JSON = "/eas/arquivo.json";
  try {
    const config = montarConfig({ config: { name: "TrailUp", android: { package: "com.seuprojeto.trailup" } } });
    assert.deepEqual(config, {
      name: "TrailUp",
      web: {},
      experiments: {},
      android: { package: "com.seuprojeto.trailup", googleServicesFile: "/eas/arquivo.json" },
    });
  } finally {
    if (anterior === undefined) delete process.env.GOOGLE_SERVICES_JSON;
    else process.env.GOOGLE_SERVICES_JSON = anterior;
  }
});

test("app.config.js continua publicando o app do aluno em /aluno na Vercel", () => {
  // O espelho tinha o app.config.js so' com isto (10df7819); o Firebase entrou junto, sem tirar.
  const salvo = { base: process.env.EXPO_WEB_BASE_URL, saida: process.env.EXPO_WEB_OUTPUT };
  process.env.EXPO_WEB_BASE_URL = "/aluno";
  process.env.EXPO_WEB_OUTPUT = "single";
  try {
    const config = montarConfig({
      config: { web: { output: "static" }, experiments: { typedRoutes: true }, android: { package: "p" } },
    });
    assert.deepEqual(config.web, { output: "single" });
    assert.deepEqual(config.experiments, { typedRoutes: true, baseUrl: "/aluno" });
  } finally {
    for (const [nome, valor] of [["EXPO_WEB_BASE_URL", salvo.base], ["EXPO_WEB_OUTPUT", salvo.saida]] as const) {
      if (valor === undefined) delete process.env[nome];
      else process.env[nome] = valor;
    }
  }
});
