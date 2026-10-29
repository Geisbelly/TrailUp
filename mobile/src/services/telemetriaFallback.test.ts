import assert from "node:assert/strict";
import test from "node:test";

import { classificarFallback, TelemetriaHttpError } from "./telemetriaFallback";

test("classifica o motivo do fallback pela classe do erro, não pela mensagem", () => {
  assert.equal(classificarFallback(new TelemetriaHttpError(503, "x")), "http_5xx");
  assert.equal(classificarFallback(new TelemetriaHttpError(500, "x")), "http_5xx");
  assert.equal(classificarFallback(new TelemetriaHttpError(401, "x")), "http_4xx");
  assert.equal(classificarFallback(new TelemetriaHttpError(422, "x")), "http_4xx");

  const aborto = new Error("The operation was aborted");
  aborto.name = "AbortError";
  assert.equal(classificarFallback(aborto), "timeout");

  assert.equal(classificarFallback(new TypeError("Network request failed")), "rede");
  assert.equal(
    classificarFallback(new Error("Sem sessão ativa para enviar telemetria.")),
    "sem_sessao"
  );
  assert.equal(classificarFallback(new Error("Resposta inválida da API de telemetria.")), "desconhecido");
  assert.equal(classificarFallback("qualquer coisa"), "desconhecido");
  assert.equal(classificarFallback(null), "desconhecido");
});

test("TelemetriaHttpError mantém a mensagem e expõe o status", () => {
  const erro = new TelemetriaHttpError(502, "Bad gateway");
  assert.ok(erro instanceof Error);
  assert.equal(erro.message, "Bad gateway");
  assert.equal(erro.status, 502);
});
