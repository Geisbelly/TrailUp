import { describe, expect, it } from "vitest";
import { filtrarPorPerfil, paginar, perfisPresentes, TODOS_OS_PERFIS } from "./tabela";

const alunos = Array.from({ length: 19 }, (_, i) => ({
  id: i + 1,
  perfilDominante: i % 3 === 0 ? "Seeker" : "Achiever",
}));

describe("paginar", () => {
  it("8 por página, com o intervalo mostrado", () => {
    const p = paginar(alunos, 1);
    expect(p.itens.map((a) => a.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([p.primeiro, p.ultimo, p.total, p.totalPaginas]).toEqual([1, 8, 19, 3]);
  });

  it("última página incompleta", () => {
    const p = paginar(alunos, 3);
    expect(p.itens.map((a) => a.id)).toEqual([17, 18, 19]);
    expect([p.primeiro, p.ultimo]).toEqual([17, 19]);
  });

  it("página fora do intervalo é ajustada (lista encolheu depois de filtrar)", () => {
    expect(paginar(alunos, 9).pagina).toBe(3);
    expect(paginar(alunos, 0).pagina).toBe(1);
  });

  it("lista vazia tem uma página e intervalo zerado", () => {
    const p = paginar([], 1);
    expect([p.pagina, p.totalPaginas, p.primeiro, p.ultimo, p.total]).toEqual([1, 1, 0, 0, 0]);
  });
});

describe("filtrarPorPerfil", () => {
  it("todos os perfis não filtra; um perfil filtra pelo nome exato", () => {
    expect(filtrarPorPerfil(alunos, TODOS_OS_PERFIS)).toHaveLength(19);
    expect(filtrarPorPerfil(alunos, "Seeker")).toHaveLength(7);
  });

  it("filtro por perfil e paginação combinados", () => {
    const p = paginar(filtrarPorPerfil(alunos, "Achiever"), 2);
    expect(p.total).toBe(12);
    expect(p.itens).toHaveLength(4);
  });
});

describe("perfisPresentes", () => {
  it("lista cada perfil uma vez, em ordem alfabética", () => {
    expect(perfisPresentes(alunos)).toEqual(["Achiever", "Seeker"]);
  });
});
