import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { APAGADO_COM_AS_TURMAS, excluirMinhaContaProfessor, FICA_COM_OS_ALUNOS, mensagemDeErroExclusao } from "./exclusaoConta";

describe("excluirMinhaContaProfessor", () => {
  it("chama a RPC do servidor e devolve quantas turmas e alunos foram apagados/afetados", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, turmas_apagadas: 2, alunos_afetados: 31 }, error: null });
    await expect(excluirMinhaContaProfessor()).resolves.toEqual({ ok: true, turmasApagadas: 2, alunosAfetados: 31 });
    expect(rpc).toHaveBeenCalledWith("fn_excluir_minha_conta_professor");
  });

  it("recusa do servidor vira mensagem, sem dizer que excluiu", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "fn_excluir_minha_conta_professor: a conta do dono do app nao pode ser excluida" } });
    const r = await excluirMinhaContaProfessor();
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/administração/);
  });
});

describe("mensagemDeErroExclusao", () => {
  it("permissão", () => expect(mensagemDeErroExclusao({ code: "42501", message: "x" })).toMatch(/própria conta/));
  it("genérico", () => expect(mensagemDeErroExclusao({ message: "rede" })).toMatch(/Tente de novo/));
});

describe("texto do modal", () => {
  it("diz que as turmas, trilhas, matrículas e notas são apagadas", () => {
    const texto = APAGADO_COM_AS_TURMAS("2 turmas", "31 alunos").join(" ");
    expect(texto).toMatch(/2 turmas/);
    expect(texto).toMatch(/31 alunos/);
    for (const palavra of ["trilhas", "matrículas", "notas"]) expect(texto).toContain(palavra);
  });
  it("não promete mais que a turma fica com os alunos", () => {
    const texto = [...APAGADO_COM_AS_TURMAS("x", "y"), ...FICA_COM_OS_ALUNOS].join(" ");
    expect(texto).not.toMatch(/professor removido|continuam vendo/);
    expect(FICA_COM_OS_ALUNOS.join(" ")).toMatch(/BrainHex/);
  });
});
