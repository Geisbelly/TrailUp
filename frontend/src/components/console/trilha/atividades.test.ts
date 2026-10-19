import { describe, expect, it } from "vitest";
import { prazoDaAtividade, rotuloDoTipoDeAtividade } from "./atividades";

describe("rotuloDoTipoDeAtividade", () => {
  it("traduz os tipos conhecidos", () => {
    expect(rotuloDoTipoDeAtividade("quiz")).toBe("Múltipla escolha");
    expect(rotuloDoTipoDeAtividade("essay")).toBe("Dissertação");
  });
  it("missão tem rótulo próprio", () => {
    expect(rotuloDoTipoDeAtividade("missao")).toBe("Missão");
  });
  it("tipos legados continuam legíveis", () => {
    expect(rotuloDoTipoDeAtividade("questao")).toBe("Múltipla escolha");
    expect(rotuloDoTipoDeAtividade("video")).toBe("Vídeo");
  });
  it("desconhecido ou vazio vira 'Atividade'", () => {
    expect(rotuloDoTipoDeAtividade("xyz")).toBe("Atividade");
    expect(rotuloDoTipoDeAtividade(null)).toBe("Atividade");
  });
});

describe("prazoDaAtividade", () => {
  it("formata a data", () => expect(prazoDaAtividade("2026-10-12T15:00:00")).toBe("entrega 12/10/2026"));
  it("sem prazo ou inválido é null", () => {
    expect(prazoDaAtividade(null)).toBeNull();
    expect(prazoDaAtividade("x")).toBeNull();
  });
});
