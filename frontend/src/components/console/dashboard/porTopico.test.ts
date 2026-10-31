import { describe, expect, it } from "vitest";
import { lerPorTopico, periodoDaJanela } from "./porTopico";

const hoje = new Date("2026-10-31T15:00:00Z");

describe("periodoDaJanela", () => {
  it("7 e 30 dias contam hoje", () => {
    expect(periodoDaJanela("7d", hoje)).toEqual({ inicio: "2026-10-25", fim: "2026-10-31" });
    expect(periodoDaJanela("30d", hoje)).toEqual({ inicio: "2026-10-02", fim: "2026-10-31" });
  });

  it("mês atual começa no dia 1", () => {
    expect(periodoDaJanela("mes_atual", hoje)).toEqual({ inicio: "2026-10-01", fim: "2026-10-31" });
  });

  it("'tudo' cabe no limite de 366 dias da RPC", () => {
    const { inicio, fim } = periodoDaJanela("tudo", hoje);
    const dias = (Date.parse(fim) - Date.parse(inicio)) / 86_400_000;
    expect(dias).toBeLessThanOrEqual(366);
  });
});

describe("lerPorTopico", () => {
  it("lê a lista da versão 2", () => {
    const r = lerPorTopico({ versao: 2, por_topico: { topicos: [{ topico_id: 10, estagnados: 1 }] } });
    expect(r).toEqual([{ topico_id: 10, estagnados: 1 }]);
  });

  it("versão 1 (sem por_topico) ou resposta estranha: null, não lista inventada", () => {
    expect(lerPorTopico({ versao: 1 })).toBeNull();
    expect(lerPorTopico(null)).toBeNull();
    expect(lerPorTopico("x")).toBeNull();
  });
});
