import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data?: unknown; error?: unknown; count?: number | null };
const sb = vi.hoisted(() => ({
  respostas: {} as Record<string, Resp>,
  chamadas: [] as unknown[][],
  rpc: vi.fn(),
  saveActivity: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: sb.rpc,
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "delete", "update", "maybeSingle"]) {
        q[m] = (...args: unknown[]) => (sb.chamadas.push([tabela, m, ...args]), q);
      }
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(sb.respostas[tabela] ?? { data: [], error: null, count: 0 }).then(resolve);
      return q;
    },
  },
}));
vi.mock("../trilha/topicsApi", () => ({ saveActivity: sb.saveActivity }));

import { contarEntregas, duplicarMissao, excluirMissao, foiEntregue, gravarMoedas, listarMissoes, mapearMissao, moedasDe, salvarMissao } from "./missoesApi";

const ativ = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  titulo: `M${id}`,
  descricao: "obj",
  data_entrega: "2026-10-20T23:59:00Z",
  pontuacao_maxima: "50",
  topico_id: 4,
  topicos: { nome: "Cinemática", classe_id: 7 },
  ...extra,
});

beforeEach(() => {
  sb.respostas = {};
  sb.chamadas = [];
  sb.rpc.mockReset();
  sb.saveActivity.mockReset();
});

describe("contarEntregas", () => {
  it("só conta concluídas e um aluno uma vez só", () => {
    const m = contarEntregas([
      { atividade_id: 1, aluno_id: "a", status: "concluido" },
      { atividade_id: 1, aluno_id: "a", status: "Concluído" },
      { atividade_id: 1, aluno_id: "b", status: "em andamento" },
      { atividade_id: 1, aluno_id: "c", status: null },
      { atividade_id: 2, aluno_id: "a", status: "concluido" },
    ]);
    expect(m.get(1)).toBe(1);
    expect(m.get(2)).toBe(1);
    expect(foiEntregue("não iniciado")).toBe(false);
    expect(foiEntregue(undefined)).toBe(false);
  });
});

describe("mapearMissao", () => {
  it("aceita o tópico como objeto ou lista; sem nome vira rótulo", () => {
    expect(mapearMissao(ativ(1), 3, 10)).toMatchObject({ titulo: "M1", topicoNome: "Cinemática", pontos: 50, entregues: 3, total: 10 });
    expect(mapearMissao(ativ(1, { topicos: [{ nome: "X", classe_id: 7 }] }), 0, 0).topicoNome).toBe("X");
    expect(mapearMissao(ativ(1, { topicos: null, descricao: null }), 0, 0)).toMatchObject({ topicoNome: "Tópico 4", objetivo: "" });
  });
});

describe("listarMissoes", () => {
  it("filtra por tipo missão e pela turma, e junta entregas e total de alunos", async () => {
    sb.respostas.atividades = { data: [ativ(1), ativ(2)], error: null };
    sb.respostas.atividade_aluno = { data: [{ atividade_id: 1, aluno_id: "a", status: "concluido" }, { atividade_id: 1, aluno_id: "b", status: "concluido" }], error: null };
    sb.respostas.classe_aluno = { data: null, error: null, count: 34 };
    const r = await listarMissoes(7);
    expect(sb.chamadas).toContainEqual(["atividades", "eq", "tipo", "missao"]);
    expect(sb.chamadas).toContainEqual(["atividades", "eq", "topicos.classe_id", 7]);
    expect(r.map((m) => [m.id, m.entregues, m.total])).toEqual([[1, 2, 34], [2, 0, 34]]);
  });

  it("sem missões não faz as outras consultas", async () => {
    sb.respostas.atividades = { data: [], error: null };
    await expect(listarMissoes(7)).resolves.toEqual([]);
    expect(sb.chamadas.some((c) => c[0] === "atividade_aluno")).toBe(false);
  });

  it("propaga erro de qualquer das leituras", async () => {
    sb.respostas.atividades = { data: null, error: new Error("a") };
    await expect(listarMissoes(7)).rejects.toThrow("a");
    sb.respostas.atividades = { data: [ativ(1)], error: null };
    sb.respostas.atividade_aluno = { data: null, error: new Error("b") };
    await expect(listarMissoes(7)).rejects.toThrow("b");
    sb.respostas.atividade_aluno = { data: [], error: null };
    sb.respostas.classe_aluno = { data: null, error: new Error("c"), count: null };
    await expect(listarMissoes(7)).rejects.toThrow("c");
  });
});

