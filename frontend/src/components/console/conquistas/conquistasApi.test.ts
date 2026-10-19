import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({
  rpc: vi.fn(),
  config: { data: null as unknown, error: null as unknown },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: sb.rpc,
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => sb.config;
      return q;
    },
  },
}));

import { alternarConquista, criarConquistas, lerTeto, listarConquistasDaTurma, mapearConquista, salvarConquista, TETO_PADRAO, traduzirErro } from "./conquistasApi";
import type { LinhaDeConquista } from "./formulario";

const linha = (extra: Partial<LinhaDeConquista> = {}): LinhaDeConquista => ({
  nome: "Maratonista",
  descricao: "5 dias",
  escopo: "comum",
  perfil_alvo: null,
  criterio: { metrica: "dias_seguidos", dias_seguidos: 5 },
  pontos_recompensa: 20,
  ...extra,
});

const doBanco = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  nome: "Maratonista",
  descricao: null,
  escopo: "comum",
  perfil_alvo: null,
  criterio: { metrica: "dias_seguidos", dias_seguidos: 5, aparencia: { icone: "chama", cor: "#9b5de5" } },
  pontos_recompensa: 20,
  ativa: true,
  concedidas: "3",
  ...extra,
});

beforeEach(() => {
  sb.rpc.mockReset();
  sb.config = { data: null, error: null };
});

describe("mapearConquista", () => {
  it("converte a linha: descrição nula vira vazia, contagem em texto vira número", () => {
    const c = mapearConquista(doBanco())!;
    expect(c).toMatchObject({ id: 1, descricao: "", escopo: "comum", perfil: null, pontos: 20, ativa: true, concedidas: 3 });
    expect(c.criterio.metrica.chave).toBe("dias_seguidos");
    expect(c.criterio.aparencia).toEqual({ icone: "chama", cor: "#9b5de5" });
  });

  it("reconhece o perfil; perfil desconhecido vira null", () => {
    expect(mapearConquista(doBanco({ escopo: "perfil", perfil_alvo: "seeker" }))!.perfil).toBe("seeker");
    expect(mapearConquista(doBanco({ escopo: "perfil", perfil_alvo: "outro" }))!.perfil).toBeNull();
  });

  it("critério que a lista da turma não entende é descartado (null)", () => {
    expect(mapearConquista(doBanco({ criterio: { metrica: "eventos_totais", minimo: 3 } }))).toBeNull();
  });

  it("ativa ausente conta como ativa", () => {
    expect(mapearConquista(doBanco({ ativa: undefined }))!.ativa).toBe(true);
  });
});

describe("traduzirErro", () => {
  it("usa a mensagem do banco no teto e na validação, e uma fixa na permissão", () => {
    expect(traduzirErro({ code: "54000", message: "Esta turma já tem 20 conquistas (o teto)." })).toContain("20");
    expect(traduzirErro({ code: "22023", message: "O nome precisa ter de 3 a 60 caracteres." })).toContain("nome");
    expect(traduzirErro({ code: "42501" })).toContain("permissão");
  });
  it("erro desconhecido não vaza detalhe técnico", () => {
    expect(traduzirErro({ code: "XX000", message: "relation foo does not exist" })).not.toContain("relation");
    expect(traduzirErro(null)).toBeTruthy();
  });
});

describe("listarConquistasDaTurma", () => {
  it("chama a função da turma e devolve só o que a tela entende", async () => {
    sb.rpc.mockResolvedValue({ data: [doBanco(), doBanco({ id: 2, criterio: { metrica: "eventos_totais", minimo: 1 } })], error: null });
    const r = await listarConquistasDaTurma(7);
    expect(sb.rpc).toHaveBeenCalledWith("conquistas_da_turma", { p_classe_id: 7 });
    expect(r.map((c) => c.id)).toEqual([1]);
  });
  it("propaga o erro (a tela mostra erro, não lista vazia)", async () => {
    const erro = { code: "42501" };
    sb.rpc.mockResolvedValue({ data: null, error: erro });
    await expect(listarConquistasDaTurma(7)).rejects.toBe(erro);
  });
});

describe("lerTeto", () => {
  it("lê o valor do app_config", async () => {
    sb.config = { data: { valor: "12" }, error: null };
    await expect(lerTeto()).resolves.toBe(12);
  });
  it("sem linha, valor inválido ou erro: cai no padrão", async () => {
    await expect(lerTeto()).resolves.toBe(TETO_PADRAO);
    sb.config = { data: { valor: "abc" }, error: null };
    await expect(lerTeto()).resolves.toBe(TETO_PADRAO);
    sb.config = { data: { valor: "5" }, error: new Error("x") };
    await expect(lerTeto()).resolves.toBe(TETO_PADRAO);
  });
});

describe("salvarConquista", () => {
  it("manda a linha inteira para a função e devolve o id", async () => {
    sb.rpc.mockResolvedValue({ data: 55, error: null });
    await expect(salvarConquista(7, null, linha())).resolves.toBe(55);
    expect(sb.rpc).toHaveBeenCalledWith("conquista_da_turma_salvar", {
      p_classe_id: 7,
      p_id: null,
      p_nome: "Maratonista",
      p_descricao: "5 dias",
      p_escopo: "comum",
      p_perfil_alvo: null,
      p_criterio: { metrica: "dias_seguidos", dias_seguidos: 5 },
      p_pontos: 20,
    });
  });
});

describe("criarConquistas", () => {
  it("cria todas e devolve os ids", async () => {
    sb.rpc.mockResolvedValueOnce({ data: 1, error: null }).mockResolvedValueOnce({ data: 2, error: null });
    await expect(criarConquistas(7, [linha(), linha({ nome: "Outra" })])).resolves.toEqual({ criadas: [1, 2], erro: null });
  });

  it("para no primeiro erro e conta as que já entraram (sem esconder nem repetir)", async () => {
    sb.rpc
      .mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "54000", message: "Esta turma já tem 20 conquistas (o teto)." } });
    const r = await criarConquistas(7, [linha(), linha(), linha()]);
    expect(r.criadas).toEqual([1]);
    expect(r.erro).toContain("20");
    expect(sb.rpc).toHaveBeenCalledTimes(2);
  });
});

describe("alternarConquista", () => {
  it("chama a função e propaga erro", async () => {
    sb.rpc.mockResolvedValue({ data: null, error: null });
    await alternarConquista(3, false);
    expect(sb.rpc).toHaveBeenCalledWith("conquista_da_turma_alternar", { p_id: 3, p_ativa: false });
    sb.rpc.mockResolvedValue({ data: null, error: new Error("rls") });
    await expect(alternarConquista(3, true)).rejects.toThrow("rls");
  });
});
