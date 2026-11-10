import { describe, expect, it, vi } from "vitest";
import { gerarTrilhaEmEtapas, type TopicoDoEsqueleto } from "./gerarTrilhaEmEtapas";

const esqueleto: TopicoDoEsqueleto[] = [1, 2, 3].map((ordem) => ({
  nome: `Tópico ${ordem}`,
  descricao: `Descrição ${ordem}`,
  ordem,
  depende: ordem > 1 ? [ordem - 1] : [],
  next: ordem < 3 ? [ordem + 1] : [],
  arquivos_relacionados: [],
}));

const topicoDetalhado = (t: TopicoDoEsqueleto) => ({
  nome: t.nome,
  descricao: t.descricao,
  ordem: t.ordem,
  depende: t.depende,
  next: t.next,
  conteudos: [{ ref: "content:1", titulo: `Conteúdo de ${t.nome}`, tipo: "texto", conteudo: "...", cards: [], atividades: [], midias: [] }],
});

type Corpo = Record<string, unknown>;

/** Função falsa: responde o esqueleto e cada tópico; `falhar` decide quais pedidos de tópico lançam. */
function funcaoFalsa(falhar: (corpo: Corpo, chamada: number) => boolean = () => false) {
  const chamadas: Corpo[] = [];
  const invocar = vi.fn(async (corpo: Corpo) => {
    chamadas.push(corpo);
    if (corpo.mode === "trail-skeleton") return { topicos: esqueleto };
    if (corpo.mode === "trail-topic") {
      if (falhar(corpo, chamadas.length)) throw new Error("A IA demorou demais para responder. (ai_timeout)");
      return { topico: topicoDetalhado(corpo.topic as TopicoDoEsqueleto) };
    }
    throw new Error(`modo inesperado: ${String(corpo.mode)}`);
  });
  return { invocar, chamadas };
}

