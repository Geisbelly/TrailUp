import assert from "node:assert/strict";
import test from "node:test";

import { actionsForBagItem } from "@/services/bag/bagModel";

test("card gerado não apresenta editar nem excluir", () => {
  assert.deepEqual(actionsForBagItem({ origin: "plataforma", editable: false }), ["compartilhar"]);
});

test("item autoral apresenta editar, excluir e compartilhar", () => {
  assert.deepEqual(actionsForBagItem({ origin: "aluno", editable: true }), ["editar", "excluir", "compartilhar"]);
});
