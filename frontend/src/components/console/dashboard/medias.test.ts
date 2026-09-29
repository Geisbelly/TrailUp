import { describe, expect, it } from "vitest";
import { mediaDosPreenchidos } from "./medias";

describe("mediaDosPreenchidos", () => {
  it("ignora nulos em vez de contar como zero", () => {
    expect(mediaDosPreenchidos([8, null, 6])).toBe(7);
  });

  it("ninguém com valor não é média zero", () => {
    expect(mediaDosPreenchidos([null, null])).toBeNull();
    expect(mediaDosPreenchidos([])).toBeNull();
  });

  it("zero de verdade conta", () => {
    expect(mediaDosPreenchidos([0, 10])).toBe(5);
  });
});
