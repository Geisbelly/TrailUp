import assert from "node:assert/strict";
import { test } from "node:test";
import { destinoDoToque } from "./destinoDoToque";

const COLEGA = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

test("push de mensagem privada abre a conversa com quem mandou e leva o id do aviso", () => {
  assert.deepEqual(destinoDoToque({ tipo: "chat_privado", remetente_id: COLEGA, notificacao_id: 42 }), {
    rota: `/social?conversa=${COLEGA}&notificacao=42`,
    modo: "navigate",
  });
  assert.deepEqual(destinoDoToque({ tipo: "chat_privado", remetente_id: COLEGA }), { rota: `/social?conversa=${COLEGA}`, modo: "navigate" });
});

test("remetente que não é uuid não vira parâmetro: cai no detalhe da notificação", () => {
  assert.deepEqual(destinoDoToque({ tipo: "chat_privado", remetente_id: "x&notificacao=1", notificacao_id: 7 }), { rota: "/notificacoes/7", modo: "push" });
  assert.deepEqual(destinoDoToque({ tipo: "chat_privado", remetente_id: 12, notificacao_id: "7" }), { rota: "/notificacoes/7", modo: "push" });
});

test("os outros avisos seguem indo ao detalhe, e as locais sem id à lista", () => {
  assert.deepEqual(destinoDoToque({ tipo: "social_convite_recebido", aluno_id: COLEGA, notificacao_id: 9 }), { rota: "/notificacoes/9", modo: "push" });
  assert.deepEqual(destinoDoToque({ rotina: "revisao", local: true }), { rota: "/notificacoes", modo: "push" });
  assert.deepEqual(destinoDoToque(undefined), { rota: "/notificacoes", modo: "push" });
});
