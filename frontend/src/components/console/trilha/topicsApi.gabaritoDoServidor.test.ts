import { beforeEach, describe, expect, it, vi } from "vitest";

type Chamada = { tabela: string; op: string; payload?: unknown; opcoes?: unknown; filtros: [string, unknown][]; colunas?: string };

const sb = vi.hoisted(() => ({
  chamadas: [] as Chamada[],
  erro: null as unknown,
  linhas: {} as Record<string, unknown>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      const c: Chamada = { tabela, op: "select", filtros: [] };
      sb.chamadas.push(c);
      const q: Record<string, unknown> = {};
      q.insert = (p: unknown) => ((c.op = "insert"), (c.payload = p), q);
      q.update = (p: unknown) => ((c.op = "update"), (c.payload = p), q);
      q.upsert = (p: unknown, o: unknown) => ((c.op = "upsert"), (c.payload = p), (c.opcoes = o), q);
      q.select = (colunas: string) => ((c.colunas = colunas), q);
      q.eq = (col: string, v: unknown) => (c.filtros.push([col, v]), q);
      q.single = async () => ({ data: { id: 77 }, error: sb.erro });
      q.maybeSingle = async () => ({ data: sb.erro ? null : (sb.linhas[tabela] ?? null), error: sb.erro });
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: sb.erro }).then(resolve);
      return q;
    },
  },
}));

import { fetchGabaritoDoServidor, saveGabaritoDoServidor, saveQuestion } from "./topicsApi";

beforeEach(() => {
  sb.chamadas = [];
  sb.erro = null;
  sb.linhas = {};
});

describe("saveGabaritoDoServidor", () => {
  it("upsert em questao_gabarito por questao_id, com a esperada e os critérios", async () => {
    await saveGabaritoDoServidor(12, { respostaCorreta: "10 m/s", criterios: { tolerancia: 0.01, tipo_tolerancia: "relativa" } });
    expect(sb.chamadas).toHaveLength(1);
    expect(sb.chamadas[0]).toMatchObject({
      tabela: "questao_gabarito",
      op: "upsert",
      payload: { questao_id: 12, resposta_correta: "10 m/s", criterios: { tolerancia: 0.01, tipo_tolerancia: "relativa" } },
      opcoes: { onConflict: "questao_id" },
    });
  });

  it("erro sobe: gabarito perdido em silêncio deixaria a questão sem correção", async () => {
    sb.erro = { message: "permission denied" };
    await expect(saveGabaritoDoServidor(12, { respostaCorreta: "x", criterios: null })).rejects.toBeTruthy();
  });
});

describe("saveQuestion com config_resposta", () => {
  it("vai na escrita quando informada", async () => {
    await saveQuestion({ atividade_id: 4, enunciado: "x", tipo: "numerica", resposta_correta: null, config_resposta: { dimensao: "velocidade" } });
    expect(sb.chamadas[0].payload).toMatchObject({ tipo: "numerica", resposta_correta: null, config_resposta: { dimensao: "velocidade" } });
  });

  it("ausente não mexe na coluna", async () => {
    await saveQuestion({ id: 3, atividade_id: 4, enunciado: "x", tipo: "multipla" });
    expect(sb.chamadas[0].payload).not.toHaveProperty("config_resposta");
  });
});

describe("fetchGabaritoDoServidor", () => {
  it("lê a esperada e os critérios de questao_gabarito e a config de questoes", async () => {
    sb.linhas = {
      questao_gabarito: { resposta_correta: "2x + 2", criterios: { dominio: [-5, 5], pontos: 20 } },
      questoes: { config_resposta: { variaveis: ["x"] } },
    };
    expect(await fetchGabaritoDoServidor(9)).toEqual({
      resposta_correta: "2x + 2",
      criterios: { dominio: [-5, 5], pontos: 20 },
      config_resposta: { variaveis: ["x"] },
    });
    expect(sb.chamadas.map((c) => [c.tabela, c.filtros])).toEqual([
      ["questao_gabarito", [["questao_id", 9]]],
      ["questoes", [["id", 9]]],
    ]);
  });

  it("sem linha, tudo nulo", async () => {
    expect(await fetchGabaritoDoServidor(9)).toEqual({ resposta_correta: null, criterios: null, config_resposta: null });
  });

  it("erro de leitura sobe", async () => {
    sb.erro = { message: "x" };
    await expect(fetchGabaritoDoServidor(9)).rejects.toBeTruthy();
  });
});
