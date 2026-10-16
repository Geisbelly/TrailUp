import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: sb.rpc } }));

import { lerBatalhas, mapearDuelo, mapearLinhaDoRanking } from "./batalhasApi";

beforeEach(() => sb.rpc.mockReset());

describe("mapearDuelo", () => {
  it("normaliza campos e descarta valores fora do catálogo", () => {
    const d = mapearDuelo({
      id: "d1", titulo: null, formato: "xyz", modo: "velocidade", status: "encerrado", resultado: "vitoria", vencedor_equipe: 2,
      guilda_nome: "Lobos", guilda_rival_nome: " ", created_at: "2026-10-10T10:00:00Z", aceitaram: "4",
      equipes: [{ equipe: 1, pontos: 5, integrantes: 2 }, { equipe: "2", pontos: null, integrantes: 2 }],
    });
    expect(d).toMatchObject({
      id: "d1", titulo: "", formato: "guilda", modo: "velocidade", resultado: "vitoria", vencedorEquipe: 2,
      guildaNome: "Lobos", rivalNome: null, aceitaram: 4,
    });
    expect(d.equipes).toEqual([{ equipe: 1, pontos: 5, integrantes: 2 }, { equipe: 2, pontos: 0, integrantes: 2 }]);
  });

  it("sem equipes nem resultado conhecido", () => {
    const d = mapearDuelo({ id: "d2", resultado: "outro", vencedor_equipe: 3, equipes: null });
    expect(d).toMatchObject({ resultado: null, vencedorEquipe: null, status: "aberto", equipes: [] });
  });
});

describe("mapearLinhaDoRanking / lerBatalhas", () => {
  it("nome vazio vira Guilda e números inválidos viram 0", () => {
    expect(mapearLinhaDoRanking({ guilda_id: "g", nome: "", vitorias: "x", empates: 1, duelos: 3 })).toEqual({
      guildaId: "g", nome: "Guilda", vitorias: 0, empates: 1, duelos: 3,
    });
  });

  it("chama a função do banco pela turma e propaga erro", async () => {
    sb.rpc.mockResolvedValue({ data: { duelos: [{ id: "d" }], ranking: [{ guilda_id: "g", nome: "A", vitorias: 2, empates: 0, duelos: 2 }] }, error: null });
    const r = await lerBatalhas(7);
    expect(sb.rpc).toHaveBeenCalledWith("arena_professor_resumo", { p_classe_id: 7 });
    expect(r.duelos).toHaveLength(1);
    expect(r.ranking[0]).toMatchObject({ nome: "A", vitorias: 2 });

    sb.rpc.mockResolvedValue({ data: null, error: new Error("sem permissão") });
    await expect(lerBatalhas(7)).rejects.toThrow("sem permissão");
  });

  it("resposta vazia vira listas vazias", async () => {
    sb.rpc.mockResolvedValue({ data: null, error: null });
    await expect(lerBatalhas(7)).resolves.toEqual({ duelos: [], ranking: [] });
  });
});
