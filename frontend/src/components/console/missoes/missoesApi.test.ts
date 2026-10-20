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
      for (const m of ["select", "eq", "in", "is", "order", "delete", "update", "insert", "maybeSingle", "single"]) {
        q[m] = (...args: unknown[]) => (sb.chamadas.push([tabela, m, ...args]), q);
      }
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(sb.respostas[tabela] ?? { data: [], error: null, count: 0 }).then(resolve);
      return q;
    },
  },
}));
vi.mock("../trilha/topicsApi", () => ({ saveActivity: sb.saveActivity }));

import {
  contarEntregas,
  decidirMissao,
  duplicarMissao,
  excluirMissao,
  foiEntregue,
  gravarMoedas,
  listarMissoes,
  mapearMissao,
  moedasDe,
  salvarMissao,
} from "./missoesApi";
import type { Missao } from "./missoesApi";

const linhaDeEntrega = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  titulo: `M${id}`,
  descricao: "obj",
  janela_fim: "2026-10-20T23:59:00Z",
  criterio: { metrica: "atividade_especifica", atividade_id: 40 + id },
  origem: "professor",
  aprovacao: "nao_requer",
  ativa: true,
  atividade_origem_id: 40 + id,
  ...extra,
});

const linhaDeMeta = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  titulo: `Meta${id}`,
  descricao: "alvo",
  janela_fim: null,
  criterio: { metrica: "minutos_totais", minutos: 45 },
  origem: "ia",
  aprovacao: "aprovada",
  ativa: true,
  atividade_origem_id: null,
  ...extra,
});

const atividade = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  topico_id: 4,
  pontuacao_maxima: "50",
  topicos: { nome: "Cinemática" },
  ...extra,
});

const missaoDeEntrega: Missao = {
  id: 1,
  titulo: "M1",
  objetivo: "obj",
  prazo: null,
  criterio: { metrica: "atividade_especifica", atividade_id: 41 },
  criterioRotulo: "Concluir a atividade",
  origem: "professor",
  aprovacao: "nao_requer",
  motivoRecusa: null,
  escopo: "turma",
  ativa: true,
  caminho: "entrega",
  atividadeId: 41,
  topicoId: 4,
  topicoNome: "Cinemática",
  pontos: 50,
  moedas: 0,
  entregues: 0,
  total: 0,
};

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
  it("entrega: pega nota, tópico e entregas da atividade", () => {
    const m = mapearMissao(linhaDeEntrega(1), atividade(41), 3, 10);
    expect(m).toMatchObject({ caminho: "entrega", atividadeId: 41, topicoNome: "Cinemática", pontos: 50, entregues: 3, total: 10 });
  });

  it("entrega: tópico como lista, e sem nome vira rótulo", () => {
    expect(mapearMissao(linhaDeEntrega(1), atividade(41, { topicos: [{ nome: "X" }] }), 0, 0).topicoNome).toBe("X");
    expect(mapearMissao(linhaDeEntrega(1), atividade(41, { topicos: null }), 0, 0).topicoNome).toBe("Tópico 4");
  });

  it("meta: sem atividade, sem nota e sem tópico — e com rótulo do critério", () => {
    const m = mapearMissao(linhaDeMeta(2), null, 0, 10);
    expect(m).toMatchObject({
      caminho: "meta",
      atividadeId: null,
      topicoId: null,
      topicoNome: "—",
      pontos: 0,
      moedas: 0,
      criterioRotulo: "Minutos de estudo: 45 minutos",
      aprovacao: "aprovada",
      origem: "ia",
    });
  });

  it("lê escopo e motivo da recusa; escopo ausente vira turma", () => {
    expect(mapearMissao(linhaDeMeta(2, { escopo: "guilda", aprovacao: "recusada", motivo_recusa: "fora" }), null, 0, 0)).toMatchObject({
      escopo: "guilda",
      aprovacao: "recusada",
      motivoRecusa: "fora",
    });
    expect(mapearMissao(linhaDeMeta(2), null, 0, 0)).toMatchObject({ escopo: "turma", motivoRecusa: null });
  });

  it("descrição nula vira vazio em vez de 'null'", () => {
    expect(mapearMissao(linhaDeMeta(2, { descricao: null }), null, 0, 0).objetivo).toBe("");
  });
});

