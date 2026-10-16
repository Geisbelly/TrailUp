import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data?: unknown; error?: unknown };
const sb = vi.hoisted(() => ({
  resposta: { data: [], error: null } as Resp,
  porTabela: {} as Record<string, Resp>,
  chamadas: [] as unknown[][],
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: sb.rpc,
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "update", "insert", "delete"]) {
        q[m] = (...args: unknown[]) => (sb.chamadas.push([tabela, m, ...args]), q);
      }
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(sb.porTabela[tabela] ?? sb.resposta).then(resolve);
      return q;
    },
  },
}));

import { abrirEvento, encerrarEvento, excluirEvento, listarEventos, mapearEvento, salvarEvento, traduzirErroDeEvento } from "./eventosApi";

const linha = (extra: Record<string, unknown> = {}) => ({
  id: "e1",
  classe_id: 7,
  topico_id: null,
  titulo: "Semana",
  descricao: null,
  status: "aberto",
  inicio: "2026-10-20T08:00:00Z",
  fim: "2026-10-27T08:00:00Z",
  modalidade_guilda: true,
  guilda_tamanho_max: 5,
  pecas: ["arena", 3, "missoes"],
  pontos: 50,
  moedas: null,
  medalha_participacao: true,
  medalha_destaque: false,
  recompensa: null,
  ...extra,
});

const payload = {
  topico_id: null, titulo: "S", descricao: "", inicio: "a", fim: "b", pecas: ["arena" as const], modalidade_guilda: false,
  guilda_tamanho_max: null, pontos: 0, moedas: 0, medalha_participacao: true, medalha_destaque: false, recompensa: null,
};

beforeEach(() => {
  sb.resposta = { data: [], error: null };
  sb.chamadas = [];
  sb.porTabela = {};
  sb.rpc.mockReset();
});

describe("mapearEvento", () => {
  it("normaliza nulos, descarta peça que não é texto e cai em rascunho com status desconhecido", () => {
    expect(mapearEvento(linha())).toMatchObject({ descricao: "", pecas: ["arena", "missoes"], moedas: 0, recompensa: "", status: "aberto" });
    expect(mapearEvento(linha({ status: "xyz", pecas: null })).status).toBe("rascunho");
    expect(mapearEvento(linha({ pecas: null })).pecas).toEqual([]);
  });
});

describe("listarEventos / salvarEvento", () => {
  it("lista só da turma, do mais recente ao mais antigo, e propaga erro", async () => {
    sb.resposta = { data: [linha()], error: null };
    const r = await listarEventos(7);
    expect(r).toHaveLength(1);
    expect(sb.chamadas).toContainEqual(["eventos_classe", "eq", "classe_id", 7]);
    expect(sb.chamadas).toContainEqual(["eventos_classe", "order", "inicio", { ascending: false }]);
    sb.resposta = { data: null, error: new Error("rls") };
    await expect(listarEventos(7)).rejects.toThrow("rls");
  });

  it("criar leva a turma; editar não leva turma nem status", async () => {
    await salvarEvento(7, payload);
    const ins = sb.chamadas.find((c) => c[1] === "insert");
    expect(ins[2]).toMatchObject({ classe_id: 7, titulo: "S" });
    expect(ins[2]).not.toHaveProperty("status");

    sb.chamadas = [];
    await salvarEvento(7, payload, "e1");
    const upd = sb.chamadas.find((c) => c[1] === "update");
    expect(upd[2]).not.toHaveProperty("classe_id");
    expect(upd[2]).not.toHaveProperty("status");
    expect(sb.chamadas).toContainEqual(["eventos_classe", "eq", "id", "e1"]);
  });

  it("propaga erro ao salvar", async () => {
    sb.resposta = { error: new Error("check") };
    await expect(salvarEvento(7, payload)).rejects.toThrow("check");
    await expect(salvarEvento(7, payload, "e1")).rejects.toThrow("check");
  });
});

describe("abrir / encerrar / excluir", () => {
  it("abrir devolve as guildas congeladas e encerrar chama a função certa", async () => {
    sb.rpc.mockResolvedValue({ data: { status: "aberto", guildas_congeladas: 12 }, error: null });
    await expect(abrirEvento("e1")).resolves.toBe(12);
    expect(sb.rpc).toHaveBeenCalledWith("evento_classe_abrir", { p_evento_id: "e1" });
    sb.rpc.mockResolvedValue({ data: { status: "encerrado" }, error: null });
    await encerrarEvento("e1");
    expect(sb.rpc).toHaveBeenLastCalledWith("evento_classe_encerrar", { p_evento_id: "e1" });
    sb.rpc.mockResolvedValue({ data: null, error: new Error("Só um rascunho pode ser aberto.") });
    await expect(abrirEvento("e1")).rejects.toThrow("rascunho");
    await expect(encerrarEvento("e1")).rejects.toThrow();
  });

  it("excluir só apaga rascunho e avisa quando nada foi apagado", async () => {
    sb.resposta = { data: [{ id: "e1" }], error: null };
    await excluirEvento("e1");
    expect(sb.chamadas).toContainEqual(["eventos_classe", "eq", "status", "rascunho"]);
    sb.resposta = { data: [], error: null };
    await expect(excluirEvento("e1")).rejects.toThrow("rascunho");
    sb.resposta = { data: null, error: new Error("boom") };
    await expect(excluirEvento("e1")).rejects.toThrow("boom");
  });
});

