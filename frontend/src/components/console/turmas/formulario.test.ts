import { describe, expect, it, vi } from "vitest";
import { CAMPOS_VAZIOS, criarTurma, nomeDaTurma, notaComMetaCumprida, validarFormulario, type BancoDeTurmas } from "./formulario";

const campos = (c: Partial<typeof CAMPOS_VAZIOS>) => ({ ...CAMPOS_VAZIOS, ...c });

describe("validarFormulario", () => {
  it("nome é obrigatório e sai sem espaços sobrando", () => {
    expect(validarFormulario(campos({ nome: "   " }), "criar")).toEqual({ ok: false, erros: { nome: "Dê um nome à turma." } });
    expect(validarFormulario(campos({ nome: "  SPD -  3N 2026/2 " }), "criar")).toEqual({
      ok: true,
      dados: { descricao: "SPD - 3N 2026/2", materiaId: null, novaMateria: null },
    });
    expect(validarFormulario(campos({ nome: "x".repeat(121) }), "criar")).toMatchObject({ ok: false, erros: { nome: expect.stringContaining("120") } });
  });

  it("matéria existente ou nova, nunca as duas; nova matéria é opcional", () => {
    expect(validarFormulario(campos({ nome: "T", materiaId: "7" }), "criar")).toMatchObject({ ok: true, dados: { materiaId: 7, novaMateria: null } });
    expect(validarFormulario(campos({ nome: "T", novaMateriaNome: " Física ", novaMateriaDescricao: "" }), "criar")).toMatchObject({
      ok: true,
      dados: { materiaId: null, novaMateria: { nome: "Física", descricao: null } },
    });
    expect(validarFormulario(campos({ nome: "T", materiaId: "7", novaMateriaNome: "Física" }), "criar")).toMatchObject({ ok: false, erros: { materia: expect.any(String) } });
    expect(validarFormulario(campos({ nome: "T", novaMateriaDescricao: "sem nome" }), "criar")).toMatchObject({ ok: false, erros: { materia: expect.stringContaining("nome") } });
  });

  it("editar ignora os campos de matéria nova", () => {
    expect(validarFormulario(campos({ nome: "T", materiaId: "7", novaMateriaNome: "resto" }), "editar")).toMatchObject({
      ok: true,
      dados: { materiaId: 7, novaMateria: null },
    });
  });
});

describe("peso do XP na nota final (#143)", () => {
  it("ao editar, peso com vírgula e meta inteira viram números", () => {
    expect(validarFormulario(campos({ nome: "T", xpPeso: "2,9", xpMeta: "1000" }), "editar")).toMatchObject({
      ok: true,
      dados: { xpNota: { pesoPct: 2.9, meta: 1000 } },
    });
    expect(validarFormulario(campos({ nome: "T", xpPeso: "0", xpMeta: "1" }), "editar")).toMatchObject({
      ok: true,
      dados: { xpNota: { pesoPct: 0, meta: 1 } },
    });
  });

  it("os limites são os do CHECK do banco", () => {
    for (const xpPeso of ["50,01", "-1", "", "abc", "2,999"]) {
      expect(validarFormulario(campos({ nome: "T", xpPeso, xpMeta: "1000" }), "editar")).toMatchObject({ ok: false, erros: { xpPeso: expect.any(String) } });
    }
    for (const xpMeta of ["0", "", "10,5", "1000001"]) {
      expect(validarFormulario(campos({ nome: "T", xpPeso: "3", xpMeta }), "editar")).toMatchObject({ ok: false, erros: { xpMeta: expect.any(String) } });
    }
    expect(validarFormulario(campos({ nome: "T", xpPeso: "50", xpMeta: "1000" }), "editar")).toMatchObject({ ok: true });
  });

  it("sem as colunas no banco, e ao criar, o peso fica de fora", () => {
    expect(validarFormulario(campos({ nome: "T" }), "editar")).toEqual({ ok: true, dados: { descricao: "T", materiaId: null, novaMateria: null } });
    expect(validarFormulario(campos({ nome: "T", xpPeso: "99", xpMeta: "0" }), "criar")).toEqual({
      ok: true,
      dados: { descricao: "T", materiaId: null, novaMateria: null },
    });
  });

  it("o exemplo da tela: o XP só soma", () => {
    expect(notaComMetaCumprida(7, 2.9)).toBe(7.09);
    expect(notaComMetaCumprida(7, 0)).toBe(7);
    expect(notaComMetaCumprida(10, 50)).toBe(10);
  });
});

describe("nomeDaTurma", () => {
  it("nome exibido na confirmação nunca é vazio", () => {
    expect(nomeDaTurma({ id: 54, descricao: " SPD - 3N 2026/2 " })).toBe("SPD - 3N 2026/2");
    expect(nomeDaTurma({ id: 54, descricao: null })).toBe("Turma 54");
    expect(nomeDaTurma({ id: 54, descricao: "  " })).toBe("Turma 54");
  });
});

describe("criarTurma", () => {
  const banco = (): BancoDeTurmas & { [K in keyof BancoDeTurmas]: ReturnType<typeof vi.fn> } => ({
    inserirTurma: vi.fn(async (d) => ({ id: 70, descricao: d.descricao })),
    inserirMateria: vi.fn(async () => ({ id: 9 })),
    vincularMateria: vi.fn(async () => undefined),
  });
  const dados = { descricao: "Química", materiaId: null, novaMateria: { nome: "Química Geral", descricao: null } };

  it("grava a turma antes da matéria nova e depois vincula", async () => {
    const db = banco();
    expect(await criarTurma(db, dados)).toEqual({ id: 70, descricao: "Química", avisoDeMateria: null });
    expect(db.inserirTurma).toHaveBeenCalledWith({ descricao: "Química", materia_id: null });
    expect(db.inserirTurma.mock.invocationCallOrder[0]).toBeLessThan(db.inserirMateria.mock.invocationCallOrder[0]);
    expect(db.vincularMateria).toHaveBeenCalledWith(70, 9);
  });

  it("turma que falha não cria matéria nenhuma", async () => {
    const db = banco();
    db.inserirTurma.mockRejectedValueOnce(new Error("sem permissão"));
    await expect(criarTurma(db, dados)).rejects.toThrow("sem permissão");
    expect(db.inserirMateria).not.toHaveBeenCalled();
  });

  it("matéria que falha deixa a turma criada e avisa", async () => {
    const db = banco();
    db.inserirMateria.mockRejectedValueOnce(new Error("rede"));
    const r = await criarTurma(db, dados);
    expect(r.id).toBe(70);
    expect(r.avisoDeMateria).toContain("Química Geral");
    expect(db.vincularMateria).not.toHaveBeenCalled();
  });

  it("matéria existente vai direto no INSERT da turma", async () => {
    const db = banco();
    await criarTurma(db, { descricao: "T", materiaId: 3, novaMateria: null });
    expect(db.inserirTurma).toHaveBeenCalledWith({ descricao: "T", materia_id: 3 });
    expect(db.inserirMateria).not.toHaveBeenCalled();
  });
});
