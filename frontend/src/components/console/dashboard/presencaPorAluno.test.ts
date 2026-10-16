import { describe, expect, it } from "vitest";

import { chavePresenca, somarPresencaPorAluno } from "./presencaPorAluno";

describe("somarPresencaPorAluno", () => {
  it("soma os topicos do mesmo aluno na mesma classe", () => {
    const mapa = somarPresencaPorAluno([
      { aluno_id: "a", classe_id: 1, tempo_total_seg: 600 },
      { aluno_id: "a", classe_id: 1, tempo_total_seg: 300 },
    ]);
    expect(mapa.get(chavePresenca(1, "a"))).toBe(15);
  });

  it("nao mistura alunos nem classes", () => {
    const mapa = somarPresencaPorAluno([
      { aluno_id: "a", classe_id: 1, tempo_total_seg: 60 },
      { aluno_id: "b", classe_id: 1, tempo_total_seg: 120 },
      { aluno_id: "a", classe_id: 2, tempo_total_seg: 180 },
    ]);
    expect(mapa.get(chavePresenca(1, "a"))).toBe(1);
    expect(mapa.get(chavePresenca(1, "b"))).toBe(2);
    expect(mapa.get(chavePresenca(2, "a"))).toBe(3);
  });

  it("aluno sem telemetria fica AUSENTE, nao zero", () => {
    // A tela distingue os dois: ausente mostra vazio, zero diria "abriu e saiu
    // na hora" — afirmacao diferente, e falsa.
    const mapa = somarPresencaPorAluno([{ aluno_id: "a", classe_id: 1, tempo_total_seg: 60 }]);
    expect(mapa.has(chavePresenca(1, "b"))).toBe(false);
    expect(mapa.get(chavePresenca(1, "b"))).toBeUndefined();
  });

  it("zero de verdade e preservado", () => {
    const mapa = somarPresencaPorAluno([{ aluno_id: "a", classe_id: 1, tempo_total_seg: 0 }]);
    expect(mapa.get(chavePresenca(1, "a"))).toBe(0);
  });

  it("ignora linha sem aluno ou sem classe", () => {
    const mapa = somarPresencaPorAluno([
      { aluno_id: null, classe_id: 1, tempo_total_seg: 600 },
      { aluno_id: "a", classe_id: null, tempo_total_seg: 600 },
    ]);
    expect(mapa.size).toBe(0);
  });

  it("ignora valor negativo ou nao numerico em vez de subtrair", () => {
    const mapa = somarPresencaPorAluno([
      { aluno_id: "a", classe_id: 1, tempo_total_seg: 120 },
      { aluno_id: "a", classe_id: 1, tempo_total_seg: -600 },
      { aluno_id: "a", classe_id: 1, tempo_total_seg: Number.NaN },
    ]);
    expect(mapa.get(chavePresenca(1, "a"))).toBe(2);
  });

  it("nulo conta como zero, nao derruba a soma", () => {
    const mapa = somarPresencaPorAluno([
      { aluno_id: "a", classe_id: 1, tempo_total_seg: null },
      { aluno_id: "a", classe_id: 1, tempo_total_seg: 60 },
    ]);
    expect(mapa.get(chavePresenca(1, "a"))).toBe(1);
  });

  it("lista vazia devolve mapa vazio", () => {
    expect(somarPresencaPorAluno([]).size).toBe(0);
  });
});
