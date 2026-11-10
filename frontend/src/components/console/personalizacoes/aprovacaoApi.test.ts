import { beforeEach, describe, expect, it, vi } from "vitest";

const chamadas: Array<[string, unknown[]]> = [];
let paginas: unknown[][] = [];
let respostaRpc: { data: unknown; error: unknown } = { data: 0, error: null };

function consulta() {
  const q: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "order"]) {
    q[metodo] = (...args: unknown[]) => {
      chamadas.push([metodo, args]);
      return q;
    };
  }
  q.range = (...args: unknown[]) => {
    chamadas.push(["range", args]);
    return Promise.resolve({ data: paginas.shift() ?? [], error: null });
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      chamadas.push(["from", [tabela]]);
      return consulta();
    },
    rpc: (nome: string, args: unknown) => {
      chamadas.push(["rpc", [nome, args]]);
      return Promise.resolve(respostaRpc);
    },
  },
}));

import { decidirAprovacao, lerAprovacoesDaTurma } from "./aprovacaoApi";

beforeEach(() => {
  chamadas.length = 0;
  paginas = [];
  respostaRpc = { data: 0, error: null };
});

describe("lerAprovacoesDaTurma", () => {
  it("lê a turma direto do Supabase, página por página", async () => {
    paginas = [
      Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, aprovacao: "pendente" })),
      [{ id: 5000, aprovacao: "aprovado" }],
    ];
    const lidos = await lerAprovacoesDaTurma(32);
    expect(lidos).toHaveLength(1001);
    expect(lidos.at(-1)?.aprovacao).toBe("aprovado");
    expect(chamadas).toContainEqual(["from", ["conteudo_personalizado"]]);
    expect(chamadas).toContainEqual(["eq", ["classe_id", 32]]);
    expect(chamadas.filter(([m]) => m === "range").map(([, a]) => a)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});

describe("decidirAprovacao", () => {
  it("chama a RPC com os itens e a versão vista; motivo só na recusa", async () => {
    respostaRpc = { data: 2, error: null };
    const itens = [{ id: 1, versao: 3 }, { id: 2, versao: 1 }];
    expect(await decidirAprovacao(itens, "aprovado", "ignorado")).toBe(2);
    expect(chamadas).toContainEqual([
      "rpc",
      ["personalizacao_decidir", { p_itens: itens, p_decisao: "aprovado", p_motivo: null }],
    ]);
    await decidirAprovacao(itens, "recusado", "  tom errado ");
    expect(chamadas.at(-1)).toEqual([
      "rpc",
      ["personalizacao_decidir", { p_itens: itens, p_decisao: "recusado", p_motivo: "tom errado" }],
    ]);
  });

  it("não chama nada sem itens e repassa o erro do banco", async () => {
    expect(await decidirAprovacao([], "aprovado")).toBe(0);
    expect(chamadas).toEqual([]);
    respostaRpc = { data: null, error: { code: "40001", message: "mudou" } };
    await expect(decidirAprovacao([{ id: 1, versao: 1 }], "aprovado")).rejects.toMatchObject({ code: "40001" });
  });
});
