import { describe, expect, it } from "vitest";
import { diasAguardando, resumoProfessor, rotuloEspera } from "./aprovacoes";

describe("diasAguardando", () => {
  const agora = new Date(2026, 8, 5, 10, 0);
  it("conta dias de calendário", () => expect(diasAguardando(new Date(2026, 8, 2, 23, 0).toISOString(), agora)).toBe(3));
  it("mesmo dia é zero", () => expect(diasAguardando(new Date(2026, 8, 5, 1, 0).toISOString(), agora)).toBe(0));
  it("data futura ou inválida não fica negativa", () => {
    expect(diasAguardando(new Date(2026, 9, 1).toISOString(), agora)).toBe(0);
    expect(diasAguardando("x", agora)).toBe(0);
  });
});

describe("rotuloEspera", () => {
  it("singular, plural e hoje", () => {
    expect(rotuloEspera(0)).toBe("aguardando desde hoje");
    expect(rotuloEspera(1)).toBe("aguardando 1 dia");
    expect(rotuloEspera(8)).toBe("aguardando 8 dias");
  });
});

describe("resumoProfessor", () => {
  it("junta e omite vazios", () => {
    expect(resumoProfessor("ULBRA", "Física")).toBe("ULBRA · Física");
    expect(resumoProfessor(" ", "Física")).toBe("Física");
    expect(resumoProfessor(null, null)).toBe("Instituição não informada");
  });
});
