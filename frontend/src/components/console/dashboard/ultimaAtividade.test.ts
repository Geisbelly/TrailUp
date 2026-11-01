import { describe, expect, it } from "vitest";
import { rotuloDaUltimaAtividade } from "./ultimaAtividade";

const hoje = new Date("2026-10-31T15:00:00Z");

describe("rotuloDaUltimaAtividade", () => {
  it("sem dado não vira 'inativo' nem número", () => {
    expect(rotuloDaUltimaAtividade(null, hoje)).toBe("sem dado");
    expect(rotuloDaUltimaAtividade(undefined, hoje)).toBe("sem dado");
  });

  it("hoje, ontem e há N dias", () => {
    expect(rotuloDaUltimaAtividade("2026-10-31T09:00:00Z", hoje)).toBe("hoje");
    expect(rotuloDaUltimaAtividade("2026-10-30T09:00:00Z", hoje)).toBe("ontem");
    expect(rotuloDaUltimaAtividade("2026-10-22T09:00:00Z", hoje)).toBe("há 9 dias");
  });
});
