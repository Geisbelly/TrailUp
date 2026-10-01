import { describe, expect, it } from "vitest";
import { avaliarRisco, descricaoDosCriterios, faixaDoAbandono, inatividade, notaParaRisco, observacaoNotaEAbandono } from "./risco";

const turma = { abandonoMedioPct: 18.5, notaMedia: 7.4 };
const hoje = new Date("2026-09-29T15:00:00Z");

describe("avaliarRisco", () => {
  it("sem sinal nenhum não entra na lista", () => {
    expect(avaliarRisco({ abandonoPct: 12, nota: 8, inatividade: { dias: 2, peloMenos: false } }, turma)).toBeNull();
  });

  it("abandono acima de 30% é crítico sozinho", () => {
    const r = avaliarRisco({ abandonoPct: 38, nota: 7, inatividade: null }, turma);
    expect(r?.nivel).toBe("critico");
    expect(r?.fatores).toEqual([{ criterio: "abandono", motivo: "Abandono em 38%", comparacao: "turma: 18.5%" }]);
  });

  it("exatamente 30% não dispara (o critério é acima de 30%)", () => {
    expect(avaliarRisco({ abandonoPct: 30, nota: null, inatividade: null }, turma)).toBeNull();
  });

  it("nota abaixo de 5.0 sozinha é atenção", () => {
    const r = avaliarRisco({ abandonoPct: null, nota: 4.6, inatividade: null }, turma);
    expect(r).toEqual({ nivel: "atencao", fatores: [{ criterio: "nota", motivo: "Nota 4.6, abaixo de 5.0", comparacao: "turma: 7.4" }] });
  });

  it("7 dias sem atividade é atenção; com outro sinal junto vira crítico", () => {
    expect(avaliarRisco({ abandonoPct: null, nota: null, inatividade: { dias: 7, peloMenos: false } }, turma)?.nivel).toBe("atencao");
    expect(avaliarRisco({ abandonoPct: null, nota: null, inatividade: { dias: 6, peloMenos: false } }, turma)).toBeNull();
    expect(avaliarRisco({ abandonoPct: null, nota: 4, inatividade: { dias: 9, peloMenos: false } }, turma)?.nivel).toBe("critico");
  });

  it("inatividade maior que a janela aparece como 'mais de'", () => {
    const r = avaliarRisco({ abandonoPct: null, nota: null, inatividade: { dias: 60, peloMenos: true } }, turma);
    expect(r?.fatores[0].motivo).toBe("Mais de 60 dias sem atividade na turma");
  });

  it("sem média da turma, não inventa comparação", () => {
    const r = avaliarRisco({ abandonoPct: 40, nota: null, inatividade: null }, { abandonoMedioPct: null, notaMedia: null });
    expect(r?.fatores[0].comparacao).toBeNull();
  });
});

describe("inatividade", () => {
  it("conta da última sessão", () => {
    expect(inatividade("2026-09-20", "2026-03-01T10:00:00Z", hoje)).toEqual({ dias: 9, peloMenos: false });
  });

  it("sem sessão, conta da matrícula", () => {
    expect(inatividade(null, "2026-09-25T10:00:00Z", hoje)).toEqual({ dias: 4, peloMenos: false });
  });

  it("sem sessão e matrícula mais antiga que a janela: pelo menos 60", () => {
    expect(inatividade(null, "2026-03-04T10:00:00Z", hoje)).toEqual({ dias: 60, peloMenos: true });
  });

  it("sem sessão e sem matrícula: sem referência", () => {
    expect(inatividade(null, null, hoje)).toBeNull();
  });
});

describe("observacaoNotaEAbandono", () => {
  it("compara o abandono médio de quem está abaixo de 5.0 com o da turma", () => {
    const alunos = [
      { nota: 4, abandonoPct: 40 },
      { nota: 4.8, abandonoPct: 30 },
      { nota: 8, abandonoPct: 10 },
      { nota: 3, abandonoPct: null },
    ];
    expect(observacaoNotaEAbandono(alunos, 18.5)).toBe("2 alunos com nota abaixo de 5.0 têm abandono médio de 35% (turma: 18.5%).");
  });

  it("sem ninguém abaixo, ou sem média da turma, não há frase", () => {
    expect(observacaoNotaEAbandono([{ nota: 8, abandonoPct: 10 }], 18.5)).toBeNull();
    expect(observacaoNotaEAbandono([{ nota: 4, abandonoPct: 40 }], null)).toBeNull();
  });
});

describe("notaParaRisco", () => {
  it("0 sem progresso nenhum é 'sem nota'; 0 com progresso é nota de verdade", () => {
    expect(notaParaRisco(0, 0)).toBeNull();
    expect(notaParaRisco(0, 20)).toBe(0);
    expect(notaParaRisco(null, 50)).toBeNull();
    expect(notaParaRisco(4.2, 0)).toBe(4.2);
  });
});

describe("descricaoDosCriterios e faixaDoAbandono", () => {
  it("lista só os critérios ligados", () => {
    expect(descricaoDosCriterios(["abandono", "nota", "inatividade"])).toBe(
      "Critério: abandono acima de 30%, nota abaixo de 5.0 ou 7 dias sem atividade na turma",
    );
    expect(descricaoDosCriterios(["nota"])).toBe("Critério: nota abaixo de 5.0");
  });

  it("faixas: até a meta de 15% saudável, até 30% atenção, acima crítico", () => {
    expect([11, 15, 15.1, 30, 30.1].map(faixaDoAbandono)).toEqual(["saudavel", "saudavel", "atencao", "atencao", "critico"]);
  });
});
