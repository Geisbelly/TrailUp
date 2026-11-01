import { describe, expect, it } from "vitest";
import {
  avaliarRisco,
  descricaoDosCriterios,
  diasDesde,
  faixaDoRisco,
  notaParaRisco,
  observacaoNotaEAbandono,
  type SinaisDoBanco,
} from "./risco";

const hoje = new Date("2026-10-31T15:00:00Z");
const turma = { notaMedia: 7.4 };
const nada: SinaisDoBanco = {
  semDado: false,
  ultimaAtividadeEm: "2026-10-30T12:00:00Z",
  inativoDesde: null,
  evadidoDesde: null,
  estagnadoDesde: null,
  estagnadoTopico: null,
  riscoFaixa: "normal",
  riscoOrigem: "modelo",
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

  it("faixa alta do modelo do core é crítico, com a taxa da turma", () => {
    const r = avaliarRisco({ sinais: { ...nada, riscoFaixa: "alto" }, nota: null }, { notaMedia: 7.4, taxaAbandonoPct: 12.5 }, hoje);
    expect(r).toEqual({
      nivel: "critico",
      fatores: [{ criterio: "abandono", motivo: "Risco alto de abandono", comparacao: "turma: 12.5% em risco alto" }],
    });
  });

  it("faixa vinda da inatividade é crítico sem repetir o fato como 'risco de abandono'", () => {
    const desde = "2026-09-30T12:00:00Z";
    const r = avaliarRisco(
      { sinais: { ...nada, riscoFaixa: "alto", riscoOrigem: "inatividade", inativoDesde: desde, evadidoDesde: desde }, nota: null },
      turma,
      hoje,
    );
    expect(r?.nivel).toBe("critico");
    expect(r?.fatores.map((f) => f.criterio)).toEqual(["evasao"]);
  });

  it("faixa atenção do modelo é atenção; normal não é sinal", () => {
    expect(avaliarRisco({ sinais: { ...nada, riscoFaixa: "atencao" }, nota: null }, turma, hoje)?.nivel).toBe("atencao");
    expect(avaliarRisco({ sinais: { ...nada, riscoFaixa: "normal" }, nota: null }, turma, hoje)).toBeNull();
  });

  it("crítico vem só do modelo: fatos juntos continuam atenção", () => {
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
  it("só NULL é 'sem nota'; 0 é zero, com ou sem progresso (a nota é do banco, 20261101_10)", () => {
    expect(notaParaRisco(0)).toBe(0);
    expect(notaParaRisco(null)).toBeNull();
    expect(notaParaRisco(4.2)).toBe(4.2);
  });
});

describe("faixaDoRisco e observacaoNotaEAbandono", () => {
  it("'sem dados' e valor desconhecido viram null, não 'normal'", () => {
    expect(faixaDoRisco("alto")).toBe("alto");
    expect(faixaDoRisco("sem dados")).toBeNull();
    expect(faixaDoRisco(undefined)).toBeNull();
  });

  it("compara quem está abaixo de 5.0 com a taxa da turma", () => {
    const alunos = [
      { nota: 4, riscoFaixa: "alto" as const },
      { nota: 4.8, riscoFaixa: "normal" as const },
      { nota: 8, riscoFaixa: "alto" as const },
      { nota: 3, riscoFaixa: null },
    ];
    expect(observacaoNotaEAbandono(alunos, 18.5)).toBe("2 alunos com nota abaixo de 5.0: 50% em risco alto de abandono (turma: 18.5%).");
  });

  it("sem ninguém abaixo com dado, ou sem taxa da turma, não há frase", () => {
    expect(observacaoNotaEAbandono([{ nota: 8, riscoFaixa: "alto" }], 18.5)).toBeNull();
    expect(observacaoNotaEAbandono([{ nota: 4, riscoFaixa: "alto" }], null)).toBeNull();
  });
});
