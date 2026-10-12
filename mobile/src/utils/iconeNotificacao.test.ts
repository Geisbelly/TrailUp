import assert from "node:assert/strict";
import test from "node:test";

import { iconeDaNotificacao } from "@/utils/iconeNotificacao";

test("tipos das rotinas do banco", () => {
  assert.equal(iconeDaNotificacao("revisao_diaria"), "book-open-page-variant-outline");
  assert.equal(iconeDaNotificacao("pausa_saudavel"), "coffee-outline");
  assert.equal(iconeDaNotificacao("retomada_login"), "clock-outline");
});

test("conquista, ranking e social", () => {
  assert.equal(iconeDaNotificacao("conquista"), "trophy-outline");
  assert.equal(iconeDaNotificacao("rank_subiu"), "podium");
  assert.equal(iconeDaNotificacao("convite_amizade"), "account-group-outline");
  assert.equal(iconeDaNotificacao("guilda_convite"), "account-group-outline");
});

test("'ia' só como palavra inteira: 'diaria' não vira conversa", () => {
  assert.equal(iconeDaNotificacao("ia_dica"), "message-text-outline");
  assert.notEqual(iconeDaNotificacao("revisao_diaria"), "message-text-outline");
});

test("sem tipo, olha o título; sem pista nenhuma, sino", () => {
  assert.equal(iconeDaNotificacao(null, "Hora de uma pausa"), "coffee-outline");
  assert.equal(iconeDaNotificacao(null, "Conquista: Fronteira Avançada"), "trophy-outline");
  assert.equal(iconeDaNotificacao(null, "Bem-vindo de volta"), "bell-outline");
  assert.equal(iconeDaNotificacao("", ""), "bell-outline");
});
