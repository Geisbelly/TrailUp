import { describe, expect, it } from "vitest";
import { alunosParaVincular, lerAcessos, lerEconomia, lerMolduras, precoParaGravar, rotuloDoAluno } from "./administracao";

describe("leitura do banco", () => {
  it("recusa o que não é objeto e não inventa campo", () => {
    expect(lerAcessos(null)).toBeNull();
    expect(lerMolduras([])).toBeNull();
    expect(lerEconomia("x")).toBeNull();
    expect(lerAcessos({})).toEqual({ professores: [], alunos: [] });
  });

  it("professor sem `liberado` verdadeiro conta como bloqueado", () => {
    const lido = lerAcessos({ professores: [{ professor_id: "p", liberado: "true", alunos: [{ aluno_id: "a", nome: "Ana" }] }], alunos: [] });
    expect(lido?.professores[0].liberado).toBe(false);
    expect(lido?.professores[0].alunos[0]).toEqual({ aluno_id: "a", nome: "Ana", email: null });
  });

  it("moldura sem preço continua sem preço, não vira zero", () => {
    expect(lerMolduras({ molduras: [{ codigo: "c", preco: null, ativa: true }] })?.molduras[0]).toMatchObject({ nome: "c", preco: null, ativa: true });
  });

  it("entidade_id numérico vira texto", () => {
    expect(lerEconomia({ auditoria: [{ id: 3, operacao: "compra", entidade_id: 7 }] })?.auditoria[0].entidade_id).toBe("7");
  });
});

describe("regras da tela", () => {
  const ana = { aluno_id: "a", nome: "Ana", email: "ana@example.test" };
  const bia = { aluno_id: "b", nome: null, email: "bia@example.test" };

  it("não oferece quem já está vinculado", () => {
    const professor = { professor_id: "p", nome: null, descricao: null, instituicao: null, disciplina: null, liberado: true, alunos: [ana] };
    expect(alunosParaVincular(professor, [ana, bia])).toEqual([bia]);
  });

  it("rótulo usa o que existe", () => {
    expect(rotuloDoAluno(ana)).toBe("Ana (ana@example.test)");
    expect(rotuloDoAluno(bia)).toBe("bia@example.test");
    expect(rotuloDoAluno({ aluno_id: "x", nome: null, email: null })).toBe("x");
  });

  it("preço vale de 1 a 1000 e só na loja", () => {
    expect(precoParaGravar("loja", "1")).toEqual({ ok: true, preco: 1 });
    expect(precoParaGravar("loja", "1000")).toEqual({ ok: true, preco: 1000 });
    for (const ruim of ["", " ", "0", "1001", "2.5", "abc"]) expect(precoParaGravar("loja", ruim)).toEqual({ ok: false });
    expect(precoParaGravar("conquista", "")).toEqual({ ok: true, preco: null });
  });
});
