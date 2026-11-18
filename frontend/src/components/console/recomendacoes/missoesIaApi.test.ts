import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data?: unknown; error?: unknown; count?: number | null; status?: number };
const sb = vi.hoisted(() => ({
  /** Uma lista é uma fila: cada consulta à tabela leva a próxima resposta. */
  respostas: {} as Record<string, Resp | Resp[]>,
  chamadas: [] as unknown[][],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      let head = false;
      for (const m of ["select", "eq", "in", "is", "gte", "order", "limit", "update"]) {
        q[m] = (...args: unknown[]) => {
          sb.chamadas.push([tabela, m, ...args]);
          if (m === "select" && (args[1] as { head?: boolean } | undefined)?.head) head = true;
          return q;
        };
      }
      q.then = (resolve: (v: unknown) => unknown) => {
        const r = sb.respostas[tabela];
        let v = Array.isArray(r) ? r.shift() : r;
        // Como o postgrest-js 2.86 de verdade: HEAD não tem corpo, então o erro chega sem `code`,
        // só `{ message: "" }`, e o que diz qual erro foi se perde.
        if (head && v?.error) v = { ...v, data: null, error: { message: "" }, count: null, status: 400 };
        return Promise.resolve(v ?? { data: [], error: null, count: 0 }).then(resolve);
      };
      return q;
    },
  },
}));
vi.mock("../trilha/topicsApi", () => ({ saveActivity: vi.fn() }));

import { contarPendentesDeMissao, listarDecididas, listarPendentes } from "./missoesIaApi";
import { taxaDeAprovacao } from "./missoesIa";

const filtrouDesafio = () => sb.chamadas.some((c) => c[0] === "missoes" && c[1] === "is" && c[2] === "desafio" && c[3] === null);
const semColuna = { data: null, error: { code: "42703", message: "column missoes.desafio does not exist" } };

beforeEach(() => {
  sb.respostas = {};
  sb.chamadas = [];
});

describe("painel das missões da IA sem os desafios", () => {
  it("a taxa de aprovação da IA ignora desafios", async () => {
    // O desafio nasce `origem = 'ia'` e `aprovada`, sem passar por pedido nem decisão: contá-lo
    // inflaria a taxa. Quem o tira é o filtro da leitura, então o banco devolve só as comuns.
    sb.respostas = { missoes: { data: [{ id: 1, aprovacao: "aprovada" }, { id: 2, aprovacao: "recusada" }], error: null } };
    const { missoes, erro } = await listarDecididas([7]);
    expect(erro).toBeNull();
    expect(filtrouDesafio()).toBe(true);
    expect(taxaDeAprovacao(missoes)).toMatchObject({ aprovadas: 1, decididas: 2, pct: 50 });
  });

  it("as pendentes e a contagem do menu também deixam o desafio de fora", async () => {
    await listarPendentes([7]);
    expect(filtrouDesafio()).toBe(true);
    sb.chamadas = [];
    await contarPendentesDeMissao();
    expect(filtrouDesafio()).toBe(true);
  });

  it("banco sem a #1149: repete sem o filtro, e o painel não some", async () => {
    sb.respostas = { missoes: [semColuna, { data: [{ id: 1, aprovacao: "aprovada" }], error: null }] };
    const decididas = await listarDecididas([7]);
    expect(decididas.erro).toBeNull();
    expect(decididas.missoes).toHaveLength(1);
    const consultas = sb.chamadas.filter((c) => c[0] === "missoes" && c[1] === "select");
    expect(consultas).toHaveLength(2);
    expect(sb.chamadas.filter((c) => c[1] === "is" && c[2] === "desafio")).toHaveLength(1);
    // Os outros filtros continuam na segunda leitura.
    expect(sb.chamadas.filter((c) => c[1] === "eq" && c[2] === "origem")).toHaveLength(2);

    sb.chamadas = [];
    sb.respostas = { missoes: [semColuna, { data: [{ id: 3, aprovacao: "pendente" }], error: null }] };
    const pendentes = await listarPendentes([7]);
    expect(pendentes).toMatchObject({ erro: null, missoes: [{ id: 3 }] });

    sb.chamadas = [];
    sb.respostas = { missoes: [semColuna, { data: [{ id: 9 }], error: null, count: 2 }] };
    await expect(contarPendentesDeMissao()).resolves.toBe(2);
    // GET com limite, não HEAD: o HEAD perderia o código do erro.
    expect(sb.chamadas.filter((c) => c[1] === "select").every((c) => !(c[3] as { head?: boolean } | undefined)?.head)).toBe(true);
    expect(sb.chamadas.filter((c) => c[1] === "limit")).toEqual([["missoes", "limit", 1], ["missoes", "limit", 1]]);
  });

  it("outro erro não é repetido e chega ao painel", async () => {
    sb.respostas = { missoes: [{ data: null, error: { code: "42501", message: "sem permissão" } }, { data: [], error: null }] };
    const r = await listarDecididas([7]);
    expect(r.erro).toMatchObject({ code: "42501" });
    expect(sb.chamadas.filter((c) => c[1] === "select")).toHaveLength(1);
  });
});