describe("listarMissoes", () => {
  it("lê `missoes` da turma e junta atividade, entregas e total de alunos", async () => {
    sb.respostas = {
      missoes: { data: [linhaDeEntrega(1), linhaDeMeta(2)], error: null },
      atividades: { data: [atividade(41)], error: null },
      atividade_aluno: { data: [{ atividade_id: 41, aluno_id: "a", status: "concluido" }], error: null },
      classe_aluno: { data: null, error: null, count: 10 },
    };
    const r = await listarMissoes(7);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ caminho: "entrega", entregues: 1, total: 10, pontos: 50 });
    expect(r[1]).toMatchObject({ caminho: "meta", entregues: 0, total: 10 });
    expect(sb.chamadas.some((c) => c[0] === "missoes" && c[1] === "eq" && c[2] === "classe_id" && c[3] === 7)).toBe(true);
  });

  it("deixa a diária do sistema de fora (ela tem painel próprio) e pede escopo e motivo", async () => {
    sb.respostas = { missoes: { data: [], error: null } };
    await listarMissoes(7);
    expect(sb.chamadas.some((c) => c[0] === "missoes" && c[1] === "is" && c[2] === "dia" && c[3] === null)).toBe(true);
    const select = sb.chamadas.find((c) => c[0] === "missoes" && c[1] === "select");
    expect(String(select![2])).toContain("escopo");
    expect(String(select![2])).toContain("motivo_recusa");
  });

  it("sem missão não faz as outras consultas", async () => {
    sb.respostas = { missoes: { data: [], error: null } };
    await expect(listarMissoes(7)).resolves.toEqual([]);
    expect(sb.chamadas.some((c) => c[0] === "atividade_aluno")).toBe(false);
  });

  it("só com missão-meta não busca atividade nem entregas — `in` com lista vazia traria tudo", async () => {
    sb.respostas = {
      missoes: { data: [linhaDeMeta(2)], error: null },
      classe_aluno: { data: null, error: null, count: 5 },
    };
    const r = await listarMissoes(7);
    expect(r[0]).toMatchObject({ caminho: "meta", total: 5 });
    expect(sb.chamadas.some((c) => c[0] === "atividades")).toBe(false);
    expect(sb.chamadas.some((c) => c[0] === "atividade_aluno")).toBe(false);
  });

  it("propaga erro de qualquer das leituras", async () => {
    sb.respostas = { missoes: { data: null, error: { message: "a" } } };
    await expect(listarMissoes(7)).rejects.toThrow("a");

    sb.respostas = { missoes: { data: [linhaDeEntrega(1)], error: null }, atividades: { data: null, error: { message: "b" } } };
    await expect(listarMissoes(7)).rejects.toThrow("b");

    sb.respostas = {
      missoes: { data: [linhaDeEntrega(1)], error: null },
      atividades: { data: [], error: null },
      atividade_aluno: { data: null, error: { message: "c" } },
    };
    await expect(listarMissoes(7)).rejects.toThrow("c");

    sb.respostas = {
      missoes: { data: [linhaDeEntrega(1)], error: null },
      atividades: { data: [], error: null },
      atividade_aluno: { data: [], error: null },
      classe_aluno: { data: null, error: { message: "d" } },
    };
    await expect(listarMissoes(7)).rejects.toThrow("d");
  });
});

