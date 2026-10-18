import { describe, expect, it } from "vitest";
import { caminhoDaTrilha, formatarConclusao, resumirTurmas, rotuloDeAlunos, siglaDaTurma, situacaoDaTurma } from "./resumo";

describe("siglaDaTurma", () => {
  it("nomes como os professores escrevem", () => {
    expect(siglaDaTurma("SPD - 3N 2026/2")).toBe("SPD");
    expect(siglaDaTurma("2N - 2026")).toBe("2N");
    expect(siglaDaTurma("Física I")).toBe("FI");
    expect(siglaDaTurma("Física II")).toBe("FII");
    expect(siglaDaTurma("Laboratório de Física")).toBe("LD");
    expect(siglaDaTurma("química geral")).toBe("QG");
    expect(siglaDaTurma("Turma 2026.1 - Programação Web")).toBe("TP");
  });

  it("nome vazio ou só números ainda desenha algo", () => {
    expect(siglaDaTurma(null)).toBe("T");
    expect(siglaDaTurma("  ")).toBe("T");
    expect(siglaDaTurma("2026/2")).toBe("T");
  });
});

describe("resumirTurmas", () => {
  it("conta alunos únicos, tópicos e a conclusão como o dashboard", () => {
    const resumo = resumirTurmas(
      [54, 56, 70],
      [
        { classe_id: 54, aluno_id: "a", porcentagemConcluida: 77.2 },
        { classe_id: 54, aluno_id: "b", porcentagemConcluida: null }, // sem valor conta 0, como no dashboard
        { classe_id: 54, aluno_id: "a", porcentagemConcluida: 10 }, // repetido: vale a primeira linha
        { classe_id: 56, aluno_id: "c", porcentagemConcluida: 40 },
        { classe_id: 99, aluno_id: "x", porcentagemConcluida: 90 }, // turma que não é da lista
      ],
      [{ classe_id: 54 }, { classe_id: 54 }, { classe_id: 56 }],
    );
    expect(resumo.get(54)).toEqual({ alunos: 2, topicos: 2, conclusaoPct: 38.6 });
    expect(resumo.get(56)).toEqual({ alunos: 1, topicos: 1, conclusaoPct: 40 });
    // Sem aluno não é 0%: é sem dado.
    expect(resumo.get(70)).toEqual({ alunos: 0, topicos: 0, conclusaoPct: null });
    expect(resumo.has(99)).toBe(false);
  });
});

describe("rótulos", () => {
  it("concordância de alunos", () => {
    expect(rotuloDeAlunos(0)).toBe("0 alunos");
    expect(rotuloDeAlunos(1)).toBe("1 aluno");
    expect(rotuloDeAlunos(2)).toBe("2 alunos");
  });

  it("situação derivada da trilha e conclusão sem dado", () => {
    expect(situacaoDaTurma(0)).toEqual({ rotulo: "Sem trilha", tom: "warning" });
    expect(situacaoDaTurma(3).rotulo).toBe("Com trilha");
    expect(formatarConclusao(null)).toBe("—");
    expect(formatarConclusao(38.6)).toBe("39%");
  });
});

describe("caminhoDaTrilha", () => {
  it("leva para a trilha com a turma na URL", () => {
    expect(caminhoDaTrilha(54)).toBe("/console/trilha?turma=54");
  });
});
