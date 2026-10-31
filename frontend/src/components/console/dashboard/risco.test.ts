import { describe, expect, it } from "vitest";
import { avaliarRisco, descricaoDosCriterios, diasDesde, notaParaRisco, type SinaisDoBanco } from "./risco";

const hoje = new Date("2026-10-31T15:00:00Z");
const turma = { notaMedia: 7.4 };
const nada: SinaisDoBanco = {
  semDado: false,
  ultimaAtividadeEm: "2026-10-30T12:00:00Z",
  inativoDesde: null,
  evadidoDesde: null,
  estagnadoDesde: null,
  estagnadoTopico: null,
};

describe("avaliarRisco", () => {
  it("aluno no meio da trilha, estudando, não tem sinal (era 'crítico' pela taxa antiga)", () => {
    expect(avaliarRisco({ sinais: nada, nota: 8 }, turma, hoje)).toBeNull();
  });

  it("inativo há 9 dias: um fator, com a data", () => {
    const r = avaliarRisco({ sinais: { ...nada, inativoDesde: "2026-10-22T12:00:00Z" }, nota: null }, turma, hoje);
    expect(r?.nivel).toBe("atencao");
    expect(r?.fatores).toHaveLength(1);
    expect(r?.fatores[0].criterio).toBe("inatividade");
    expect(r?.fatores[0].motivo).toBe("9 dias sem estudar");
    expect(r?.fatores[0].comparacao).toContain("última atividade em");
  });

  it("evadido há 31 dias: só a evasão aparece, não a inatividade junto", () => {
    const desde = "2026-09-30T12:00:00Z";
    const r = avaliarRisco({ sinais: { ...nada, inativoDesde: desde, evadidoDesde: desde }, nota: null }, turma, hoje);
    expect(r?.fatores.map((f) => f.criterio)).toEqual(["evasao"]);
    expect(r?.fatores[0].motivo).toBe("Sem estudar há 31 dias");
  });

  it("estagnado mostra o tópico e há quantos dias", () => {
    const r = avaliarRisco(
      { sinais: { ...nada, estagnadoDesde: "2026-10-16T12:00:00Z", estagnadoTopico: "Frações" }, nota: null },
      turma,
      hoje,
    );
    expect(r?.fatores[0]).toEqual({
      criterio: "estagnacao",
      motivo: "Parado em Frações há 15 dias",
      comparacao: "abaixo da mediana da turma nesse tópico",
    });
  });

  it("sem dado não é sinal, nem com datas preenchidas por engano", () => {
    expect(avaliarRisco({ sinais: { ...nada, semDado: true, inativoDesde: "2026-10-01" }, nota: null }, turma, hoje)).toBeNull();
    expect(avaliarRisco({ sinais: null, nota: null }, turma, hoje)).toBeNull();
  });

  it("dois sinais continuam 'atenção': nada vira crítico por soma", () => {
    const r = avaliarRisco({ sinais: { ...nada, inativoDesde: "2026-10-22T12:00:00Z" }, nota: 4 }, turma, hoje);
    expect(r?.nivel).toBe("atencao");
    expect(r?.fatores.map((f) => f.criterio)).toEqual(["inatividade", "nota"]);
  });

  it("nota abaixo de 5.0 sozinha continua sendo sinal, com a média da turma", () => {
    const r = avaliarRisco({ sinais: nada, nota: 4.6 }, turma, hoje);
    expect(r?.fatores).toEqual([{ criterio: "nota", motivo: "Nota 4.6, abaixo de 5.0", comparacao: "turma: 7.4" }]);
  });
});

describe("diasDesde e descricaoDosCriterios", () => {
  it("conta dias de calendário", () => {
    expect(diasDesde("2026-10-22T23:59:00Z", hoje)).toBe(9);
    expect(diasDesde("2026-11-02T00:00:00Z", hoje)).toBe(0);
  });

  it("descreve os critérios e diz que sem dado não conta", () => {
    expect(descricaoDosCriterios()).toContain("7 dias sem estudar");
    expect(descricaoDosCriterios()).toContain("Sem dado não conta");
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
