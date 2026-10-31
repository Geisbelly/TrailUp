import { describe, it, expect } from "vitest";
import { computeTurmaResumo, type TurmaResumoRow } from "./turmaResumo";

function row(overrides: Partial<TurmaResumoRow>): TurmaResumoRow {
  return {
    total_alunos: 1,
    taxa_media_conclusao_pct: 0,
    media_nota_turma: 0,
    taxa_media_acertos_pct: 0,
    tempo_ativo_medio_seg: 0,
    uso_chat_apos_erro_pct: 0,
    retorno_semanal_pct: null,
    retorno_semanal_elegiveis: 0,
    alunos_inativos: 0,
    alunos_estagnados: 0,
    alunos_evadidos: 0,
    alunos_sem_dado: 0,
    ...overrides,
  };
}

describe("computeTurmaResumo", () => {
  it("pondera pelo numero de alunos, não faz média simples por classe", () => {
    const resumo = computeTurmaResumo([
      row({ total_alunos: 50, taxa_media_conclusao_pct: 10 }),
      row({ total_alunos: 5, taxa_media_conclusao_pct: 90 }),
    ]);
    expect(resumo.taxa_media_conclusao_pct).toBeCloseTo(17.27, 1);
  });

  it("retorno semanal pondera pelas semanas elegíveis, não pelos alunos", () => {
    const resumo = computeTurmaResumo([
      row({ total_alunos: 50, retorno_semanal_pct: 50, retorno_semanal_elegiveis: 2 }),
      row({ total_alunos: 5, retorno_semanal_pct: 100, retorno_semanal_elegiveis: 8 }),
    ]);
    expect(resumo.retorno_semanal_pct).toBeCloseTo(90, 5);
    expect(resumo.retorno_semanal_elegiveis).toBe(10);
  });

  it("contagens somam", () => {
    const resumo = computeTurmaResumo([
      row({ total_alunos: 10, alunos_inativos: 2, alunos_estagnados: 1, alunos_evadidos: 1, alunos_sem_dado: 3 }),
      row({ total_alunos: 5, alunos_inativos: 1 }),
    ]);
    expect(resumo).toMatchObject({ total_alunos: 15, alunos_inativos: 3, alunos_estagnados: 1, alunos_evadidos: 1, alunos_sem_dado: 3 });
  });

  it("sem dado continua sem dado: linha null não entra, e nenhuma linha com dado dá null", () => {
    const resumo = computeTurmaResumo([
      row({ total_alunos: 10, tempo_ativo_medio_seg: null }),
      row({ total_alunos: 5, tempo_ativo_medio_seg: 600 }),
    ]);
    expect(resumo.tempo_ativo_medio_seg).toBe(600);
    expect(computeTurmaResumo([row({ tempo_ativo_medio_seg: null })]).tempo_ativo_medio_seg).toBeNull();
    expect(computeTurmaResumo([]).retorno_semanal_pct).toBeNull();
  });

  it("sem alunos para ponderar, cai para média simples", () => {
    const resumo = computeTurmaResumo([
      row({ total_alunos: 0, taxa_media_conclusao_pct: 40 }),
      row({ total_alunos: 0, taxa_media_conclusao_pct: 60 }),
    ]);
    expect(resumo.taxa_media_conclusao_pct).toBeCloseTo(50, 5);
  });
});
