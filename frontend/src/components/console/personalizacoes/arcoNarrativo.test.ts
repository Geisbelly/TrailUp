import { describe, expect, it, vi } from "vitest";
import { ARCO_MAXIMO, arcoMudou, contarCaracteres, salvarArco, validarArco, type BancoDoArco } from "./arcoNarrativo";

const banco = (): BancoDoArco => ({
  ler: vi.fn(),
  gravar: vi.fn(async (_id: number, texto: string) => ({ texto, atualizadoEm: "2026-11-02T12:00:00Z" })),
  apagar: vi.fn(async () => undefined),
});

describe("validarArco", () => {
  it("vazio é sem arco, e o texto sai sem espaço nas pontas", () => {
    expect(validarArco("   \n")).toEqual({ ok: true, texto: null });
    expect(validarArco("  A turma é a tripulação da Aurora. ")).toEqual({ ok: true, texto: "A turma é a tripulação da Aurora." });
  });

  it("o teto é o do banco, contado por caractere", () => {
    expect(validarArco("x".repeat(ARCO_MAXIMO))).toMatchObject({ ok: true });
    expect(validarArco("x".repeat(ARCO_MAXIMO + 1))).toMatchObject({ ok: false, erro: expect.stringContaining("3.000") });
    // 3000 emoji têm length 6000 no JS, mas o CHECK do banco aceita.
    expect(contarCaracteres("🚀".repeat(ARCO_MAXIMO))).toBe(ARCO_MAXIMO);
    expect(validarArco("🚀".repeat(ARCO_MAXIMO))).toMatchObject({ ok: true });
  });
});

describe("arcoMudou", () => {
  it("compara sem espaço nas pontas", () => {
    expect(arcoMudou(null, "  ")).toBe(false);
    expect(arcoMudou(null, "Aurora")).toBe(true);
    expect(arcoMudou({ texto: "Aurora", atualizadoEm: null }, " Aurora\n")).toBe(false);
    expect(arcoMudou({ texto: "Aurora", atualizadoEm: null }, "Vega")).toBe(true);
    expect(arcoMudou({ texto: "Aurora", atualizadoEm: null }, "")).toBe(true);
  });
});

describe("salvarArco", () => {
  it("texto grava, vazio apaga a linha", async () => {
    const b = banco();
    await expect(salvarArco(b, 7, " Aurora ")).resolves.toEqual({ texto: "Aurora", atualizadoEm: "2026-11-02T12:00:00Z" });
    expect(b.gravar).toHaveBeenCalledWith(7, "Aurora");
    await expect(salvarArco(b, 7, "  ")).resolves.toBeNull();
    expect(b.apagar).toHaveBeenCalledWith(7);
  });

  it("texto longo demais não chega no banco", async () => {
    const b = banco();
    await expect(salvarArco(b, 7, "x".repeat(ARCO_MAXIMO + 1))).rejects.toThrow("3.000");
    expect(b.gravar).not.toHaveBeenCalled();
    expect(b.apagar).not.toHaveBeenCalled();
  });
});
