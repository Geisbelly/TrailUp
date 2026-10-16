import assert from "node:assert/strict";
import test from "node:test";

import { agruparPorData, grupoDaData } from "./gruposNotificacao";

// Sábado, 10/10/2026, 15h (horário local).
const AGORA = new Date(2026, 9, 10, 15, 0, 0);

test("hoje desde a meia-noite local", () => {
  assert.equal(grupoDaData(new Date(2026, 9, 10, 0, 1).toISOString(), AGORA), "Hoje");
  assert.equal(grupoDaData(new Date(2026, 9, 10, 14, 59).toISOString(), AGORA), "Hoje");
});

test("esta semana são os 6 dias anteriores a hoje", () => {
  assert.equal(grupoDaData(new Date(2026, 9, 9, 23, 59).toISOString(), AGORA), "Esta semana");
  assert.equal(grupoDaData(new Date(2026, 9, 4, 0, 0).toISOString(), AGORA), "Esta semana");
  assert.equal(grupoDaData(new Date(2026, 9, 3, 23, 59).toISOString(), AGORA), "Anteriores");
});

test("data ausente ou inválida vai para Anteriores", () => {
  assert.equal(grupoDaData(null, AGORA), "Anteriores");
  assert.equal(grupoDaData("não é data", AGORA), "Anteriores");
});

test("agrupa na ordem Hoje, Esta semana, Anteriores e omite grupo vazio", () => {
  const itens = [
    { id: 1, quando: new Date(2026, 8, 1).toISOString() },
    { id: 2, quando: new Date(2026, 9, 10, 9).toISOString() },
    { id: 3, quando: new Date(2026, 8, 2).toISOString() },
  ];
  const grupos = agruparPorData(itens, (i) => i.quando, AGORA);
  assert.deepEqual(grupos.map((g) => [g.grupo, g.itens.map((i) => i.id)]), [
    ["Hoje", [2]],
    ["Anteriores", [1, 3]],
  ]);
});
