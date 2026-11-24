import { describe, expect, it } from "vitest";
import { iniciaisDe } from "../dashboard/perfilCores";
import { iniciais as iniciaisDaConta } from "../meusdados/conta";
import { iniciais as iniciaisDaNota } from "../notas/nota";

describe("iniciais do nome", () => {
  it.each([
    ["Bruno (exemplo)", "B"],
    ["Ana Clara (exemplo)", "AC"],
    ["Paula", "P"],
  ])("%s ignora o que não começa por letra", (nome, esperado) => {
    expect(iniciaisDaConta(nome)).toBe(esperado);
    expect(iniciaisDaNota(nome)).toBe(esperado);
    expect(iniciaisDe(nome)).toBe(esperado);
  });

  it("acento conta como letra", () => {
    expect(iniciaisDaConta("Ícaro Ávila")).toBe("ÍÁ");
  });
});
