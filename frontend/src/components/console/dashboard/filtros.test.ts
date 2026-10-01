import { describe, expect, it } from "vitest";
import { alunosDaTurma, filtrarPorBusca, TODAS_AS_TURMAS } from "./filtros";

const alunos = [
  { nome: "Ana Lima", email: "ana@x.br", classe_id: 1 },
  { nome: "Bruno Reis", email: "bruno@x.br", classe_id: 1 },
  { nome: "Carla Dias", email: "carla@x.br", classe_id: 2 },
];

describe("alunosDaTurma", () => {
  it("todas as turmas devolve todos", () => {
    expect(alunosDaTurma(alunos, TODAS_AS_TURMAS)).toHaveLength(3);
  });

  it("uma turma devolve só os alunos dela", () => {
    expect(alunosDaTurma(alunos, "1").map((a) => a.nome)).toEqual(["Ana Lima", "Bruno Reis"]);
  });
});

describe("filtrarPorBusca", () => {
  it("filtra por nome ou e-mail, sem diferenciar maiúsculas", () => {
    expect(filtrarPorBusca(alunos, "ANA").map((a) => a.nome)).toEqual(["Ana Lima"]);
    expect(filtrarPorBusca(alunos, "bruno@").map((a) => a.nome)).toEqual(["Bruno Reis"]);
  });

  it("busca vazia não filtra", () => {
    expect(filtrarPorBusca(alunos, "  ")).toHaveLength(3);
  });

  it("a busca não altera o escopo da turma, que é o que alimenta os KPIs", () => {
    const escopo = alunosDaTurma(alunos, "1");
    const tabela = filtrarPorBusca(escopo, "ana");
    expect(tabela).toHaveLength(1);
    expect(escopo).toHaveLength(2);
  });
});
