import assert from "node:assert/strict";
import test from "node:test";

import { dataCurta, resumirConquistas } from "./destaqueConquistas";

const item = (id: number, status: "concluida" | "em_progresso" | "bloqueada", progresso = 0, data: string | null = null) => ({
  status,
  progressoPercentual: progresso,
  conquista: { conquista_id: id, data_conquista: data },
});

test("conta as concluídas e o percentual da biblioteca", () => {
  const r = resumirConquistas([item(1, "concluida"), item(2, "bloqueada"), item(3, "em_progresso", 40), item(4, "concluida")]);
  assert.equal(r.concluidas, 2);
  assert.equal(r.total, 4);
  assert.equal(r.percentual, 50);
});

test("recentes: as 4 últimas concluídas, da mais nova para a mais velha", () => {
  const r = resumirConquistas([
    item(1, "concluida", 100, "2026-09-02"),
    item(2, "concluida", 100, "2026-09-14"),
    item(3, "concluida", 100, null),
    item(4, "concluida", 100, "2026-09-08"),
    item(5, "concluida", 100, "2026-09-20"),
  ]);
  assert.deepEqual(r.recentes.map((i) => i.conquista.conquista_id), [5, 2, 4, 1]);
});

test("quase lá: as 3 em progresso mais adiantadas", () => {
  const r = resumirConquistas([item(1, "em_progresso", 10), item(2, "em_progresso", 70), item(3, "em_progresso", 40), item(4, "em_progresso", 90)]);
  assert.deepEqual(r.quaseLa.map((i) => i.conquista.conquista_id), [4, 2, 3]);
});

test("biblioteca vazia não divide por zero; data curta", () => {
  assert.equal(resumirConquistas([]).percentual, 0);
  assert.equal(dataCurta(new Date(2026, 8, 14, 12).toISOString()), "14 set");
  assert.equal(dataCurta(null), "");
});
