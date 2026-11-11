import { describe, expect, it } from "vitest";
import { alunoDaDiversidade, mapearDiversidade } from "./diversidade";

// A forma que `classe_diversidade_perfis` (20261111_03) devolve.
const BRUTO = {
  classe_id: 1,
  margem_misto: 10,
  alunos: 3,
  alunos_com_vetor: 2,
  alunos_mistos: 1,
  entropia_normalizada: 0.556,
  perfis_efetivos: 2.95,
  perfis: [
    { perfil: "seeker", massa: 36.04, dominante: 1, representativo: 2 },
    { perfil: "survivor", massa: 33.96, dominante: 0, representativo: 2 },
    { perfil: "achiever", massa: 30, dominante: 1, representativo: 1 },
    { perfil: "daredevil", massa: 0, dominante: 0, representativo: 0 },
  ],
  pares: [
    { primeiro: "achiever", segundo: "seeker", alunos: 1 },
    { primeiro: "seeker", segundo: "survivor", alunos: 1 },
  ],
  por_aluno: [
    { aluno_id: "a", primeiro: "seeker", segundo: "survivor", margem: 4.2, misto: true },
    { aluno_id: "b", primeiro: "achiever", segundo: "seeker", margem: 40.0, misto: false },
    { aluno_id: "c", primeiro: null, segundo: null, margem: null, misto: false },
  ],
};

describe("mapearDiversidade", () => {
  it("lê a resposta da função do banco", () => {
    const d = mapearDiversidade(BRUTO);
    expect(d).not.toBeNull();
    expect(d!.alunos).toBe(3);
    expect(d!.alunosComVetor).toBe(2);
    expect(d!.alunosMistos).toBe(1);
    expect(d!.margemMisto).toBe(10);
    expect(d!.perfisEfetivos).toBe(2.95);
    expect(d!.entropiaNormalizada).toBe(0.556);
    expect(d!.perfis.map((p) => p.perfil)).toEqual(["seeker", "survivor", "achiever", "daredevil"]);
    expect(d!.pares[0]).toEqual({ primeiro: "achiever", segundo: "seeker", alunos: 1 });
  });

  it("devolve null quando não é o professor da turma (a função devolve NULL)", () => {
    expect(mapearDiversidade(null)).toBeNull();
    expect(mapearDiversidade("x")).toBeNull();
  });

  it("aceita jsonb que chegou como texto", () => {
    expect(mapearDiversidade(JSON.stringify(BRUTO))?.alunos).toBe(3);
  });

  it("descarta perfil que não reconhece e par incompleto, sem perder o resto", () => {
    const d = mapearDiversidade({
      ...BRUTO,
      perfis: [...BRUTO.perfis, { perfil: "inventado", massa: 5, dominante: 1, representativo: 1 }],
      pares: [...BRUTO.pares, { primeiro: "seeker", segundo: null, alunos: 2 }],
    });
    expect(d!.perfis).toHaveLength(4);
    expect(d!.pares).toHaveLength(2);
  });

  it("listas ausentes viram vazias e números ausentes viram zero", () => {
    const d = mapearDiversidade({ classe_id: 2, margem_misto: 10 });
    expect(d).toMatchObject({ alunos: 0, alunosComVetor: 0, alunosMistos: 0, perfisEfetivos: 0, perfis: [], pares: [], porAluno: [] });
  });
});

describe("alunoDaDiversidade", () => {
  const d = mapearDiversidade(BRUTO)!;

  it("acha o aluno misto com o 1º, o 2º e a margem", () => {
    expect(alunoDaDiversidade(d, "a")).toEqual({ alunoId: "a", primeiro: "seeker", segundo: "survivor", margem: 4.2, misto: true });
  });

  it("aluno não misto e aluno sem vetor também aparecem, com misto falso", () => {
    expect(alunoDaDiversidade(d, "b")?.misto).toBe(false);
    expect(alunoDaDiversidade(d, "c")).toEqual({ alunoId: "c", primeiro: null, segundo: null, margem: null, misto: false });
  });

  it("aluno fora da turma ou sem diversidade carregada = null", () => {
    expect(alunoDaDiversidade(d, "z")).toBeNull();
    expect(alunoDaDiversidade(null, "a")).toBeNull();
  });
});
