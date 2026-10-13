import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({
  chamadas: [] as unknown[][],
  resposta: { data: [{ a: 1 }] as unknown, error: null as unknown },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (view: string) => ({
      select: (colunas: string) => {
        sb.chamadas.push(["from+select", view, colunas]);
        const q: Record<string, unknown> = {};
        for (const m of ["eq", "in", "gte", "order"]) {
          q[m] = (...args: unknown[]) => (sb.chamadas.push([m, ...args]), q);
        }
        q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(sb.resposta).then(resolve);
        return q;
      },
    }),
  },
}));

import { selectView } from "./supabaseViews";

beforeEach(() => {
  sb.chamadas = [];
  sb.resposta = { data: [{ a: 1 }], error: null };
});

describe("selectView", () => {
  it("lê a view com as colunas pedidas, e '*' por padrão", async () => {
    await selectView("vw_x", "a, b");
    await selectView("vw_y");
    expect(sb.chamadas).toEqual([["from+select", "vw_x", "a, b"], ["from+select", "vw_y", "*"]]);
  });

  it("aceita encadear filtros e ordenação antes de aguardar", async () => {
    const r = await selectView("vw_x").eq("classe_id", 3).in("perfil", ["a", "b"]).gte("dia", "2026-10-01").order("dia", { ascending: false });
    expect(r.data).toEqual([{ a: 1 }]);
    expect(sb.chamadas.slice(1)).toEqual([
      ["eq", "classe_id", 3],
      ["in", "perfil", ["a", "b"]],
      ["gte", "dia", "2026-10-01"],
      ["order", "dia", { ascending: false }],
    ]);
  });

  it("devolve o erro do banco no resultado, sem lançar", async () => {
    sb.resposta = { data: null, error: { message: "sem permissão" } };
    const r = await selectView("vw_x");
    expect(r.error).toEqual({ message: "sem permissão" });
  });
});
