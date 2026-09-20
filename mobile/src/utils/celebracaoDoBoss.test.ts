import assert from "node:assert/strict";
import test from "node:test";

import { NADA_OBSERVADO, proximaCelebracao } from "./celebracaoDoBoss";

test("celebra quando o boss cai", () => {
  const visto = proximaCelebracao(NADA_OBSERVADO, { chave: "a", derrotado: false });
  assert.equal(visto.celebrar, false, "o primeiro olhar so registra");
  const caiu = proximaCelebracao(visto.observacao, { chave: "a", derrotado: true });
  assert.equal(caiu.celebrar, true);
});

test("chegar num boss JA derrotado nao celebra", () => {
  // Este e o caso que fazia o parabens virar incomodo: conteudo concluido e o
  // que o aluno mais reabre.
  const { celebrar } = proximaCelebracao(NADA_OBSERVADO, { chave: "a", derrotado: true });
  assert.equal(celebrar, false);
});

test("nao celebra duas vezes o mesmo boss", () => {
  let est = proximaCelebracao(NADA_OBSERVADO, { chave: "a", derrotado: false }).observacao;
  const primeira = proximaCelebracao(est, { chave: "a", derrotado: true });
  assert.equal(primeira.celebrar, true);
  const segunda = proximaCelebracao(primeira.observacao, { chave: "a", derrotado: true });
  assert.equal(segunda.celebrar, false, "re-render nao repete o parabens");
});

test("trocar de boss ja derrotado nao celebra o novo", () => {
  // Passar de um conteudo vencido para outro tambem vencido: dois `derrotado:
  // true` seguidos, mas chaves diferentes. Sem a comparacao de chave, isto
  // celebraria.
  let est = proximaCelebracao(NADA_OBSERVADO, { chave: "a", derrotado: false }).observacao;
  est = proximaCelebracao(est, { chave: "a", derrotado: true }).observacao;
  const outro = proximaCelebracao(est, { chave: "b", derrotado: true });
  assert.equal(outro.celebrar, false);
});

test("boss novo que cai depois de observado celebra", () => {
  let est = proximaCelebracao(NADA_OBSERVADO, { chave: "a", derrotado: true }).observacao;
  est = proximaCelebracao(est, { chave: "b", derrotado: false }).observacao;
  assert.equal(proximaCelebracao(est, { chave: "b", derrotado: true }).celebrar, true);
});

test("boss que revive e cai de novo celebra de novo", () => {
  // `encounter_timeout` faz o boss recuperar vida. Derrubar de novo e uma
  // vitoria de novo.
  let est = proximaCelebracao(NADA_OBSERVADO, { chave: "a", derrotado: false }).observacao;
  est = proximaCelebracao(est, { chave: "a", derrotado: true }).observacao;
  est = proximaCelebracao(est, { chave: "a", derrotado: false }).observacao;
  assert.equal(proximaCelebracao(est, { chave: "a", derrotado: true }).celebrar, true);
});
