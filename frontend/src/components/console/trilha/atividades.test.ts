import { describe, expect, it } from "vitest";
import {
  prazoDaAtividade,
  rotuloDasTentativas,
  rotuloDoTipoDeAtividade,
  tentativasDoFormulario,
  tentativasParaFormulario,
} from "./atividades";

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

describe("tentativasDoFormulario", () => {
  it("vazio é ilimitado", () => {
    expect(tentativasDoFormulario("")).toEqual({ valido: true, valor: null });
    expect(tentativasDoFormulario("  ")).toEqual({ valido: true, valor: null });
    expect(tentativasDoFormulario(undefined)).toEqual({ valido: true, valor: null });
  });
  it("inteiro positivo vira número", () => {
    expect(tentativasDoFormulario("3")).toEqual({ valido: true, valor: 3 });
    expect(tentativasDoFormulario(" 1 ")).toEqual({ valido: true, valor: 1 });
  });
  it("zero não é ilimitado: é inválido (o banco recusaria)", () => {
    expect(tentativasDoFormulario("0").valido).toBe(false);
  });
  it("fração, negativo, texto e exagero são inválidos", () => {
    for (const t of ["2.5", "2,5", "-1", "abc", "100"]) expect(tentativasDoFormulario(t).valido).toBe(false);
  });
  it("ida e volta pelo formulário", () => {
    expect(tentativasParaFormulario(null)).toBe("");
    expect(tentativasDoFormulario(tentativasParaFormulario(4)).valor).toBe(4);
  });
});

describe("rotuloDasTentativas", () => {
  it("singular, plural e ilimitado", () => {
    expect(rotuloDasTentativas(1)).toBe("1 tentativa");
    expect(rotuloDasTentativas(3)).toBe("3 tentativas");
    expect(rotuloDasTentativas(null)).toBe("tentativas ilimitadas");
    expect(rotuloDasTentativas(undefined)).toBe("tentativas ilimitadas");
  });
});
