import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * Guarda do TEXTO que o aluno aceita, não do comportamento.
 *
 * A v2 do termo afirmava que os frames da câmera eram "usados para análise".
 * Nenhum código os analisa: no `DeepFaceEmotionAnalyzer` da API, `frames_b64`
 * vira `len()` e só empurra um índice de confiança; não há biblioteca de visão
 * nas dependências. O aluno autorizava foto do próprio rosto sob premissa
 * falsa — e isso é a base legal da coleta, não um detalhe de copy.
 *
 * Este teste falha se a afirmação voltar. Se um dia a análise de imagem
 * existir de verdade, o certo é subir a versão do termo e ajustar este teste
 * junto — não apagá-lo.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gate = readFileSync(resolve(RAIZ, "components/TelemetryConsentGate.tsx"), "utf8");
const consent = readFileSync(resolve(RAIZ, "utils/telemetryConsent.ts"), "utf8");

const semQuebras = (texto: string) => texto.replace(/\s+/g, " ");

test("o termo nao afirma que a imagem da camera e analisada", () => {
  const corrido = semQuebras(gate);
  assert.doesNotMatch(
    corrido,
    /frames da câmera são usados para análise/i,
    "a afirmação falsa da v2 voltou ao termo"
  );
});

test("o termo diz explicitamente que a imagem nao e analisada hoje", () => {
  const corrido = semQuebras(gate);
  assert.match(corrido, /imagens da câmera não são analisadas/i);
  assert.match(corrido, /contadas e descartadas/i);
  assert.match(corrido, /sem reconhecimento facial|Não há reconhecimento facial/i);
});

test("o termo continua dizendo que a imagem nao e gravada", () => {
  // Esta parte da v2 era verdadeira e foi verificada no banco: 0 ocorrências
  // de `frame_b64` em 290 lotes, e `ia_decision_logs` vazia. Não pode sumir na
  // correção da outra metade.
  assert.match(semQuebras(gate), /não são gravadas em lugar nenhum/i);
});

test("a versao do termo saiu da v2, que continha a afirmacao falsa", () => {
  const versao = consent.match(/TELEMETRY_CONSENT_VERSION = "([^"]+)"/)?.[1];
  assert.ok(versao, "versão do termo não encontrada");
  assert.notEqual(
    versao,
    "2026-04-10-v2",
    "o texto mudou materialmente; a versão precisa subir para reexibir o modal"
  );
});
