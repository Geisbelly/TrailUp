import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * Camera DESLIGADA por padrao (issue #195, criterio "no primeiro uso a camera
 * esta desligada e so liga por acao explicita").
 *
 * Consentimento para dado biometrico nao pode vir pre-marcado (LGPD art. 11), e
 * o publico e escolar (art. 14). Antes disto, aceitar os termos pedia a
 * permissao do SO no meio da leitura e, se concedida, ligava a captura sozinha.
 *
 * Isto deixou de ser teorico: ate entao os frames eram descartados sem analise.
 * Com `EMOTION_MODEL_PROVIDER=local_vision` a imagem passa a ser analisada de
 * verdade, e um default ligado viraria analise de rosto sem opt-in.
 *
 * Guarda de TEXTO porque o estado inicial vive em constantes e literais, nao
 * em comportamento que de para exercitar sem o runtime do Expo.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const consent = readFileSync(resolve(RAIZ, "utils/telemetryConsent.ts"), "utf8");
const gate = readFileSync(resolve(RAIZ, "components/TelemetryConsentGate.tsx"), "utf8");

const semQuebras = (texto: string) => texto.replace(/\s+/g, " ");

test("o default de preferencias traz a camera desligada", () => {
  const bloco = /DEFAULT_TELEMETRY_PREFERENCES[\s\S]*?\};/.exec(consent)?.[0] ?? "";
  assert.ok(bloco, "DEFAULT_TELEMETRY_PREFERENCES não encontrado");
  assert.match(bloco, /cameraEnabled:\s*false/);
  assert.doesNotMatch(bloco, /cameraEnabled:\s*true/);
});

test("aceitar o termo nao deriva a camera da permissao do SO", () => {
  // O padrao antigo: `cameraEnabled: params.cameraPermissionGranted === true`.
  assert.doesNotMatch(
    semQuebras(consent),
    /cameraEnabled:\s*params\.cameraPermissionGranted/,
  );
});

test("registro legado sem preferencia explicita entra desligado", () => {
  // Permissao do SO concedida nao e consentimento para analisar.
  assert.doesNotMatch(
    semQuebras(consent),
    /cameraEnabled:\s*parsed\.cameraPermissionGranted/,
  );
});

test("o aceite nao pede a permissao da camera", () => {
  // Checa CODIGO, nao texto: o comentario que explica a remocao cita
  // `expo-camera` de proposito, e nao pode derrubar o teste.
  const semComentarios = gate
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(semComentarios, /requestCameraPermissionsAsync\s*\(/);
  assert.doesNotMatch(semComentarios, /require\(["']expo-camera["']\)/);
});

test("o aceite grava a camera desligada", () => {
  const aceite = /const handleAccept[\s\S]*?setVisible\(false\)/.exec(gate)?.[0] ?? "";
  assert.ok(aceite, "handleAccept não encontrado");
  assert.match(aceite, /cameraEnabled:\s*false/);
  assert.match(aceite, /cameraPermissionGranted:\s*false/);
});

test("o termo nao promete mais pedir a camera ao aceitar", () => {
  const corrido = semQuebras(gate);
  assert.doesNotMatch(corrido, /solicitará acesso aos recursos necessários/);
  assert.match(corrido, /a câmera continua desligada/i);
  assert.match(corrido, /Coleta e acessos/);
});
