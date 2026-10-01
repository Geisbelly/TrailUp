import { describe, expect, it } from "vitest";
import { formatarAtualizadoHa } from "./atualizadoHa";

const base = new Date("2026-09-29T10:00:00Z");
const depois = (ms: number) => new Date(base.getTime() + ms);

describe("formatarAtualizadoHa", () => {
  it("menos de um minuto é agora", () => {
    expect(formatarAtualizadoHa(base, depois(59_000))).toBe("Atualizado agora");
  });

  it("conta minutos inteiros", () => {
    expect(formatarAtualizadoHa(base, depois(4 * 60_000 + 30_000))).toBe("Atualizado há 4 min");
  });

  it("passa para horas a partir de 60 minutos", () => {
    expect(formatarAtualizadoHa(base, depois(60 * 60_000))).toBe("Atualizado há 1 h");
    expect(formatarAtualizadoHa(base, depois(150 * 60_000))).toBe("Atualizado há 2 h");
  });
});
