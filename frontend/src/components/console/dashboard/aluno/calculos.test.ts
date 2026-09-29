import { describe, expect, it } from "vitest";
import { consumoTotal, itemConcluido, montarSerieEvolucao } from "./calculos";
import type { EvolucaoAluno } from "./tipos";

describe("consumoTotal", () => {
  it("percentual de itens concluídos sobre os registrados", () => {
    const r = consumoTotal([
      { status: "concluido", percentual_concluido: 100 },
      { status: "em andamento", percentual_concluido: 40 },
      { status: "Concluído", percentual_concluido: 90 },
      { status: "nao iniciado", percentual_concluido: 0 },
    ]);
    expect(r).toEqual({ concluidos: 2, total: 4, percentual: 50 });
  });

  it("sem itens não inventa zero", () => {
    expect(consumoTotal([])).toEqual({ concluidos: 0, total: 0, percentual: null });
  });
});

describe("itemConcluido", () => {
  it("vale pelo status ou pelo percentual 100", () => {
    expect(itemConcluido({ status: "concluido", percentual_concluido: 0 })).toBe(true);
    expect(itemConcluido({ status: "em andamento", percentual_concluido: 100 })).toBe(true);
    expect(itemConcluido({ status: "em andamento", percentual_concluido: 99 })).toBe(false);
  });
});

describe("montarSerieEvolucao", () => {
  const linha = (aluno_id: string, dia: string, nota: number, extra: Partial<EvolucaoAluno> = {}): EvolucaoAluno => ({
    classe_id: 1,
    aluno_id,
    dia,
    nota_media_desempenho: nota,
    taxa_acertos_pct: 60,
    taxa_acertos_sem_erro_pct: 0,
    eficiencia_aprendizagem: 0,
    progresso_trilha_pct: 30,
    ...extra,
  });

  it("média da turma por dia e dias só da turma sem inventar valor do aluno", () => {
    const serie = montarSerieEvolucao(
      [linha("a", "2026-09-02", 8)],
      [linha("a", "2026-09-02", 8), linha("b", "2026-09-02", 6), linha("b", "2026-09-01T00:00:00", 5)],
    );
    expect(serie.map((p) => p.dia)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(serie[0]).toMatchObject({ nota: null, acertos: null, progresso: null, notaTurma: 5 });
    expect(serie[1]).toMatchObject({ nota: 8, acertos: 60, progresso: 30, notaTurma: 7 });
    expect(serie[1].rotulo).toBe("02/09");
  });
});
