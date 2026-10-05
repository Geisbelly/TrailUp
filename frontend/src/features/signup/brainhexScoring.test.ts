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
    // ausente num item reverso vale o maximo: nao concordar com o reverso E
    // evidencia a favor do eixo. Explicito para ninguem "consertar" sem ver.
    expect(pontuarItem(undefined, true, MAX)).toBe(5);
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

describe("qualidadeDaResposta", () => {
  it("resposta variada e coerente tem confianca alta", () => {
    const q = qualidadeDaResposta({
      respostasBrutas: [5, 1, 4, 2, 3, 0],
      paresReversos: [{ direto: 5, reverso: 0 }, { direto: 1, reverso: 4 }],
      escalaMax: MAX,
    });
    expect(q.indice).toBeGreaterThan(0.9);
    expect(q.motivos).toEqual([]);
  });

  it("marcou tudo igual: confianca cai e o motivo fica escrito", () => {
    const q = qualidadeDaResposta({
      respostasBrutas: [5, 5, 5, 5, 5, 5],
      paresReversos: [{ direto: 5, reverso: 5 }],
      escalaMax: MAX,
    });
    expect(q.indice).toBeLessThan(0.5);
    expect(q.motivos).toContain("respostas quase todas iguais");
    expect(q.motivos).toContain("concordou com afirmacoes opostas");
  });

  it("aquiescencia: concordar com o item e com o reverso derruba a confianca", () => {
    const q = qualidadeDaResposta({
      respostasBrutas: [5, 5, 1, 0, 4, 2],
      paresReversos: [{ direto: 5, reverso: 5 }, { direto: 4, reverso: 5 }],
      escalaMax: MAX,
    });
    expect(q.aquiescencia).toBeGreaterThan(0.4);
    expect(q.motivos).toContain("concordou com afirmacoes opostas");
  });

  it("tempo implausivel por item conta contra", () => {
    const base = { respostasBrutas: [5, 1, 4, 2], paresReversos: [], escalaMax: MAX };
    const normal = qualidadeDaResposta({ ...base, segundosPorItem: 6 });
    const correndo = qualidadeDaResposta({ ...base, segundosPorItem: 0.4 });
    expect(correndo.indice).toBeLessThan(normal.indice);
    expect(correndo.motivos).toContain("tempo de resposta implausivel");
  });

  it("nunca zera: resposta ruim reduz confianca, nao apaga o perfil", () => {
    // O cadastro precisa entregar um perfil; o que muda e quanto confiar nele.
    const q = qualidadeDaResposta({
      respostasBrutas: [5, 5, 5, 5],
      paresReversos: [{ direto: 5, reverso: 5 }],
      escalaMax: MAX,
      segundosPorItem: 0.2,
    });
    expect(q.indice).toBeGreaterThanOrEqual(0.15);
    expect(q.indice).toBeLessThan(0.3);
  });

  it("sem pares reversos a aquiescencia nao e inventada", () => {
    const q = qualidadeDaResposta({
      respostasBrutas: [5, 1, 3],
      paresReversos: [],
      escalaMax: MAX,
    });
    expect(q.aquiescencia).toBe(0);
  });
});
