import { describe, expect, it } from "vitest";
import { aproveitamento, ordenarRanking, posicoes, rotuloDoDesfecho, tituloDoDuelo, type LinhaDoRanking } from "./batalha";

const g = (nome: string, vitorias: number, empates: number, duelos: number): LinhaDoRanking => ({ guildaId: nome, nome, vitorias, empates, duelos });

describe("aproveitamento", () => {
  it("empate vale meia vitória; sem duelo dá 0", () => {
    expect(aproveitamento(g("A", 3, 0, 4))).toBe(75);
    expect(aproveitamento(g("A", 1, 2, 4))).toBe(50);
    expect(aproveitamento(g("A", 0, 0, 0))).toBe(0);
  });
});

describe("ordenarRanking / posicoes", () => {
  it("vitórias, empates, menos duelos e nome", () => {
    const r = ordenarRanking([g("Lobos", 2, 0, 4), g("Águias", 3, 0, 3), g("Corvos", 2, 1, 4), g("Bravos", 2, 0, 2)]);
    expect(r.map((x) => x.nome)).toEqual(["Águias", "Corvos", "Bravos", "Lobos"]);
  });

  it("empate total divide a posição e o seguinte pula", () => {
    const p = posicoes([g("A", 3, 0, 4), g("B", 3, 0, 4), g("C", 1, 0, 2)]);
    expect(p.map((x) => [x.linha.nome, x.posicao])).toEqual([["A", 1], ["B", 1], ["C", 3]]);
  });

  it("não altera a entrada", () => {
    const e = [g("B", 1, 0, 1), g("A", 2, 0, 2)];
    ordenarRanking(e);
    expect(e[0].nome).toBe("B");
  });
});

describe("rótulos do duelo", () => {
  const base = { status: "encerrado" as const, resultado: null, vencedorEquipe: null, guildaNome: "Lobos", rivalNome: "Corvos" };
  it("desfecho", () => {
    expect(rotuloDoDesfecho({ ...base, status: "aberto" })).toBe("Em andamento");
    expect(rotuloDoDesfecho({ ...base, resultado: "empate" })).toBe("Empate");
    expect(rotuloDoDesfecho({ ...base, resultado: "sem_adversario" })).toBe("Sem adversário");
    expect(rotuloDoDesfecho({ ...base, resultado: "vitoria", vencedorEquipe: 1 })).toBe("Vitória de Lobos");
    expect(rotuloDoDesfecho({ ...base, resultado: "vitoria", vencedorEquipe: 2 })).toBe("Vitória de Corvos");
    expect(rotuloDoDesfecho({ ...base, resultado: "vitoria", rivalNome: null })).toBe("Desafio cumprido");
    expect(rotuloDoDesfecho(base)).toBe("Encerrado");
  });

  it("título cai em guildas ou formato quando vazio", () => {
    expect(tituloDoDuelo({ titulo: " Revisão ", formato: "guilda", guildaNome: "A", rivalNome: "B" })).toBe("Revisão");
    expect(tituloDoDuelo({ titulo: "", formato: "guilda", guildaNome: "A", rivalNome: "B" })).toBe("A × B");
    expect(tituloDoDuelo({ titulo: "", formato: "guilda", guildaNome: "A", rivalNome: null })).toBe("Desafio de A");
    expect(tituloDoDuelo({ titulo: "", formato: "dupla", guildaNome: null, rivalNome: null })).toBe("Duelo em dupla");
  });
});