describe("salvarMissao / duplicarMissao / excluirMissao", () => {
  it("salvar usa saveActivity com o tipo e a pontuação da missão", async () => {
    sb.saveActivity.mockResolvedValue(9);
    const payload = { topico_id: 4, titulo: "M", descricao: "obj", tipo: "missao" as const, data_entrega: null, pontuacao_maxima: 50, moedas: 0 };
    await expect(salvarMissao(payload, 9)).resolves.toBe(9);
    expect(sb.saveActivity).toHaveBeenCalledWith({ id: 9, topico_id: 4, titulo: "M", descricao: "obj", tipo: "missao", data_entrega: null, pontuacao_maxima: 50 });
  });

  it("duplicar chama a função do banco sem conteúdo e propaga erro", async () => {
    sb.rpc.mockResolvedValue({ data: 77, error: null });
    await expect(duplicarMissao(3)).resolves.toBe(77);
    expect(sb.rpc).toHaveBeenCalledWith("duplicar_atividade", { p_atividade_id: 3, p_conteudo_id: null });
    sb.rpc.mockResolvedValue({ data: null, error: new Error("rls") });
    await expect(duplicarMissao(3)).rejects.toThrow("rls");
  });

  it("excluir apaga os vínculos ANTES da atividade, e para se os vínculos falharem", async () => {
    await excluirMissao(3);
    const ordem = sb.chamadas.filter((c) => c[1] === "delete").map((c) => c[0]);
    expect(ordem).toEqual(["atividade_conteudos", "atividades"]);

    sb.chamadas = [];
    sb.respostas.atividade_conteudos = { error: new Error("fk") };
    await expect(excluirMissao(3)).rejects.toThrow("fk");
    expect(sb.chamadas.filter((c) => c[0] === "atividades" && c[1] === "delete")).toHaveLength(0);
  });

  it("propaga o erro do banco ao apagar a atividade (ex.: entregas de alunos)", async () => {
    sb.respostas.atividades = { error: new Error("23503") };
    await expect(excluirMissao(3)).rejects.toThrow("23503");
  });
});

describe("moedas da missão", () => {
  it("moedasDe lê só inteiro positivo", () => {
    expect(moedasDe({ moedas: 5 })).toBe(5);
    expect(moedasDe({ moedas: "7" })).toBe(7);
    for (const v of [null, {}, { moedas: -1 }, { moedas: 1.5 }, { moedas: "x" }, [], "texto"]) expect(moedasDe(v)).toBe(0);
  });

  it("gravar mescla no metadata existente sem apagar o resto", async () => {
    sb.respostas.atividades = { data: { metadata: { grading_rules: { a: 1 }, moedas: 3 } }, error: null };
    await gravarMoedas(9, 10);
    const upd = sb.chamadas.find((c) => c[0] === "atividades" && c[1] === "update");
    expect(upd[2]).toEqual({ metadata: { grading_rules: { a: 1 }, moedas: 10 } });
    expect(sb.chamadas).toContainEqual(["atividades", "eq", "id", 9]);
  });

  it("zero remove a chave e metadata inválido vira objeto novo", async () => {
    sb.respostas.atividades = { data: { metadata: { grading_rules: 1, moedas: 3 } }, error: null };
    await gravarMoedas(9, 0);
    expect(sb.chamadas.find((c) => c[1] === "update")[2]).toEqual({ metadata: { grading_rules: 1 } });
    sb.chamadas = [];
    sb.respostas.atividades = { data: { metadata: ["x"] }, error: null };
    await gravarMoedas(9, 4);
    expect(sb.chamadas.find((c) => c[1] === "update")[2]).toEqual({ metadata: { moedas: 4 } });
  });

  it("propaga erro de leitura e de escrita", async () => {
    sb.respostas.atividades = { data: null, error: new Error("ler") };
    await expect(gravarMoedas(9, 1)).rejects.toThrow("ler");
    sb.respostas.atividades = { data: { metadata: {} }, error: new Error("gravar") };
    await expect(gravarMoedas(9, 1)).rejects.toThrow("gravar");
  });

  it("salvar grava as moedas depois da atividade", async () => {
    sb.saveActivity.mockResolvedValue(9);
    sb.respostas.atividades = { data: { metadata: {} }, error: null };
    await salvarMissao({ topico_id: 4, titulo: "M", descricao: "o", tipo: "missao", data_entrega: null, pontuacao_maxima: 50, moedas: 12 }, 9);
    expect(sb.chamadas.find((c) => c[1] === "update")[2]).toEqual({ metadata: { moedas: 12 } });
  });
});
