import { describe, expect, it } from "vitest";

import {
  formatarPrazo,
  prazoParaFormulario,
  prazoParaGravar,
} from "./prazoDaAtividade";

describe("prazoParaGravar", () => {
  it("grava o FIM do dia escolhido, nao a meia-noite", () => {
    // Este e o defeito que a funcao existe para corrigir. Gravar
    // `'2026-09-20'` cru num timestamptz faz o Postgres ler meia-noite UTC, o
    // que em Brasilia e 21h do dia 19 -- o prazo vencia antes de o dia comecar.
    const iso = prazoParaGravar("2026-09-20");
    expect(iso).not.toBeNull();

    const quando = new Date(iso as string);
    expect(quando.getFullYear()).toBe(2026);
    expect(quando.getMonth()).toBe(8); // setembro
    expect(quando.getDate()).toBe(20);
    expect(quando.getHours()).toBe(23);
    expect(quando.getMinutes()).toBe(59);
  });

  it("o instante gravado cai depois de qualquer hora do dia escolhido", () => {
    // A propriedade que importa: nenhuma hora do dia 20 pode estar atrasada.
    const iso = prazoParaGravar("2026-09-20") as string;
    const prazo = new Date(iso).getTime();

    for (const hora of [0, 6, 12, 18, 23]) {
      const durante = new Date(2026, 8, 20, hora, 0, 0).getTime();
      expect(durante).toBeLessThan(prazo);
    }

    const diaSeguinte = new Date(2026, 8, 21, 0, 0, 0).getTime();
    expect(diaSeguinte).toBeGreaterThan(prazo);
  });

  it("prazo e opcional: vazio devolve null", () => {
    expect(prazoParaGravar("")).toBeNull();
    expect(prazoParaGravar("   ")).toBeNull();
    expect(prazoParaGravar(null)).toBeNull();
    expect(prazoParaGravar(undefined)).toBeNull();
  });

  it("recusa o que nao e data em vez de mandar lixo para o timestamptz", () => {
    expect(prazoParaGravar("20/09/2026")).toBeNull();
    expect(prazoParaGravar("2026-9-20")).toBeNull();
    expect(prazoParaGravar("amanha")).toBeNull();
  });

  it("recusa data que nao existe, em vez de rolar para o mes seguinte", () => {
    // `new Date(2026, 1, 31)` nao estoura: vira 3 de marco. Sem conferir o dia
    // de volta, o professor marcaria 31/02 e o prazo apareceria em marco.
    expect(prazoParaGravar("2026-02-31")).toBeNull();
    expect(prazoParaGravar("2026-13-01")).toBeNull();
  });

  it("aceita 29 de fevereiro em ano bissexto", () => {
    expect(prazoParaGravar("2028-02-29")).not.toBeNull();
    expect(prazoParaGravar("2026-02-29")).toBeNull();
  });
});

describe("prazoParaFormulario", () => {
  it("volta para AAAA-MM-DD no fuso local", () => {
    const iso = prazoParaGravar("2026-09-20") as string;
    expect(prazoParaFormulario(iso)).toBe("2026-09-20");
  });

  it("ida e volta nao muda o dia", () => {
    // Sem isto, editar uma atividade com prazo mostrava campo vazio e salvar
    // de novo APAGAVA o prazo, sem o professor perceber.
    for (const dia of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      const iso = prazoParaGravar(dia) as string;
      expect(prazoParaFormulario(iso)).toBe(dia);
    }
  });

  it("sem prazo devolve string vazia, que e o que o input espera", () => {
    expect(prazoParaFormulario(null)).toBe("");
    expect(prazoParaFormulario("")).toBe("");
    expect(prazoParaFormulario("nao e data")).toBe("");
  });
});

describe("formatarPrazo", () => {
  it("mostra no formato brasileiro", () => {
    const iso = prazoParaGravar("2026-09-20") as string;
    expect(formatarPrazo(iso)).toBe("20/09/2026");
  });

  it("diz que nao ha prazo em vez de mostrar vazio", () => {
    expect(formatarPrazo(null)).toBe("sem prazo");
  });
});
