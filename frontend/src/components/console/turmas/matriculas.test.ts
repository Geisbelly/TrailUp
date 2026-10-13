import { describe, expect, it } from "vitest";
import { buscarAlunos, formatarDesde, normalizar, perfilDominantePorAluno, rotuloDaContagem } from "./matriculas";

const alunos = [
  { id: "1", nome: "João Pedro Ribeiro", email: "jpedro@rede.ulbra.br" },
  { id: "2", nome: "Guilherme Domiciano", email: "guilherme@gmail.com" },
  { id: "3", nome: "fer", email: "geisbellyv@gmail.com" },
  { id: "4", nome: "Aluno Demo", email: "demo@trailup.app" },
  { id: "5", nome: "Ana Joana", email: null },
];

describe("normalizar", () => {
  it("tira acento, caixa e espaço sobrando", () => {
    expect(normalizar("  JOÃO   Pedro ")).toBe("joao pedro");
    expect(normalizar(null)).toBe("");
  });
});

describe("buscarAlunos", () => {
  const nenhum = new Set<string>();

  it("encontra por nome sem acento e sem caixa", () => {
    expect(buscarAlunos(alunos, "JOAO", nenhum).map((a) => a.id)).toEqual(["1"]);
  });

  it("encontra por e-mail", () => {
    expect(buscarAlunos(alunos, "GMAIL", nenhum).map((a) => a.id)).toEqual(["3", "2"]);
    expect(buscarAlunos(alunos, "ulbra", nenhum).map((a) => a.id)).toEqual(["1"]);
  });

  it("nome que começa com o termo vem antes de nome que só o contém", () => {
    expect(buscarAlunos(alunos, "jo", nenhum).map((a) => a.nome)).toEqual(["João Pedro Ribeiro", "Ana Joana"]);
  });

  it("quem já está na turma aparece por último e marcado", () => {
    const r = buscarAlunos(alunos, "", new Set(["4", "2"]));
    expect(r.map((a) => a.id)).toEqual(["5", "3", "1", "4", "2"]);
    expect(r.filter((a) => a.jaMatriculado).map((a) => a.id)).toEqual(["4", "2"]);
  });

  it("termo sem resultado", () => {
    expect(buscarAlunos(alunos, "zzz", nenhum)).toEqual([]);
  });
});

describe("rótulos e dados do matriculado", () => {
  it("contagem", () => {
    expect(rotuloDaContagem(3, "")).toBe("3 alunos");
    expect(rotuloDaContagem(1, "jo")).toBe("1 resultado");
    expect(rotuloDaContagem(0, "jo")).toBe("nenhum resultado");
  });

  it("perfil dominante pela maior afinidade", () => {
    const m = perfilDominantePorAluno([
      { aluno_id: "a", afinidade: 40, perfil: { nome: "seeker" } },
      { aluno_id: "a", afinidade: 80, perfil: { nome: "mastermind" } },
      { aluno_id: "b", afinidade: null, perfil: { nome: "achiever" } },
      { aluno_id: "c", afinidade: 90, perfil: null },
    ]);
    expect(m.get("a")).toBe("mastermind");
    expect(m.get("b")).toBe("achiever");
    expect(m.has("c")).toBe(false);
  });

  it("data de matrícula", () => {
    expect(formatarDesde("2026-03-04T12:00:00")).toBe("04/03/2026");
    expect(formatarDesde(null)).toBeNull();
    expect(formatarDesde("x")).toBeNull();
  });
});
