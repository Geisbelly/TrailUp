import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: sb.rpc } }));

import { avaliarEntrega, listarFila, mapearLinha, traduzirErroDeNota } from "./notasApi";

const doBanco = (extra: Record<string, unknown> = {}) => ({
  aluno_id: "a1",
  aluno_nome: " Caio Bertoldo ",
  atividade_id: "5",
  topico_id: 10,
  titulo: "Explique a aceleração",
  enunciado: null,
  gabarito: "  ",
  resposta: "texto",
  entregue_em: "2026-10-10T12:00:00Z",
  prazo: null,
  pontuacao_maxima: "10",
  pontuacao_obtida: null,
  avaliado_em: null,
  feedback: null,
  ...extra,
});

beforeEach(() => sb.rpc.mockReset());

describe("mapearLinha", () => {
  it("normaliza: números em texto viram número, gabarito em branco vira null, nome sem espaços", () => {
    const l = mapearLinha(doBanco());
    expect(l).toMatchObject({ alunoNome: "Caio Bertoldo", atividadeId: 5, topicoId: 10, enunciado: "", gabarito: null, pontuacaoMaxima: 10, pontuacaoObtida: null });
  });

  it("aluno sem nome ganha um nome de exibição; nota 0 continua sendo 0", () => {
    expect(mapearLinha(doBanco({ aluno_nome: null })).alunoNome).toBe("Aluno sem nome");
    expect(mapearLinha(doBanco({ pontuacao_obtida: 0 })).pontuacaoObtida).toBe(0);
    expect(mapearLinha(doBanco({ pontuacao_maxima: "abc" })).pontuacaoMaxima).toBeNull();
  });
});

describe("listarFila", () => {
  it("chama a função da turma e mapeia as linhas", async () => {
    sb.rpc.mockResolvedValue({ data: [doBanco(), doBanco({ aluno_id: "a2" })], error: null });
    const r = await listarFila(7);
    expect(sb.rpc).toHaveBeenCalledWith("notas_fila", { p_classe_id: 7 });
    expect(r.map((l) => l.alunoId)).toEqual(["a1", "a2"]);
  });

  it("propaga o erro: a tela mostra erro, não fila vazia", async () => {
    const erro = { code: "42501" };
    sb.rpc.mockResolvedValue({ data: null, error: erro });
    await expect(listarFila(7)).rejects.toBe(erro);
  });

  it("sem dados vira lista vazia", async () => {
    sb.rpc.mockResolvedValue({ data: null, error: null });
    await expect(listarFila(7)).resolves.toEqual([]);
  });
});

describe("avaliarEntrega", () => {
  it("manda nota e feedback aparado; feedback em branco vira null", async () => {
    sb.rpc.mockResolvedValue({ data: "8", error: null });
    await expect(avaliarEntrega(5, "a1", 8, "  ótimo  ")).resolves.toBe(8);
    expect(sb.rpc).toHaveBeenCalledWith("avaliar_entrega", { p_atividade_id: 5, p_aluno_id: "a1", p_nota: 8, p_feedback: "ótimo" });
    await avaliarEntrega(5, "a1", 8, "   ");
    expect(sb.rpc).toHaveBeenLastCalledWith("avaliar_entrega", expect.objectContaining({ p_feedback: null }));
  });

  it("propaga o erro do banco", async () => {
    const erro = { code: "22023", message: "A nota vai de 0 a 10." };
    sb.rpc.mockResolvedValue({ data: null, error: erro });
    await expect(avaliarEntrega(5, "a1", 11, "")).rejects.toBe(erro);
  });
});

describe("traduzirErroDeNota", () => {
  it("permissão tem texto fixo, validação usa a mensagem do banco, o resto não vaza detalhe", () => {
    expect(traduzirErroDeNota({ code: "42501" })).toContain("permissão");
    expect(traduzirErroDeNota({ code: "22023", message: "A nota vai de 0 a 10." })).toBe("A nota vai de 0 a 10.");
    expect(traduzirErroDeNota({ code: "XX000", message: "relation x" })).not.toContain("relation");
    expect(traduzirErroDeNota(null)).toBeTruthy();
  });
});