describe("salvarMissao", () => {
  it("entrega: a atividade vem PRIMEIRO, porque o critério precisa do id dela", async () => {
    sb.saveActivity.mockResolvedValue(77);
    sb.respostas = { atividades: { data: { metadata: {} }, error: null }, missoes: { data: { id: 5 }, error: null } };

    const id = await salvarMissao(
      7,
      { escopo: "turma", origem: "professor", titulo: "M", descricao: "o", recompensa_tipo: "missao_concluida", janela_fim: null, criterio: null },
      { topico_id: 4, titulo: "M", descricao: "o", tipo: "missao", data_entrega: null, pontuacao_maxima: 50, moedas: 0 },
    );

    expect(id).toBe(5);
    expect(sb.saveActivity).toHaveBeenCalledWith(expect.objectContaining({ tipo: "missao", pontuacao_maxima: 50 }));
    const insert = sb.chamadas.find((c) => c[0] === "missoes" && c[1] === "insert");
    expect(insert![2]).toMatchObject({
      classe_id: 7,
      atividade_origem_id: 77,
      criterio: { metrica: "atividade_especifica", atividade_id: 77 },
    });
  });

  it("meta: não chama saveActivity e grava o critério como veio", async () => {
    sb.respostas = { missoes: { data: { id: 6 }, error: null } };
    const id = await salvarMissao(7, {
      escopo: "turma",
      origem: "professor",
      titulo: "Meta",
      descricao: "o",
      recompensa_tipo: "missao_concluida",
      janela_fim: null,
      criterio: { metrica: "minutos_totais", minutos: 30 },
    }, null);

    expect(id).toBe(6);
    expect(sb.saveActivity).not.toHaveBeenCalled();
    const insert = sb.chamadas.find((c) => c[0] === "missoes" && c[1] === "insert");
    expect(insert![2]).toMatchObject({ atividade_origem_id: null, criterio: { metrica: "minutos_totais", minutos: 30 } });
  });

  it("editar manda só o que muda — o resto é congelado pelo trigger", async () => {
    sb.respostas = { missoes: { data: { id: 9 }, error: null } };
    const id = await salvarMissao(7, {
      escopo: "turma", origem: "professor", titulo: "M", descricao: "o",
      recompensa_tipo: "missao_concluida", janela_fim: null, criterio: { metrica: "dias_seguidos", dias_seguidos: 3 },
    }, null, 9);

    expect(id).toBe(9);
    const update = sb.chamadas.find((c) => c[0] === "missoes" && c[1] === "update");
    expect(Object.keys(update![2] as object).sort()).toEqual(["criterio", "descricao", "janela_fim", "recompensa_tipo", "titulo"]);
  });

  it("propaga erro do insert", async () => {
    sb.respostas = { missoes: { data: null, error: { message: "rls" } } };
    await expect(
      salvarMissao(7, { escopo: "turma", origem: "professor", titulo: "M", descricao: "o", recompensa_tipo: "missao_concluida", janela_fim: null, criterio: {} }, null),
    ).rejects.toThrow("rls");
  });
});

describe("duplicarMissao", () => {
  it("entrega: copia a atividade pelo banco e aponta a cópia", async () => {
    sb.rpc.mockResolvedValue({ data: 99, error: null });
    sb.respostas = { missoes: { data: { id: 10, classe_id: 7 }, error: null } };
    const id = await duplicarMissao(missaoDeEntrega);
    expect(id).toBe(10);
    expect(sb.rpc).toHaveBeenCalledWith("duplicar_atividade", { p_atividade_id: 41, p_conteudo_id: null });
    const insert = sb.chamadas.find((c) => c[0] === "missoes" && c[1] === "insert");
    expect(insert![2]).toMatchObject({ atividade_origem_id: 99, criterio: { metrica: "atividade_especifica", atividade_id: 99 } });
  });

  it("meta: não chama o banco para duplicar atividade", async () => {
    sb.respostas = { missoes: { data: { id: 11, classe_id: 7 }, error: null } };
    await duplicarMissao({ ...missaoDeEntrega, caminho: "meta", atividadeId: null, criterio: { metrica: "dias_seguidos", dias_seguidos: 3 } });
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("a cópia nasce do professor, mesmo copiando missão da IA", async () => {
    // Com `origem = 'ia'` a cópia sairia congelada pelo `trg_missoes_guarda` e o professor não
    // conseguiria editar o que ele mesmo duplicou.
    sb.respostas = { missoes: { data: { id: 12, classe_id: 7 }, error: null } };
    await duplicarMissao({ ...missaoDeEntrega, origem: "ia", caminho: "meta", atividadeId: null });
    const insert = sb.chamadas.find((c) => c[0] === "missoes" && c[1] === "insert");
    expect(insert![2]).toMatchObject({ origem: "professor" });
  });

  it("a cópia mantém o escopo — duplicar a proposta de guilda não a abre para a turma", async () => {
    sb.respostas = { missoes: { data: { id: 13, classe_id: 7 }, error: null } };
    await duplicarMissao({ ...missaoDeEntrega, origem: "ia", escopo: "guilda", caminho: "meta", atividadeId: null });
    const insert = sb.chamadas.find((c) => c[0] === "missoes" && c[1] === "insert");
    expect(insert![2]).toMatchObject({ escopo: "guilda", origem: "professor" });
  });

  it("propaga erro da função do banco", async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: "rls" } });
    await expect(duplicarMissao(missaoDeEntrega)).rejects.toThrow("rls");
  });
});

