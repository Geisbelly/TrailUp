import { describe, it, expect } from "vitest";
import { descreverErroDatado } from "./erroDatado";

describe("descreverErroDatado", () => {
  it("carimba a data em que a falha foi registrada", () => {
    const quando = "2026-09-13T01:28:14.000Z";
    const resultado = descreverErroDatado("invalid UUID 'None'", quando);

    expect(resultado).toContain("invalid UUID 'None'");
    // Comparado com a mesma conversão: o formato depende do fuso do ambiente,
    // e travar a string exata deixaria o teste verde só na máquina de quem o
    // escreveu.
    expect(resultado).toContain(new Date(quando).toLocaleString("pt-BR"));
  });

  it("sem data, devolve o erro puro em vez de esconde-lo", () => {
    expect(descreverErroDatado("falhou", null)).toBe("falhou");
    expect(descreverErroDatado("falhou", undefined)).toBe("falhou");
  });

  it("data invalida nao quebra nem vira 'Invalid Date' na tela", () => {
    expect(descreverErroDatado("falhou", "nao-e-data")).toBe("falhou");
  });

  it("sem erro nao ha o que mostrar", () => {
    expect(descreverErroDatado(null, "2026-09-13T01:28:14.000Z")).toBeNull();
    expect(descreverErroDatado(undefined, null)).toBeNull();
    expect(descreverErroDatado("", null)).toBeNull();
    expect(descreverErroDatado("   ", null)).toBeNull();
  });
});
