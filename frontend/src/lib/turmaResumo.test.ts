import { describe, it, expect } from "vitest";
import { computeTurmaResumo, type TurmaResumoRow } from "./turmaResumo";

function row(overrides: Partial<TurmaResumoRow>): TurmaResumoRow {
  return {
    total_alunos: 1,
    taxa_media_abandono_pct: 0,
    taxa_media_conclusao_pct: 0,
    media_nota_turma: 0,
    taxa_media_acertos_pct: 0,
    tempo_medio_uso_seg: 0,
    uso_chat_apos_erro_pct: 0,
    ...overrides,
  };
}

describe("computeTurmaResumo", () => {
  it("pondera pelo numero de alunos, não faz média simples por classe", () => {
    const rows = [
      row({ total_alunos: 50, taxa_media_abandono_pct: 10 }),
      row({ total_alunos: 5, taxa_media_abandono_pct: 90 }),
    ];

    const resumo = computeTurmaResumo(rows);

    // Ponderado: (50*10 + 5*90) / 55 = (500 + 450) / 55 ≈ 17.27
    expect(resumo.taxa_media_abandono_pct).toBeCloseTo(17.27, 1);
    // Média simples (o bug antigo) daria 50 — bem diferente do ponderado.
    expect(resumo.taxa_media_abandono_pct).not.toBeCloseTo(50, 0);
  });

  it("pondera todas as métricas pelo mesmo peso (total_alunos)", () => {
    const rows = [
      row({ total_alunos: 3, taxa_media_conclusao_pct: 60, media_nota_turma: 6 }),
      row({ total_alunos: 1, taxa_media_conclusao_pct: 20, media_nota_turma: 2 }),
    ];

    const resumo = computeTurmaResumo(rows);

    expect(resumo.taxa_media_conclusao_pct).toBeCloseTo((3 * 60 + 1 * 20) / 4, 5);
    expect(resumo.media_nota_turma).toBeCloseTo((3 * 6 + 1 * 2) / 4, 5);
  });

  it("cai para média simples quando total_alunos soma zero (evita divisão por zero)", () => {
    const rows = [
      row({ total_alunos: 0, taxa_media_abandono_pct: 40 }),
      row({ total_alunos: 0, taxa_media_abandono_pct: 60 }),
    ];

    const resumo = computeTurmaResumo(rows);

    expect(resumo.taxa_media_abandono_pct).toBeCloseTo(50, 5);
  });

  it("retorna zeros quando não há turmas no escopo", () => {
    const resumo = computeTurmaResumo([]);

    expect(resumo.taxa_media_abandono_pct).toBe(0);
    expect(resumo.taxa_media_conclusao_pct).toBe(0);
    expect(resumo.media_nota_turma).toBe(0);
    expect(resumo.taxa_media_acertos_pct).toBe(0);
    expect(resumo.tempo_medio_uso_seg).toBe(0);
    expect(resumo.uso_chat_apos_erro_pct).toBe(0);
  });
});
