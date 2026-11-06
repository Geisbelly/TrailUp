import { test } from "node:test";
import assert from "node:assert/strict";

import { textoDeErro } from "./textoDeErro";

const RESERVA = "Tente novamente em instantes.";

test("mensagem escrita para o aluno passa", () => {
  assert.equal(textoDeErro(new Error("Saldo insuficiente para esta moldura."), RESERVA), "Saldo insuficiente para esta moldura.");
});

test("erro técnico vira o texto de reserva", () => {
  for (const cru of [
    "Failed to fetch",
    "Network request failed",
    "TypeError: Cannot read properties of undefined (reading 'id')",
    'new row violates row-level security policy for table "aluno"',
    "JWT expired",
    "permission denied for function trailup_x",
    "PGRST116",
    "HTTP 500",
  ]) {
    assert.equal(textoDeErro(new Error(cru), RESERVA), RESERVA, cru);
  }
});

test("sem mensagem, ou com mensagem longa demais, usa a reserva", () => {
  assert.equal(textoDeErro(new Error(""), RESERVA), RESERVA);
  assert.equal(textoDeErro({ qualquer: 1 }, RESERVA), RESERVA);
  assert.equal(textoDeErro(new Error("a".repeat(201)), RESERVA), RESERVA);
});