describe("gerarTrilhaEmEtapas", () => {
  it("pede o esqueleto uma vez e cada tópico numa requisição própria, nunca o modo trail inteiro", async () => {
    const { invocar, chamadas } = funcaoFalsa();
    const { topicos, semMaterial } = await gerarTrilhaEmEtapas({ invocar, corpo: { trailDescription: "Física", numTopics: 3 } });

    expect(chamadas.map((c) => c.mode)).toEqual(["trail-skeleton", "trail-topic", "trail-topic", "trail-topic"]);
    expect(chamadas.some((c) => c.mode === "trail")).toBe(false);
    expect(topicos.map((t) => t.ordem)).toEqual([1, 2, 3]);
    expect(topicos.every((t) => t.conteudos.length === 1)).toBe(true);
    expect(semMaterial).toEqual([]);
  });

  it("manda o corpo comum, a posição e o total em cada tópico", async () => {
    const { invocar, chamadas } = funcaoFalsa();
    await gerarTrilhaEmEtapas({ invocar, corpo: { trailDescription: "Física", sources: [{ titulo: "a.md" }] } });

    const pedidos = chamadas.filter((c) => c.mode === "trail-topic");
    expect(pedidos.map((c) => c.topicIndex).sort()).toEqual([0, 1, 2]);
    for (const pedido of pedidos) {
      expect(pedido.totalTopics).toBe(3);
      expect(pedido.trailDescription).toBe("Física");
      expect(pedido.sources).toEqual([{ titulo: "a.md" }]);
      expect(esqueleto[pedido.topicIndex as number]).toEqual(pedido.topic);
    }
  });

  it("mantém a ordem do esqueleto mesmo quando os tópicos terminam fora de ordem", async () => {
    const atrasos = [30, 0, 10];
    const invocar = async (corpo: Corpo) => {
      if (corpo.mode === "trail-skeleton") return { topicos: esqueleto };
      await new Promise((r) => setTimeout(r, atrasos[corpo.topicIndex as number]));
      return { topico: topicoDetalhado(corpo.topic as TopicoDoEsqueleto) };
    };
    const { topicos } = await gerarTrilhaEmEtapas({ invocar, corpo: {}, concorrencia: 3 });
    expect(topicos.map((t) => t.ordem)).toEqual([1, 2, 3]);
  });

  it("não passa da concorrência pedida", async () => {
    let emVoo = 0;
    let pico = 0;
    const invocar = async (corpo: Corpo) => {
      if (corpo.mode === "trail-skeleton") return { topicos: esqueleto };
      emVoo += 1;
      pico = Math.max(pico, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo -= 1;
      return { topico: topicoDetalhado(corpo.topic as TopicoDoEsqueleto) };
    };
    await gerarTrilhaEmEtapas({ invocar, corpo: {}, concorrencia: 2 });
    expect(pico).toBe(2);
  });

  it("repete numa requisição nova o tópico que falhou", async () => {
    let falhou = false;
    const { invocar, chamadas } = funcaoFalsa((corpo) => {
      if (corpo.topicIndex !== 1 || falhou) return false;
      falhou = true;
      return true;
    });
    const { topicos, semMaterial } = await gerarTrilhaEmEtapas({ invocar, corpo: {}, concorrencia: 1 });
    expect(chamadas.filter((c) => c.mode === "trail-topic" && c.topicIndex === 1)).toHaveLength(2);
    expect(topicos[1].conteudos).toHaveLength(1);
    expect(semMaterial).toEqual([]);
  });

  it("tópico que falha em todas as tentativas entra vazio, com as ligações, e é apontado", async () => {
    const { invocar } = funcaoFalsa((corpo) => corpo.topicIndex === 2);
    const { topicos, semMaterial } = await gerarTrilhaEmEtapas({ invocar, corpo: {} });

    expect(topicos.map((t) => t.ordem)).toEqual([1, 2, 3]);
    expect(topicos[2]).toMatchObject({ nome: "Tópico 3", ordem: 3, depende: [2], next: [], conteudos: [] });
    expect(semMaterial).toEqual([{ nome: "Tópico 3", ordem: 3, erro: "A IA demorou demais para responder. (ai_timeout)" }]);
  });

  it("se nenhum tópico vier, lança o erro em vez de devolver uma trilha só de nomes", async () => {
    const { invocar } = funcaoFalsa(() => true);
    await expect(gerarTrilhaEmEtapas({ invocar, corpo: {} })).rejects.toThrow("ai_timeout");
  });

  it("falha no esqueleto interrompe antes de pedir qualquer tópico", async () => {
    const invocar = vi.fn(async () => {
      throw new Error("Limite temporario do Gemini atingido. (gemini_rate_limit)");
    });
    await expect(gerarTrilhaEmEtapas({ invocar, corpo: {} })).rejects.toThrow("gemini_rate_limit");
    expect(invocar).toHaveBeenCalledTimes(1);
  });

  it("esqueleto sem tópicos é resposta inválida (função antiga não conhece o modo)", async () => {
    // Uma função ainda sem trail-skeleton cai no modo legado e devolve { conteudos, cards }.
    const invocar = vi.fn(async () => ({ conteudos: [], cards: [] }));
    await expect(gerarTrilhaEmEtapas({ invocar, corpo: {} })).rejects.toThrow("Resposta invalida da IA.");
    expect(invocar).toHaveBeenCalledTimes(1);
  });

  it("informa o progresso a cada tópico concluído", async () => {
    const { invocar } = funcaoFalsa();
    const progresso: Array<{ feitos: number; total: number }> = [];
    await gerarTrilhaEmEtapas({ invocar, corpo: {}, aoProgredir: (p) => progresso.push(p) });
    expect(progresso).toEqual([
      { feitos: 0, total: 3 },
      { feitos: 1, total: 3 },
      { feitos: 2, total: 3 },
      { feitos: 3, total: 3 },
    ]);
  });
});
