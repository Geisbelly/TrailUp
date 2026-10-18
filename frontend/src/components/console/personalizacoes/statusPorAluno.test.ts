import { describe, expect, it } from "vitest";
import { filtrarPorNome, montarStatusPorAluno } from "./statusPorAluno";

const alunos = [
  { id: "b", nome: "Bruno", email: null, perfil_dominante: "seeker" },
  { id: "a", nome: "Ana", email: null, perfil_dominante: "achiever" },
  { id: "c", nome: null, email: "carla@x.com", perfil_dominante: "survivor" },
];

describe("montarStatusPorAluno", () => {
  it("aluno sem registro entra como sem material, ordenado por nome", () => {
    const r = montarStatusPorAluno(alunos, []);
    expect(r.map((x) => x.nome)).toEqual(["Ana", "Bruno", "carla@x.com"]);
    expect(r.every((x) => x.tom === "sem_material")).toBe(true);
  });

  it("registro mais recente do aluno é o que vale; linha sem aluno é ignorada", () => {
    const r = montarStatusPorAluno(
      alunos,
      [
        { aluno_id: "a", status: "failed", gerado_em: null, updated_at: "2026-10-01T10:00:00Z" },
        { aluno_id: "a", status: "completed", gerado_em: null, updated_at: "2026-10-02T10:00:00Z" },
        { aluno_id: null, status: "completed", gerado_em: null, updated_at: "2026-10-03T10:00:00Z" },
      ],
      new Date("2026-10-02T11:00:00Z"),
    );
    const ana = r.find((x) => x.alunoId === "a")!;
    expect(ana.tom).not.toBe("sem_material");
    expect(ana.tom).not.toBe("falha");
  });
});

describe("filtrarPorNome", () => {
  it("busca por trecho, sem diferenciar caixa", () => {
    const r = montarStatusPorAluno(alunos, []);
    expect(filtrarPorNome(r, " bru ").map((x) => x.alunoId)).toEqual(["b"]);
    expect(filtrarPorNome(r, "")).toHaveLength(3);
  });
});
