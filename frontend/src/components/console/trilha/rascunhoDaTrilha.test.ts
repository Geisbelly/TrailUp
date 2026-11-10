import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { criarGravador, lerLinhaDoRascunho, quandoFoiSalvo } from "./rascunhoDaTrilha";

const topico = (ordem: number, conteudos = 1) => ({
  nome: `Tópico ${ordem}`,
  descricao: "",
  ordem,
  depende: [],
  next: [],
  conteudos: Array.from({ length: conteudos }, (_, i) => ({ titulo: `C${i}`, tipo: "texto", conteudo: "..." })),
});

describe("lerLinhaDoRascunho", () => {
  it("lê pedido, tópicos e a data", () => {
    const r = lerLinhaDoRascunho({ pedido: { numTopics: 2 }, topicos: [topico(1), topico(2, 0)], updated_at: "2026-11-10T17:00:00Z" });
    expect(r?.pedido).toEqual({ numTopics: 2 });
    expect(r?.topicos.map((t) => t.ordem)).toEqual([1, 2]);
    expect(r?.atualizadoEm).toBe("2026-11-10T17:00:00Z");
  });

  it("sem linha, sem tópicos ou fora do formato é sem rascunho, sem lançar", () => {
    expect(lerLinhaDoRascunho(null)).toBeNull();
    expect(lerLinhaDoRascunho({ pedido: {}, topicos: [] })).toBeNull();
    expect(lerLinhaDoRascunho({ pedido: [], topicos: [topico(1)] })).toBeNull();
    expect(lerLinhaDoRascunho({ pedido: {}, topicos: [{ nome: "x" }] })).toBeNull();
  });
});

describe("criarGravador", () => {
  it("um save por vez, e o que chega durante um save vira só o mais novo", async () => {
    const gravados: number[] = [];
    let soltar: () => void = () => {};
    const salvar = vi.fn(
      (v: number) =>
        new Promise<void>((resolve) => {
          gravados.push(v);
          soltar = resolve;
        }),
    );
    const g = criarGravador(salvar);
    void g.agendar(1);
    void g.agendar(2);
    void g.agendar(3);
    expect(gravados).toEqual([1]);
    soltar();
    await Promise.resolve();
    await Promise.resolve();
    expect(gravados).toEqual([1, 3]);
    soltar();
    await g.esperar();
    expect(salvar).toHaveBeenCalledTimes(2);
  });

  it("falha num save não trava a fila", async () => {
    const gravados: number[] = [];
    const g = criarGravador(async (v: number) => {
      gravados.push(v);
      if (v === 1) throw new Error("rede");
    });
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    await g.agendar(1);
    await g.agendar(2);
    expect(gravados).toEqual([1, 2]);
    aviso.mockRestore();
  });

  it("cancelar descarta o que não saiu (para não recriar o rascunho depois de apagar)", async () => {
    const gravados: number[] = [];
    let soltar: () => void = () => {};
    const g = criarGravador(
      (v: number) =>
        new Promise<void>((resolve) => {
          gravados.push(v);
          soltar = resolve;
        }),
    );
    void g.agendar(1);
    void g.agendar(2);
    g.cancelar();
    soltar();
    await g.esperar();
    expect(gravados).toEqual([1]);
  });
});

describe("quandoFoiSalvo", () => {
  const agora = new Date("2026-11-10T18:00:00");
  it("minutos, hoje e outro dia", () => {
    expect(quandoFoiSalvo(new Date("2026-11-10T17:59:40").toISOString(), agora)).toBe("há pouco");
    expect(quandoFoiSalvo(new Date("2026-11-10T17:45:00").toISOString(), agora)).toBe("há 15 min");
    expect(quandoFoiSalvo(new Date("2026-11-10T09:05:00").toISOString(), agora)).toMatch(/^hoje às 09:05$/);
    expect(quandoFoiSalvo(new Date("2026-11-08T09:05:00").toISOString(), agora)).toMatch(/^em 08\/11 às 09:05$/);
  });

  it("sem data ou data inválida: vazio", () => {
    expect(quandoFoiSalvo(null, agora)).toBe("");
    expect(quandoFoiSalvo("x", agora)).toBe("");
  });
});
