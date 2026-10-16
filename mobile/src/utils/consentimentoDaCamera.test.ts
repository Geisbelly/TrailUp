import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

/**
 * Guarda do TEXTO que o aluno aceita, nao do comportamento.
 *
 * Historico, porque e o que da sentido as assercoes de hoje:
 *
 * - a **v2** afirmava que os frames eram "usados para analise". Nenhum codigo
 *   os analisava: `frames_b64` virava `len()` no `DeepFaceEmotionAnalyzer`. O
 *   aluno autorizava foto do proprio rosto sob premissa falsa;
 * - a **v3** corrigiu para o que era verdade — imagem contada e descartada,
 *   sem reconhecimento facial — e PROMETEU: "se a analise de imagem passar a
 *   existir, estes termos mudam e seu consentimento sera pedido de novo";
 * - a **v4** e o cumprimento dessa promessa. A analise existe
 *   (`api/app/services/emotion_vision.py`), e o termo passa a descreve-la.
 *
 * O que este arquivo impede, nas duas direcoes: que o termo volte a negar uma
 * analise que existe, e que descreva uma analise sem que a versao tenha
 * subido. Mentir para menos tambem e mentir.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gate = readFileSync(resolve(RAIZ, "components/TelemetryConsentGate.tsx"), "utf8");
// A versao e a regra de vigencia moram no modulo puro (sem AsyncStorage),
// para carregarem em Node — mesmo motivo de `telemetriaPayload.ts`.
const consent = readFileSync(resolve(RAIZ, "utils/telemetryConsentVersao.ts"), "utf8");
const coleta = readFileSync(
  resolve(RAIZ, "app/(tabs)/perfil/coleta-dados.tsx"),
  "utf8",
);

const semQuebras = (texto: string) => texto.replace(/\s+/g, " ");

test("o termo nao nega mais a analise, agora que ela existe", () => {
  const corrido = semQuebras(gate);
  assert.doesNotMatch(corrido, /não são analisadas/i);
  assert.doesNotMatch(corrido, /contadas e descartadas/i);
  assert.doesNotMatch(corrido, /[Nn]ão há reconhecimento facial/i);
});

test("o termo descreve o que a analise faz, em palavras de aluno", () => {
  const corrido = semQuebras(gate);
  assert.match(corrido, /imagens da câmera são analisadas/i);
  assert.match(corrido, /localiza o rosto/i);
  assert.match(corrido, /classifica a expressão/i);
});

test("o termo diz onde a analise roda e que a imagem nao sai de la", () => {
  const corrido = semQuebras(gate);
  assert.match(corrido, /servidor do próprio TrailUp/i);
  assert.match(corrido, /não em serviço de terceiros/i);
});

test("o termo continua garantindo que a imagem nao e gravada", () => {
  // Isto nao mudou entre v3 e v4, e nao pode mudar sem outra versao.
  const corrido = semQuebras(gate);
  assert.match(corrido, /descartada na mesma hora/i);
  assert.match(corrido, /[Nn]ão é gravada em lugar nenhum/i);
});

test("o termo nao vende a estimativa como diagnostico", () => {
  const corrido = semQuebras(gate);
  assert.match(corrido, /é um palpite, não um diagnóstico/i);
  assert.match(corrido, /pode errar/i);
});

test("o termo diz que recusar nao penaliza, e como desligar so a camera", () => {
  const corrido = semQuebras(gate);
  assert.match(corrido, /não muda sua nota|não tira nenhum conteúdo/i);
  assert.match(corrido, /Coleta e acessos/i);
});

test("a versao do termo saiu da v3, que negava a analise", () => {
  const versao = /TELEMETRY_CONSENT_VERSION\s*=\s*"([^"]+)"/.exec(consent)?.[1];
  assert.ok(versao, "versão do termo não encontrada");
  assert.notEqual(versao, "2026-09-30-v3", "a v3 negava a análise que agora existe");
  assert.notEqual(versao, "2026-04-10-v2");
});

test("consentimento de versao antiga nao vale como aceite", () => {
  // Sem isto, `status === "accepted"` de uma versão velha mantinha a captura
  // rodando enquanto o termo novo ainda esperava resposta na tela.
  assert.match(consent, /export function consentimentoEstaVigente/);
  assert.match(
    semQuebras(consent),
    /record\.version === TELEMETRY_CONSENT_VERSION/,
  );
});

test("o controle granular diz o que faz, nao so o sensor", () => {
  const corrido = semQuebras(coleta);
  assert.match(corrido, /Câmera e expressão facial/);
  assert.match(corrido, /estima sua expressão/i);
  assert.doesNotMatch(corrido, /title: "Câmera",/);
});
