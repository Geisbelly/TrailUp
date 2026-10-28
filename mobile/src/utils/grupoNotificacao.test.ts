import assert from "node:assert/strict";
import test from "node:test";

import { abreGrupo, grupoDaNotificacao } from "./grupoNotificacao";

const agora = new Date(2026, 9, 27, 21, 0);

test("hoje, esta semana e anteriores pelo dia do aparelho", () => {
  assert.equal(grupoDaNotificacao(new Date(2026, 9, 27, 0, 5), agora), "Hoje");
  assert.equal(grupoDaNotificacao(new Date(2026, 9, 26, 23, 59), agora), "Esta semana");
  assert.equal(grupoDaNotificacao(new Date(2026, 9, 21, 8, 0), agora), "Esta semana");
  assert.equal(grupoDaNotificacao(new Date(2026, 9, 20, 8, 0), agora), "Anteriores");
});

test("data inválida ou futura não quebra", () => {
  assert.equal(grupoDaNotificacao("lixo", agora), "Anteriores");
  assert.equal(grupoDaNotificacao(null, agora), "Anteriores");
  assert.equal(grupoDaNotificacao(new Date(2026, 9, 28), agora), "Hoje");
});

test("cabeçalho só na primeira linha de cada grupo", () => {
  const itens = [new Date(2026, 9, 27), new Date(2026, 9, 27), new Date(2026, 9, 25), new Date(2026, 8, 1)];
  const grupos = itens.map((_, i) => abreGrupo(itens, i, (d) => d, agora));
  assert.deepEqual(grupos, ["Hoje", null, "Esta semana", "Anteriores"]);
});
