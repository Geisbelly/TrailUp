import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLockedNodeMessage } from "./lockedNodeMessage";

describe("getLockedNodeMessage", () => {
  it("explica quais pré-requisitos liberam o módulo", () => {
    assert.deepEqual(getLockedNodeMessage("Cartografia", ["Introdução", "Bússola"]), {
      title: "Cartografia está bloqueado",
      body: "Conclua os módulos anteriores para liberar este conteúdo.",
      requirement: "Pré-requisitos: Introdução e Bússola.",
    });
  });

  it("informa que o conteúdo será liberado pela jornada quando não há dependência", () => {
    assert.deepEqual(getLockedNodeMessage("Cartografia", []), {
      title: "Cartografia está bloqueado",
      body: "Este conteúdo ainda não foi liberado para a sua jornada.",
      requirement: "Continue avançando na trilha para desbloqueá-lo.",
    });
  });
});
