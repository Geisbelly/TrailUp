import { describe, expect, it } from "vitest";
import { idDaCopia, mensagemDeErroDaDuplicacao } from "./duplicacao";

describe("mensagemDeErroDaDuplicacao", () => {
  it("função ausente (migration não aplicada) vira aviso claro", () => {
    const aviso = "A duplicação ainda não está disponível neste ambiente.";
    expect(mensagemDeErroDaDuplicacao({ code: "PGRST202", message: "Could not find the function public.duplicar_classe(p_classe_id) in the schema cache" })).toBe(aviso);
    expect(mensagemDeErroDaDuplicacao({ code: "42883", message: "function public.duplicar_classe(bigint) does not exist" })).toBe(aviso);
  });

  it("sem permissão e erro genérico", () => {
    expect(mensagemDeErroDaDuplicacao({ code: "42501", message: "Turma não encontrada ou sem permissão para duplicar." })).toBe(
      "Você não tem permissão para duplicar esta turma.",
    );
    expect(mensagemDeErroDaDuplicacao({ message: "timeout" })).toBe("Não foi possível duplicar a turma: timeout");
    expect(mensagemDeErroDaDuplicacao(null)).toBe("Não foi possível duplicar a turma.");
  });
});

describe("idDaCopia", () => {
  it("aceita o id devolvido pelo banco (número ou bigint em texto)", () => {
    expect(idDaCopia(88)).toBe(88);
    expect(idDaCopia("88")).toBe(88);
    expect(idDaCopia(null)).toBeNull();
    expect(idDaCopia(true)).toBeNull();
    expect(idDaCopia(0)).toBeNull();
  });
});
