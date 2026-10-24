import { describe, expect, it } from "vitest";

import {
  centrarPorRespondente,
  mediaPorEixo,
  pontuarItem,
  qualidadeDaResposta,
  type ItemPontuado,
} from "./brainhexScoring";

const MAX = 5;

describe("pontuarItem", () => {
  it("item direto vale a resposta", () => {
    expect(pontuarItem(4, false, MAX)).toBe(4);
  });

  it("item reverso inverte", () => {
    expect(pontuarItem(4, true, MAX)).toBe(1);
    expect(pontuarItem(0, true, MAX)).toBe(5);
  });

  it("resposta ausente ou invalida nao quebra nem vira NaN", () => {
    expect(pontuarItem(undefined, false, MAX)).toBe(0);
    expect(pontuarItem(Number.NaN, false, MAX)).toBe(0);
    // Ausência não é evidência de preferência, mesmo no item reverso.
    expect(pontuarItem(undefined, true, MAX)).toBe(0);
  });

  it("resposta fora da escala e limitada", () => {
    expect(pontuarItem(99, false, MAX)).toBe(5);
    expect(pontuarItem(-3, false, MAX)).toBe(0);
  });
});

describe("mediaPorEixo", () => {
  it("usa media, nao soma: eixos com contagens diferentes ficam comparaveis", () => {
    // O defeito real: `immersion` tinha 3 itens e os outros 4.
    const itens: ItemPontuado[] = [
      { id: "a1", axis: "curiosity", valor: 4, reverso: false },
      { id: "a2", axis: "curiosity", valor: 4, reverso: false },
      { id: "a3", axis: "curiosity", valor: 4, reverso: false },
      { id: "a4", axis: "curiosity", valor: 4, reverso: false },
      { id: "i1", axis: "immersion", valor: 4, reverso: false },
      { id: "i2", axis: "immersion", valor: 4, reverso: false },
      { id: "i3", axis: "immersion", valor: 4, reverso: false },
    ];
    const porEixo = mediaPorEixo(itens);
    expect(porEixo.curiosity).toBe(4);
    expect(porEixo.immersion).toBe(4);
  });
});

describe("centrarPorRespondente", () => {
  it("quem marca tudo igual fica com todos os eixos em zero", () => {
    // O caso que o escore antigo resolvia pelos PESOS do mapeamento: sem
    // preferencia declarada, nenhum eixo pode se destacar.
    const centrado = centrarPorRespondente({ a: 5, b: 5, c: 5 });
    expect(Object.values(centrado).every((v) => Math.abs(v) < 1e-9)).toBe(true);
  });

  it("preserva a ordem e mede distancia da propria media", () => {
    const centrado = centrarPorRespondente({ a: 5, b: 3, c: 1 });
    expect(centrado.a).toBeGreaterThan(0);
    expect(centrado.b).toBeCloseTo(0);
    expect(centrado.c).toBeLessThan(0);
    expect(centrado.a).toBeCloseTo(2);
  });

  it("dois respondentes com a mesma PREFERENCIA e escalas diferentes convergem", () => {
    // O generoso marca alto em tudo; o severo marca baixo em tudo. A ordem de
    // preferencia e a mesma, e e isso que o perfil deveria capturar.
    const generoso = centrarPorRespondente({ a: 5, b: 4, c: 3 });
    const severo = centrarPorRespondente({ a: 3, b: 2, c: 1 });
    expect(generoso.a).toBeCloseTo(severo.a);
    expect(generoso.c).toBeCloseTo(severo.c);
  });
});

describe("qualidadeDaResposta — descritores sem diagnóstico", () => {
  const base = { respostasBrutas: [5, 1, 4, 2, 3, 0],
    paresReversos: [{ direto: 5, reverso: 0 }], escalaMax: MAX };

  it("não transforma coerência, uniformidade ou divergência em certeza", () => {
    for (const respostas of [[5, 1, 4, 2], [5, 5, 5, 5], [0, 0, 0, 0]]) {
      const q = qualidadeDaResposta({ ...base, respostasBrutas: respostas });
      expect(q.indice).toBeNull();
      expect(q.motivos).toEqual(["instrumento exploratorio; confianca nao estimada"]);
    }
  });

  it("descreve divergência nos pares sem concluir que houve aquiescência", () => {
    const q = qualidadeDaResposta({ ...base, paresReversos: [{ direto: 5, reverso: 5 }] });
    expect(q.aquiescencia).toBe(1); // nome legado; sem diagnóstico causal
    expect(q.indice).toBeNull();
  });

  it("não penaliza tempo sem limiar validado", () => {
    expect(qualidadeDaResposta({ ...base, segundosPorItem: 0.1 }))
      .toEqual(qualidadeDaResposta({ ...base, segundosPorItem: 10 }));
  });

  it("descreve variância e ausência de pares sem fabricar confiança", () => {
    const q = qualidadeDaResposta({ ...base, respostasBrutas: [0, 5], paresReversos: [] });
    expect(q.desvio).toBe(2.5);
    expect(q.aquiescencia).toBe(0);
    expect(q.indice).toBeNull();
  });
});
