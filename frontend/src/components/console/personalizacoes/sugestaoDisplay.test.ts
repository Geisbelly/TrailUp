import { describe, expect, it } from "vitest";

import type { SugestaoEfetividade, SugestaoHistoricoItem } from "./personalizacoesApi";
import {
  formatarDelta,
  formatarFracao,
  formatarPercentual,
  historicoMaisRecentePrimeiro,
  leiturasDeEfetividade,
  rotuloDaAcao,
  rotuloDoFormato,
} from "./sugestaoDisplay";

function efetividade(parcial: Partial<SugestaoEfetividade> = {}): SugestaoEfetividade {
  return {
    total_registros: 0,
    aderencia_media: null,
    n_aderencia: 0,
    taxa_seguiu_inicio: null,
    desempenho: {},
    revisoes: {},
    churn: {},
    ...parcial,
  };
}

const leitura = (efeito: SugestaoEfetividade, rotulo: string) =>
  leiturasDeEfetividade(efeito).find((item) => item.rotulo === rotulo)!;

describe("rotulos", () => {
  it("traduz os formatos canonicos", () => {
    expect(rotuloDoFormato("markdown")).toBe("Texto");
    expect(rotuloDoFormato("apresentacao")).toBe("Slides");
    expect(rotuloDoFormato("audio")).toBe("Áudio");
  });

  it("formato desconhecido aparece cru em vez de virar travessao", () => {
    // Melhor o professor ver "video" do que um campo vazio que parece bug.
    expect(rotuloDoFormato("video")).toBe("video");
    expect(rotuloDoFormato(null)).toBe("—");
  });

  it("traduz as tres acoes do log", () => {
    expect(rotuloDaAcao("criada")).toBe("Criada");
    expect(rotuloDaAcao("revisada")).toBe("Revisada");
    expect(rotuloDaAcao("mantida")).toBe("Mantida");
  });
});

describe("formatacao", () => {
  it("fracao vira percentual", () => {
    expect(formatarFracao(0.75)).toBe("75%");
    expect(formatarFracao(1)).toBe("100%");
  });

  it("nulo vira travessao e nunca zero por cento", () => {
    // A API usa null para "nao deu para medir"; 0% afirmaria que o aluno
    // ignorou a sugestao inteira.
    expect(formatarFracao(null)).toBe("—");
    expect(formatarFracao(undefined)).toBe("—");
    expect(formatarPercentual(null)).toBe("—");
  });

  it("zero de verdade continua zero", () => {
    expect(formatarFracao(0)).toBe("0%");
    expect(formatarPercentual(0)).toBe("0%");
  });

  it("delta positivo leva sinal", () => {
    expect(formatarDelta(12.4)).toBe("+12");
    expect(formatarDelta(-8)).toBe("-8");
    expect(formatarDelta(0)).toBe("0");
    expect(formatarDelta(null)).toBe("—");
  });
});

describe("leituras de efetividade", () => {
  it("esconde a diferenca de desempenho sem amostra nos dois lados", () => {
    const linha = leitura(
      efetividade({
        desempenho: { diferenca: 30, confiavel: false, n_seguiu: 8, n_ignorou: 1 },
      }),
      "Desempenho seguindo × ignorando"
    );

    expect(linha.valor).toBe("—");
    expect(linha.ressalva).toContain("8 seguiu / 1 ignorou");
  });

  it("publica a diferenca quando a API marca confiavel", () => {
    const linha = leitura(
      efetividade({
        desempenho: { diferenca: 30, confiavel: true, n_seguiu: 5, n_ignorou: 5 },
      }),
      "Desempenho seguindo × ignorando"
    );

    expect(linha.valor).toBe("+30 pts");
    expect(linha.ressalva).toBeNull();
  });

  it("revisao comparada mas em amostra pequena vem com ressalva junto do numero", () => {
    const linha = leitura(
      efetividade({ revisoes: { revisoes_comparadas: 2, delta_medio: 20, confiavel: false } }),
      "Efeito das revisões"
    );

    expect(linha.valor).toBe("+20 pts");
    expect(linha.ressalva).toContain("pouco para concluir");
  });

  it("sem revisao comparavel nao inventa numero", () => {
    const linha = leitura(
      efetividade({ revisoes: { revisoes_comparadas: 0, delta_medio: null } }),
      "Efeito das revisões"
    );

    expect(linha.valor).toBe("—");
    expect(linha.ressalva).toBe("nenhuma revisão comparável ainda");
  });

  it("aderencia sem periodo medido avisa em vez de mostrar vazio", () => {
    const linha = leitura(efetividade(), "Aderência média");

    expect(linha.valor).toBe("—");
    expect(linha.ressalva).toBe("sem período medido ainda");
  });

  it("aderencia com amostra sai sem ressalva", () => {
    const linha = leitura(
      efetividade({ aderencia_media: 0.8, n_aderencia: 4 }),
      "Aderência média"
    );

    expect(linha.valor).toBe("80%");
    expect(linha.ressalva).toBeNull();
  });

  it("churn alto e sinalizado como limiar mal calibrado", () => {
    const linha = leitura(
      efetividade({ churn: { revisoes_por_alvo: 2.5 } }),
      "Revisões por tópico"
    );

    expect(linha.valor).toBe("2.5");
    expect(linha.ressalva).toContain("trocando de lugar");
  });

  it("churn baixo nao alarma", () => {
    const linha = leitura(
      efetividade({ churn: { revisoes_por_alvo: 0.5 } }),
      "Revisões por tópico"
    );

    expect(linha.ressalva).toBeNull();
  });

  it("resumo vazio nao quebra e nao mostra numero algum", () => {
    const linhas = leiturasDeEfetividade(null);

    expect(linhas).toHaveLength(5);
    expect(linhas.every((linha) => linha.valor === "—")).toBe(true);
  });
});

describe("historico", () => {
  const item = (versao: number, topicoId: number): SugestaoHistoricoItem => ({
    versao,
    acao: "revisada",
    topico_id: topicoId,
    criado_em: null,
    motivos: [],
    ordem_sugerida: [],
    ordem_observada: [],
    aderencia: null,
    seguiu_inicio: null,
    desempenho: null,
    desempenho_posterior: null,
  });

  it("mais recente primeiro, agrupado por topico", () => {
    const ordenado = historicoMaisRecentePrimeiro([
      item(1, 10),
      item(3, 10),
      item(1, 20),
    ]);

    expect(ordenado.map((linha) => [linha.topico_id, linha.versao])).toEqual([
      [20, 1],
      [10, 3],
      [10, 1],
    ]);
  });

  it("nao muta a lista recebida", () => {
    const original = [item(1, 10), item(2, 10)];

    historicoMaisRecentePrimeiro(original);

    expect(original.map((linha) => linha.versao)).toEqual([1, 2]);
  });

  it("lista vazia nao quebra", () => {
    expect(historicoMaisRecentePrimeiro(null)).toEqual([]);
  });
});
