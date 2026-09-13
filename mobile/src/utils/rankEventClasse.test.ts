import assert from "node:assert/strict";
import test from "node:test";

import { resolveRankEventClasseId } from "./rankEventClasse";

test("usa a classe gravada no evento de crédito", () => {
  assert.equal(
    resolveRankEventClasseId({
      tipo: "presenca_aula",
      referencia: "classe:54:2026-09-12",
      classe_id: 54,
    }),
    54,
  );
});

test("resolve crédito legado pela referência da classe", () => {
  assert.equal(
    resolveRankEventClasseId({
      tipo: "presenca_aula",
      referencia: "classe:32:2026-09-12",
    }),
    32,
  );
});
