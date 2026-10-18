import { describe, expect, it } from "vitest";

import { prazoParaBanco, prazoParaFormulario } from "./prazoDaAtividade";

describe("prazoParaBanco", () => {
  it("grava o FIM do dia escolhido, no fuso local", () => {
    const iso = prazoParaBanco("2026-09-20")!;
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });

  it("o dia local gravado é o dia escolhido — não o anterior", () => {
    // O defeito original: '2026-09-20' crua virava 2026-09-19 21:00 em Brasília.
    for (const data of ["2026-01-01", "2026-09-20", "2026-12-31"]) {
      expect(prazoParaFormulario(prazoParaBanco(data))).toBe(data);
    }
  });

  it("vazio e nulo viram null, não a data de hoje", () => {
    expect(prazoParaBanco("")).toBeNull();
    expect(prazoParaBanco(null)).toBeNull();
    expect(prazoParaBanco(undefined)).toBeNull();
    expect(prazoParaBanco("   ")).toBeNull();
  });

  it("formato inesperado vira null em vez de data silenciosamente errada", () => {
    expect(prazoParaBanco("20/09/2026")).toBeNull();
    expect(prazoParaBanco("2026-9-2")).toBeNull();
    expect(prazoParaBanco("amanhã")).toBeNull();
  });

  it("data impossível vira null, não rola para o mês seguinte", () => {
    // `new Date(2026, 1, 31)` vira 03/03 no JS. Gravar isso seria um prazo que
    // o professor nunca escolheu.
    expect(prazoParaBanco("2026-02-31")).toBeNull();
    expect(prazoParaBanco("2026-13-01")).toBeNull();
    expect(prazoParaBanco("2026-04-31")).toBeNull();
  });

  it("aceita ano bissexto de verdade", () => {
    expect(prazoParaBanco("2028-02-29")).not.toBeNull();
    expect(prazoParaBanco("2026-02-29")).toBeNull();
  });
});

describe("prazoParaFormulario", () => {
  it("devolve AAAA-MM-DD, que é o que o input aceita", () => {
    expect(prazoParaFormulario("2026-09-20T23:59:59.999Z")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("nulo e vazio viram string vazia — o input não aceita null", () => {
    expect(prazoParaFormulario(null)).toBe("");
    expect(prazoParaFormulario("")).toBe("");
    expect(prazoParaFormulario(undefined)).toBe("");
  });

  it("valor inválido vira vazio em vez de 'Invalid Date'", () => {
    expect(prazoParaFormulario("nao é data")).toBe("");
  });

  it("ida e volta é estável: editar duas vezes não desloca o dia", () => {
    // O efeito colateral que a issue descreve: reabrir mostrava vazio e salvar
    // gravava null, apagando o prazo. Agora tem de sobreviver a N edições.
    let atual = prazoParaBanco("2026-09-20");
    for (let i = 0; i < 5; i += 1) {
      const noForm = prazoParaFormulario(atual);
      expect(noForm).toBe("2026-09-20");
      atual = prazoParaBanco(noForm);
    }
  });
});
