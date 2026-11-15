import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  avisoDoLote,
  pedidoDaSelecao,
  perfisDoPedido,
  perfisNaOrdem,
  totalDeMateriais,
  unidadesDaTurma,
} from "./geracaoEmLote";

const topicos = [
  { id: 10, nome: "Um" },
  { id: 11, nome: "Dois" },
  { id: 12, nome: "Tres" },
];
const conteudos = [
  { id: 100, topico_id: 10, titulo: "a" },
  { id: 101, topico_id: 10, titulo: "b" },
  { id: 110, topico_id: 11, titulo: "c" },
];
const todas = unidadesDaTurma(topicos, conteudos);

describe("unidadesDaTurma", () => {
  it("um por conteúdo, e o tópico sem conteúdo vira uma unidade sozinho", () => {
    expect(todas).toEqual([
      { topicoId: 10, conteudoId: 100 },
      { topicoId: 10, conteudoId: 101 },
      { topicoId: 11, conteudoId: 110 },
      { topicoId: 12, conteudoId: null },
    ]);
  });
});

describe("pedidoDaSelecao", () => {
  it("tópico com tudo marcado vai como tópico", () => {
    expect(pedidoDaSelecao(todas.filter((u) => u.topicoId !== 11), todas)).toEqual({
      topicoIds: [10, 12],
      conteudoIds: [],
    });
  });

  it("parte de um tópico vai como conteúdo, e os dois se misturam", () => {
    expect(pedidoDaSelecao([{ topicoId: 10, conteudoId: 101 }, { topicoId: 11, conteudoId: 110 }], todas)).toEqual({
      topicoIds: [11],
      conteudoIds: [101],
    });
  });

  it("nada marcado é pedido vazio (quem chama não envia)", () => {
    expect(pedidoDaSelecao([], todas)).toEqual({ topicoIds: [], conteudoIds: [] });
  });
});

describe("perfis", () => {
  it("normaliza, tira repetida e põe na ordem canônica", () => {
    expect(perfisNaOrdem(["Achiever", " socialiser", "seeker", "seeker", "outro"])).toEqual(["seeker", "socializer", "achiever"]);
  });

  it("exatamente os da turma vai vazio, para o worker seguir filtrando pela turma", () => {
    expect(perfisDoPedido(["achiever", "seeker"], ["seeker", "achiever"])).toEqual([]);
  });

  it("qualquer outra escolha vai explícita", () => {
    expect(perfisDoPedido(["seeker"], ["seeker", "achiever"])).toEqual(["seeker"]);
    expect(perfisDoPedido(["seeker", "achiever", "daredevil"], ["seeker", "achiever"])).toEqual(["seeker", "daredevil", "achiever"]);
  });

  it("turma sem perfil: vai o que foi escolhido", () => {
    expect(perfisDoPedido(["conqueror"], [])).toEqual(["conqueror"]);
    expect(perfisDoPedido([], [])).toEqual([]);
  });
});

describe("totalDeMateriais e avisoDoLote", () => {
  it("unidades × perfis", () => {
    expect(totalDeMateriais(4, 7)).toBe(28);
    expect(totalDeMateriais(4, 0)).toBe(0);
  });

  it("diz se o job é novo, o mesmo ou retomado", () => {
    const base = { job_id: "j", kind: "manual_profile_generate", status: "pending", total_targets: 8 };
    expect(avisoDoLote({ ...base, existente: false, retomado: false })).toBe("8 materiais entraram na fila de geração.");
    expect(avisoDoLote({ ...base, existente: true, retomado: false })).toMatch(/já está na fila/);
    expect(avisoDoLote({ ...base, existente: true, retomado: true, alvos_reabertos: 1 })).toMatch(/só o que faltava \(1 material\)/);
  });
});
