import { describe, expect, it } from "vitest";

import { prazoParaBanco, prazoParaFormulario,
  prazoBancoParaLocal,
  prazoLocalParaBanco,
} from "./prazoDaAtividade";

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

describe("datetime-local <-> timestamptz (o par que o editor usa)", () => {
  it("a hora escolhida é lida no fuso de quem escolheu, não em UTC", () => {
    // O defeito que sobrou da #177. Gravado cru, `2026-09-20T00:00` virava
    // `2026-09-20 00:00+00` — 19/09 21:00 em Brasília, o dia anterior.
    const iso = prazoLocalParaBanco("2026-09-20T00:00");
    expect(iso).not.toBeNull();
    const instante = new Date(iso as string);
    // O instante tem de ser a meia-noite LOCAL do dia 20, qualquer que seja o fuso do teste.
    expect(instante.getFullYear()).toBe(2026);
    expect(instante.getMonth()).toBe(8);
    expect(instante.getDate()).toBe(20);
    expect(instante.getHours()).toBe(0);
    expect(instante.getMinutes()).toBe(0);
  });

  it("ida e volta é estável: editar N vezes não desloca o dia nem a hora", () => {
    let atual = prazoLocalParaBanco("2026-09-20T23:30");
    for (let i = 0; i < 5; i += 1) {
      const noForm = prazoBancoParaLocal(atual);
      expect(noForm).toBe("2026-09-20T23:30");
      atual = prazoLocalParaBanco(noForm);
    }
  });

  it("aceita segundos e o separador com espaço, que é como o Postgres devolve", () => {
    expect(prazoLocalParaBanco("2026-09-20T23:30:45")).not.toBeNull();
    expect(prazoLocalParaBanco("2026-09-20 23:30")).not.toBeNull();
  });

  it("vazio vira null, e o null não apaga por acidente no formulário", () => {
    expect(prazoLocalParaBanco("")).toBeNull();
    expect(prazoLocalParaBanco(null)).toBeNull();
    expect(prazoLocalParaBanco("   ")).toBeNull();
    expect(prazoBancoParaLocal(null)).toBe("");
    expect(prazoBancoParaLocal("")).toBe("");
  });

  it("recusa data impossível em vez de deslocar para o mês seguinte", () => {
    // `new Date(2026, 1, 31)` é 03/03 no JS. Gravar isso seria um prazo que ninguém escolheu.
    expect(prazoLocalParaBanco("2026-02-31T10:00")).toBeNull();
    expect(prazoLocalParaBanco("2026-13-01T10:00")).toBeNull();
    expect(prazoLocalParaBanco("2026-09-20T25:00")).toBeNull();
    expect(prazoLocalParaBanco("sem data")).toBeNull();
  });

  it("instante inválido do banco não vira string quebrada no input", () => {
    expect(prazoBancoParaLocal("nao-e-data")).toBe("");
  });
});

describe("valor que já tem fuso passa adiante sem reinterpretar", () => {
  it("ISO em UTC sobrevive a N salvamentos sem deslocar", () => {
    // O caminho de edição carrega o valor do banco no formulário e grava de volta. Se os
    // dígitos fossem lidos como hora local, cada salvamento deslocaria o prazo pelo offset.
    const doBanco = "2026-09-20T23:30:00.000Z";
    let atual: string | null = doBanco;
    for (let i = 0; i < 5; i += 1) {
      atual = prazoLocalParaBanco(atual);
      expect(atual).toBe(doBanco);
    }
  });

  it("aceita offset explícito, com e sem dois-pontos", () => {
    expect(prazoLocalParaBanco("2026-09-20T23:30:00-03:00")).toBe("2026-09-21T02:30:00.000Z");
    expect(prazoLocalParaBanco("2026-09-20T23:30:00-0300")).toBe("2026-09-21T02:30:00.000Z");
  });

  it("e não confunde o valor SEM fuso com um que tem", () => {
    // `datetime-local` nunca traz fuso: este tem de ir pelo caminho da hora local.
    const local = prazoLocalParaBanco("2026-09-20T23:30");
    const instante = new Date(local as string);
    expect(instante.getHours()).toBe(23);
    expect(instante.getMinutes()).toBe(30);
    expect(instante.getDate()).toBe(20);
  });
});

