import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({
  rpc: vi.fn(),
  inserts: [] as { tabela: string; payload: unknown }[],
  deletes: [] as { tabela: string; filtro: unknown }[],
  lido: { data: null as unknown, error: null as unknown },
  inserido: { data: { id: 99 } as unknown, error: null as unknown },
  escrita: { error: null as unknown },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: sb.rpc,
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.insert = (payload: unknown) => {
        sb.inserts.push({ tabela, payload });
        return q;
      };
      q.delete = () => {
        const d = { match: (filtro: unknown) => { sb.deletes.push({ tabela, filtro }); return Promise.resolve(sb.escrita); } };
        return d;
      };
      // select(...).eq(...).single() devolve a linha lida; insert(...).select(...).single() devolve o id novo
      q.single = async () => (sb.inserts.length > 0 && sb.inserts[sb.inserts.length - 1].tabela === tabela ? sb.inserido : sb.lido);
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(sb.escrita).then(resolve);
      return q;
    },
  },
}));

import { duplicateActivity, duplicateCard, toggleActivityLinkApi } from "./topicsApi";

beforeEach(() => {
  sb.rpc.mockReset();
  sb.inserts = [];
  sb.deletes = [];
  sb.lido = { data: null, error: null };
  sb.inserido = { data: { id: 99 }, error: null };
  sb.escrita = { error: null };
});

describe("duplicateActivity", () => {
  it("chama a função do banco com a atividade e o conteúdo, e devolve o id da cópia", async () => {
    sb.rpc.mockResolvedValue({ data: 555, error: null });
    await expect(duplicateActivity(7, 3)).resolves.toBe(555);
    expect(sb.rpc).toHaveBeenCalledWith("duplicar_atividade", { p_atividade_id: 7, p_conteudo_id: 3 });
  });

  it("propaga o erro do banco (ex.: sem permissão)", async () => {
    const erro = { message: "Atividade não encontrada ou sem permissão para duplicar.", code: "42501" };
    sb.rpc.mockResolvedValue({ data: null, error: erro });
    await expect(duplicateActivity(7, 3)).rejects.toBe(erro);
  });
});

describe("duplicateCard", () => {
  const original = { conteudo_id: 3, conteudo_origem_id: 1, titulo: "Deslocamento", descricao: "d", imagem_url: null, cor: "#fff", ordem: 2 };

  it("copia conteúdo, origem, cor e ordem, com '(cópia)' no título", async () => {
    sb.lido = { data: original, error: null };
    await expect(duplicateCard(10)).resolves.toBe(99);
    expect(sb.inserts).toHaveLength(1);
    expect(sb.inserts[0]).toEqual({ tabela: "cards", payload: { ...original, titulo: "Deslocamento (cópia)" } });
  });

  it("duplicar uma cópia não empilha '(cópia) (cópia)'", async () => {
    sb.lido = { data: { ...original, titulo: "Deslocamento (cópia)" }, error: null };
    await duplicateCard(10);
    expect((sb.inserts[0].payload as { titulo: string }).titulo).toBe("Deslocamento (cópia)");
  });

  it("card sem título ganha um nome", async () => {
    sb.lido = { data: { ...original, titulo: null }, error: null };
    await duplicateCard(10);
    expect((sb.inserts[0].payload as { titulo: string }).titulo).toBe("Card (cópia)");
  });

  it("se não consegue ler o card, não insere nada", async () => {
    sb.lido = { data: null, error: new Error("negado") };
    await expect(duplicateCard(10)).rejects.toThrow("negado");
    expect(sb.inserts).toHaveLength(0);
  });

  it("propaga o erro do insert", async () => {
    sb.lido = { data: original, error: null };
    sb.inserido = { data: null, error: new Error("duplicado") };
    await expect(duplicateCard(10)).rejects.toThrow("duplicado");
  });
});

describe("toggleActivityLinkApi", () => {
  it("vincular insere em atividade_conteudos", async () => {
    await toggleActivityLinkApi(3, 7, true);
    expect(sb.inserts).toEqual([{ tabela: "atividade_conteudos", payload: { atividade_id: 7, conteudo_id: 3 } }]);
  });

  it("desvincular apaga só aquele par", async () => {
    await toggleActivityLinkApi(3, 7, false);
    expect(sb.deletes).toEqual([{ tabela: "atividade_conteudos", filtro: { atividade_id: 7, conteudo_id: 3 } }]);
  });

  it("propaga erro ao desvincular", async () => {
    sb.escrita = { error: new Error("rls") };
    await expect(toggleActivityLinkApi(3, 7, false)).rejects.toThrow("rls");
  });

  it("propaga erro ao vincular", async () => {
    sb.escrita = { error: new Error("fk") };
    await expect(toggleActivityLinkApi(3, 7, true)).rejects.toThrow("fk");
  });
});