describe("excluirMissao", () => {
  it("a missão sai ANTES da atividade, e os vínculos antes dela", async () => {
    await excluirMissao(3, 41);
    const ordem = sb.chamadas.filter((c) => c[1] === "delete").map((c) => c[0]);
    expect(ordem).toEqual(["missoes", "atividade_conteudos", "atividades"]);
  });

  it("meta: não tenta apagar atividade nenhuma", async () => {
    await excluirMissao(3, null);
    expect(sb.chamadas.filter((c) => c[1] === "delete").map((c) => c[0])).toEqual(["missoes"]);
  });

  it("para na missão se ela falhar, sem tocar a atividade", async () => {
    sb.respostas = { missoes: { data: null, error: { message: "fk" } } };
    await expect(excluirMissao(3, 41)).rejects.toThrow("fk");
    expect(sb.chamadas.some((c) => c[0] === "atividades" && c[1] === "delete")).toBe(false);
  });

  it("propaga o erro do banco ao apagar a atividade (ex.: entregas de alunos)", async () => {
    sb.respostas = { atividades: { data: null, error: { message: "23503" } } };
    await expect(excluirMissao(3, 41)).rejects.toThrow("23503");
  });
});

describe("decidirMissao", () => {
  it("aprovar limpa o motivo", async () => {
    await decidirMissao(5, true);
    const update = sb.chamadas.find((c) => c[0] === "missoes" && c[1] === "update");
    expect(update![2]).toEqual({ aprovacao: "aprovada", motivo_recusa: null });
  });

  it("recusar sem motivo não manda nulo — o CHECK do banco exige motivo", async () => {
    await decidirMissao(5, false, "   ");
    const update = sb.chamadas.find((c) => c[0] === "missoes" && c[1] === "update");
    expect(update![2]).toEqual({ aprovacao: "recusada", motivo_recusa: "Sem motivo informado." });
  });

  it("recusar com motivo guarda o motivo", async () => {
    await decidirMissao(5, false, " fora do conteúdo ");
    const update = sb.chamadas.find((c) => c[0] === "missoes" && c[1] === "update");
    expect(update![2]).toEqual({ aprovacao: "recusada", motivo_recusa: "fora do conteúdo" });
  });
});

describe("moedas da missão", () => {
  it("moedasDe lê só inteiro positivo", () => {
    expect(moedasDe({ moedas: 12 })).toBe(12);
    expect(moedasDe({ moedas: "12" })).toBe(12);
    for (const v of [{ moedas: 0 }, { moedas: -1 }, { moedas: 1.5 }, { moedas: "x" }, {}, null, "texto"]) {
      expect(moedasDe(v)).toBe(0);
    }
  });

  it("gravar mescla no metadata existente sem apagar o resto", async () => {
    sb.respostas = { atividades: { data: { metadata: { regras: { a: 1 }, moedas: 5 } }, error: null } };
    await gravarMoedas(9, 12);
    const update = sb.chamadas.find((c) => c[0] === "atividades" && c[1] === "update");
    expect(update![2]).toEqual({ metadata: { regras: { a: 1 }, moedas: 12 } });
  });

  it("zero remove a chave e metadata inválido vira objeto novo", async () => {
    sb.respostas = { atividades: { data: { metadata: { regras: 1, moedas: 5 } }, error: null } };
    await gravarMoedas(9, 0);
    expect(sb.chamadas.find((c) => c[0] === "atividades" && c[1] === "update")![2]).toEqual({ metadata: { regras: 1 } });

    sb.chamadas = [];
    sb.respostas = { atividades: { data: { metadata: [1, 2] }, error: null } };
    await gravarMoedas(9, 3);
    expect(sb.chamadas.find((c) => c[0] === "atividades" && c[1] === "update")![2]).toEqual({ metadata: { moedas: 3 } });
  });

  it("propaga erro de leitura e de escrita", async () => {
    sb.respostas = { atividades: { data: null, error: { message: "ler" } } };
    await expect(gravarMoedas(9, 1)).rejects.toThrow("ler");
  });

  it("entrega grava as moedas depois da atividade", async () => {
    sb.saveActivity.mockResolvedValue(9);
    sb.respostas = { atividades: { data: { metadata: {} }, error: null }, missoes: { data: { id: 5 }, error: null } };
    await salvarMissao(
      7,
      { escopo: "turma", origem: "professor", titulo: "M", descricao: "o", recompensa_tipo: "missao_concluida", janela_fim: null, criterio: null },
      { topico_id: 4, titulo: "M", descricao: "o", tipo: "missao", data_entrega: null, pontuacao_maxima: 50, moedas: 12 },
    );
    expect(sb.chamadas.find((c) => c[0] === "atividades" && c[1] === "update")![2]).toEqual({ metadata: { moedas: 12 } });
  });
});
