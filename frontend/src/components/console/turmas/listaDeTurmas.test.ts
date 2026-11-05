import { describe, expect, it } from "vitest";
import { contarPorFiltro, organizarTurmas, type TurmaDaLista } from "./listaDeTurmas";

const turma = (id: number, nome: string, alunos: number, topicos: number, conclusaoPct: number | null, materia: string | null = null): TurmaDaLista => ({
  id,
  nome,
  materia,
  criadaEm: `2026-11-0${id}T10:00:00Z`,
  resumo: { alunos, topicos, conclusaoPct },
});

const TURMAS = [turma(1, "Física II", 30, 5, 80, "Exatas"), turma(2, "Álgebra 10", 0, 0, null), turma(3, "Álgebra 2", 12, 0, 10)];

describe("organizarTurmas", () => {
  it("acha por nome ou matéria, sem acento nem caixa", () => {
    expect(organizarTurmas(TURMAS, "algebra", "todas", "nome").map((t) => t.id)).toEqual([3, 2]);
    expect(organizarTurmas(TURMAS, "exatas", "todas", "nome").map((t) => t.id)).toEqual([1]);
  });

  it("ordena número dentro do nome como número", () => {
    expect(organizarTurmas(TURMAS, "", "todas", "nome").map((t) => t.nome)).toEqual(["Álgebra 2", "Álgebra 10", "Física II"]);
  });

  it("na menor conclusão, turma sem aluno vai para o fim: sem dado não é 0%", () => {
    expect(organizarTurmas(TURMAS, "", "todas", "menor_conclusao").map((t) => t.id)).toEqual([3, 1, 2]);
  });

  it("recentes é a ordem padrão, e nada altera a lista recebida", () => {
    const copia = [...TURMAS];
    expect(organizarTurmas(TURMAS, "", "todas", "recentes").map((t) => t.id)).toEqual([3, 2, 1]);
    expect(TURMAS).toEqual(copia);
  });

  it("filtra e conta pelo mesmo critério", () => {
    expect(contarPorFiltro(TURMAS)).toEqual({ todas: 3, com_trilha: 1, sem_trilha: 2, sem_alunos: 1 });
    expect(organizarTurmas(TURMAS, "", "sem_alunos", "nome").map((t) => t.id)).toEqual([2]);
  });
});
