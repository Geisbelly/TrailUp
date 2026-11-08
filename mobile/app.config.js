// Liga o Firebase (FCM) ao build Android. O resto da configuração continua em `app.json`.
//
// Sem `android.googleServicesFile` o Firebase não inicializa no aparelho ("Default FirebaseApp
// failed to initialize because no default options were found", medido no 1.0.7 em 08/11), e
// `getExpoPushTokenAsync` lança. O app segue funcionando, mas manda `token: null` no login e
// nenhum push remoto chega a aluno Android. Nenhum build do TrailUp teve o arquivo até aqui: o
// único token Android do banco veio do Expo Go, antes da `7493e4e2`.
//
// De onde vem o arquivo, nesta ordem:
// 1. `GOOGLE_SERVICES_JSON`: variável de ARQUIVO das EAS Environment Variables
//    (`eas env:create --type file`). O EAS põe o caminho do arquivo nela durante o build.
// 2. `mobile/google-services.json`, para build local. Fica fora do git (`.gitignore`), e o EAS
//    não envia arquivo ignorado: no build da nuvem só vale a variável.
//
// `src/utils/envDoBuild.ts` barra build Android de distribuição sem a variável.

/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");

const ARQUIVO_LOCAL = "google-services.json";

/**
 * @param {Record<string, string | undefined>} ambiente
 * @param {string} raiz
 * @returns {string | null}
 */
function resolverGoogleServices(ambiente, raiz) {
  const daVariavel = (ambiente.GOOGLE_SERVICES_JSON ?? "").trim();
  if (daVariavel) return daVariavel;
  return fs.existsSync(path.join(raiz, ARQUIVO_LOCAL)) ? `./${ARQUIVO_LOCAL}` : null;
}

/** @param {{ config: Record<string, any> }} contexto */
function montarConfig({ config }) {
  const googleServicesFile = resolverGoogleServices(process.env, __dirname);
  if (!googleServicesFile) return config;
  return { ...config, android: { ...config.android, googleServicesFile } };
}

module.exports = montarConfig;
module.exports.resolverGoogleServices = resolverGoogleServices;
