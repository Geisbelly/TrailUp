import assert from "node:assert/strict";
import { test } from "node:test";
import { SEM_NAO_LIDAS, agruparNaoLidas, rotuloDoContador, zerarConversa } from "./chatNaoLidasModel";

test("agrupa por colega e por guilda e soma o total", () => {
  const n = agruparNaoLidas([
    { tipo: "privado", conversa_id: "b", nao_lidas: 2, ultima_em: "2026-11-01T10:00:00Z" },
    { tipo: "privado", conversa_id: "c", nao_lidas: 1 },
    { tipo: "guilda", conversa_id: "g", nao_lidas: 5 },
  ]);
  assert.deepEqual(n.privado, { b: 2, c: 1 });
  assert.deepEqual(n.guilda, { g: 5 });
  assert.equal(n.total, 8);
});

test("descarta linha inválida em vez de inventar contagem", () => {
  const n = agruparNaoLidas([
    null,
    { tipo: "outro", conversa_id: "x", nao_lidas: 3 },
    { tipo: "privado", conversa_id: "", nao_lidas: 3 },
    { tipo: "privado", conversa_id: "b", nao_lidas: 0 },
    { tipo: "privado", conversa_id: "c", nao_lidas: "abc" },
    { tipo: "guilda", conversa_id: "g", nao_lidas: "4" },
  ]);
  assert.deepEqual(n, { privado: {}, guilda: { g: 4 }, total: 4 });
});

test("sem nada não lido (ou sem a RPC) fica vazio", () => {
  assert.equal(agruparNaoLidas([]), SEM_NAO_LIDAS);
  assert.equal(agruparNaoLidas(null), SEM_NAO_LIDAS);
});

test("abrir a conversa zera só ela", () => {
  const n = agruparNaoLidas([
    { tipo: "privado", conversa_id: "b", nao_lidas: 2 },
    { tipo: "guilda", conversa_id: "g", nao_lidas: 1 },
  ]);
  const depois = zerarConversa(n, "privado", "b");
  assert.deepEqual(depois, { privado: {}, guilda: { g: 1 }, total: 1 });
  assert.equal(zerarConversa(depois, "guilda", "g"), SEM_NAO_LIDAS);
  assert.equal(zerarConversa(depois, "privado", "nenhuma"), depois);
});

test("o selo passa de 9 para 9+", () => {
  assert.equal(rotuloDoContador(3), "3");
  assert.equal(rotuloDoContador(9), "9");
  assert.equal(rotuloDoContador(10), "9+");
});