describe("traduzirErroDeEvento", () => {
  it("traduz restrições conhecidas e preserva mensagem curta do banco", () => {
    expect(traduzirErroDeEvento({ message: "violates check constraint eventos_classe_janela" }, "x")).toMatch(/depois do começo/);
    expect(traduzirErroDeEvento({ message: "eventos_classe_destaque_com_participacao" }, "x")).toMatch(/participação/);
    expect(traduzirErroDeEvento({ message: "Evento não encontrado ou sem permissão." }, "x")).toMatch(/permissão/);
    expect(traduzirErroDeEvento({ message: "Depois de aberto, o evento só aceita título e descrição." }, "x")).toMatch(/Depois de aberto/);
    expect(traduzirErroDeEvento({ message: "Escolha ao menos uma peça para o evento." }, "x")).toMatch(/peça/);
    expect(traduzirErroDeEvento(new Error(""), "padrão")).toBe("padrão");
    expect(traduzirErroDeEvento({ message: "x".repeat(300) }, "padrão")).toBe("padrão");
  });
});

describe("salvarTextoDoEvento", () => {
  it("manda só título e descrição", async () => {
    const { salvarTextoDoEvento } = await import("./eventosApi");
    await salvarTextoDoEvento("e1", "T", "D");
    const upd = sb.chamadas.find((c) => c[1] === "update");
    expect(upd[2]).toEqual({ titulo: "T", descricao: "D" });
    sb.resposta = { error: new Error("x") };
    await expect(salvarTextoDoEvento("e1", "T", "D")).rejects.toThrow("x");
  });
});

describe("listarResultado", () => {
  it("junta nomes, ordena guildas por posição e cai em rótulo neutro sem nome", async () => {
    const { listarResultado } = await import("./eventosApi");
    sb.porTabela = {
      eventos_classe_resultado: { data: [{ aluno_id: "a1", pontos: "30", participou: true, posicao: 1, destaque: true }, { aluno_id: "a2", pontos: 0, participou: false, posicao: null, destaque: false }], error: null },
      eventos_classe_resultado_guilda: { data: [{ guilda_id: "g2", pontos: 5, membros: 2, posicao: 2 }, { guilda_id: "g1", pontos: 9, membros: 3, posicao: 1 }], error: null },
      alunos: { data: [{ id: "a1", nome: " Ana " }], error: null },
      guildas: { data: [{ id: "g1", nome: "Lobos" }], error: null },
    };
    const r = await listarResultado("e1");
    expect(r.alunos.map((a) => [a.nome, a.pontos, a.destaque])).toEqual([["Ana", 30, true], ["Aluno", 0, false]]);
    expect(r.guildas.map((g) => [g.nome, g.posicao])).toEqual([["Lobos", 1], ["Guilda", 2]]);
  });

  it("sem linhas não consulta nomes e propaga erro", async () => {
    const { listarResultado } = await import("./eventosApi");
    await expect(listarResultado("e1")).resolves.toEqual({ alunos: [], guildas: [] });
    expect(sb.chamadas.some((c) => c[0] === "alunos")).toBe(false);
    sb.porTabela = { eventos_classe_resultado: { data: null, error: new Error("rls") } };
    await expect(listarResultado("e1")).rejects.toThrow("rls");
  });
});

describe("painel Durante", () => {
  it("mapearDurante normaliza números, nomes e situações", async () => {
    const { mapearDurante } = await import("./eventosApi");
    const p = mapearDurante({
      total: "10", comecaram: 6, pararam: null, nao_comecaram: 4, guildas_ativas: 2, guildas_total: 3,
      por_modalidade: { individual: 6, guilda: "4" },
      alunos: [{ aluno_id: "a", nome: " Ana ", situacao: "parou" }, { aluno_id: "b", nome: "", situacao: "xyz" }],
    });
    expect(p).toMatchObject({ total: 10, comecaram: 6, pararam: 0, naoComecaram: 4, guildasAtivas: 2, guildasTotal: 3, porModalidade: { individual: 6, guilda: 4 } });
    expect(p.alunos).toEqual([
      { alunoId: "a", nome: "Ana", situacao: "parou" },
      { alunoId: "b", nome: "Aluno", situacao: "nao_comecou" },
    ]);
  });

  it("resposta vazia vira painel zerado", async () => {
    const { mapearDurante } = await import("./eventosApi");
    expect(mapearDurante(null)).toMatchObject({ total: 0, alunos: [], porModalidade: { individual: 0, guilda: 0 } });
  });

  it("lerDurante chama a função do banco pelo evento e propaga erro", async () => {
    const { lerDurante } = await import("./eventosApi");
    sb.rpc.mockResolvedValue({ data: { total: 3, alunos: [] }, error: null });
    await expect(lerDurante("e1")).resolves.toMatchObject({ total: 3 });
    expect(sb.rpc).toHaveBeenCalledWith("evento_classe_durante", { p_evento_id: "e1" });
    sb.rpc.mockResolvedValue({ data: null, error: new Error("O evento ainda não foi aberto.") });
    await expect(lerDurante("e1")).rejects.toThrow("não foi aberto");
  });
});
