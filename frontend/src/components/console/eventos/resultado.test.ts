import { describe, expect, it } from "vitest";
import { larguraDaBarra, ordenarResultado, resumirResultado, rotuloDaPosicao, type LinhaDeResultado } from "./resultado";

const l = (nome: string, pontos: number, posicao: number | null, extra: Partial<LinhaDeResultado> = {}): LinhaDeResultado => ({
  alunoId: nome,
  nome,
  pontos,
  participou: posicao !== null,
  posicao,
  destaque: false,
  ...extra,
});

describe("ordenarResultado", () => {
  it("posição primeiro (empate por nome), não participantes por último", () => {
    const r = ordenarResultado([l("Zé", 0, null), l("Bia", 10, 2), l("Ana", 10, 2), l("Caio", 30, 1)]);
    expect(r.map((x) => x.nome)).toEqual(["Caio", "Ana", "Bia", "Zé"]);
  });

  it("não altera a lista de entrada", () => {
    const entrada = [l("B", 1, 2), l("A", 2, 1)];
    ordenarResultado(entrada);
    expect(entrada[0].nome).toBe("B");
  });
});

describe("resumirResultado", () => {
  it("participação, média e % acima da média só entre quem participou", () => {
    const r = resumirResultado([l("A", 30, 1, { destaque: true }), l("B", 10, 2), l("C", 20, 2), l("D", 0, null)]);
    expect(r).toMatchObject({ total: 4, participantes: 3, percentualParticipacao: 75, mediaDePontos: 20, percentualAcimaDaMedia: 33 });
    expect(r.destaques.map((x) => x.nome)).toEqual(["A"]);
  });

  it("turma vazia ou sem participante não divide por zero", () => {
    expect(resumirResultado([])).toMatchObject({ total: 0, percentualParticipacao: 0, mediaDePontos: 0, percentualAcimaDaMedia: 0 });
    expect(resumirResultado([l("A", 0, null)]).mediaDePontos).toBe(0);
  });
});

describe("larguraDaBarra / rotuloDaPosicao", () => {
  it("sem barra com poucos participantes ou máximo zero", () => {
    expect(larguraDaBarra(5, 10, 7)).toBeNull();
    expect(larguraDaBarra(5, 0, 20)).toBeNull();
    expect(larguraDaBarra(5, 10, 8)).toBe(50);
    expect(larguraDaBarra(50, 10, 20)).toBe(100);
  });

  it("rótulo da posição", () => {
    expect(rotuloDaPosicao(1, true)).toBe("1º");
    expect(rotuloDaPosicao(null, true)).toBe("—");
    expect(rotuloDaPosicao(null, false)).toBe("Não participou");
  });
});
