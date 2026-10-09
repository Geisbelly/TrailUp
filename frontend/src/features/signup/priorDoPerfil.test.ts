import { describe, expect, it } from "vitest";

import { BRAINHEX_QUESTIONS, SCALE_MAX } from "./brainhex";
import { PERFIS_EM_ORDEM } from "./brainhexOrdenacao";
import {
  afinidadeEmPercentual,
  calcularPrior,
  computarPerfil,
  perfilDominante,
} from "./priorDoPerfil";

const ORDEM = [...PERFIS_EM_ORDEM];
const responder = (valor: (q: (typeof BRAINHEX_QUESTIONS)[number]) => number) =>
  Object.fromEntries(BRAINHEX_QUESTIONS.map((q) => [q.id, valor(q)]));

describe("calcularPrior", () => {
  it("quem marca tudo no maximo tem confianca baixa e motivos escritos", () => {
    // Antes, esta pessoa recebia um perfil decidido pelos pesos do mapeamento,
    // com confianca implicita de 100%.
    const prior = calcularPrior({ answers: responder(() => SCALE_MAX), ordenacao: ORDEM });
    expect(prior.confianca).toBeLessThan(0.5);
    expect(prior.qualidade.motivos.length).toBeGreaterThan(0);
  });

  it("com a escala sem informacao, o dominante vem da ordem declarada", () => {
    const prior = calcularPrior({ answers: responder(() => 3), ordenacao: ORDEM });
    expect(perfilDominante(prior.afinidade)).toBe(ORDEM[0]);
  });

  it("resposta coerente tem confianca alta", () => {
    // Concorda com o direto, discorda do reverso: padrao coerente.
    const prior = calcularPrior({
      answers: responder((q) => (q.reverse ? 1 : 4)),
      ordenacao: ORDEM,
    });
    expect(prior.confianca).toBeGreaterThan(0.6);
  });

  it("a concordancia entre metodos sai no resultado", () => {
    const prior = calcularPrior({ answers: responder((q) => (q.reverse ? 1 : 4)), ordenacao: ORDEM });
    expect(prior.concordancia).toBeGreaterThanOrEqual(-1);
    expect(prior.concordancia).toBeLessThanOrEqual(1);
  });

  it("devolve os sete perfis, sempre", () => {
    const prior = calcularPrior({ answers: responder(() => 3), ordenacao: ORDEM });
    expect(Object.keys(prior.afinidade).sort()).toEqual([...PERFIS_EM_ORDEM].sort());
  });

  it("questionario em branco nao quebra e nao finge confianca", () => {
    const prior = calcularPrior({ answers: {}, ordenacao: ORDEM });
    expect(Number.isFinite(prior.confianca)).toBe(true);
    expect(prior.confianca).toBeLessThanOrEqual(1);
    expect(perfilDominante(prior.afinidade)).toBe(ORDEM[0]);
  });

  it("ordenacao invalida levanta antes de gravar qualquer coisa", () => {
    expect(() => calcularPrior({ answers: responder(() => 3), ordenacao: ["seeker"] })).toThrow();
  });

  it("tempo por item implausivel derruba a confianca", () => {
    const base = { answers: responder((q) => (q.reverse ? 1 : 4)), ordenacao: ORDEM };
    const calmo = calcularPrior({ ...base, segundosPorItem: 5 });
    const correndo = calcularPrior({ ...base, segundosPorItem: 0.3 });
    expect(correndo.confianca).toBeLessThan(calmo.confianca);
  });
});

describe("perfilDominante", () => {
  it("empate resolve pelo nome, deterministicamente", () => {
    const empate = Object.fromEntries(PERFIS_EM_ORDEM.map((p) => [p, 1]));
    expect(perfilDominante(empate)).toBe([...PERFIS_EM_ORDEM].sort()[0]);
  });
});

describe("afinidadeEmPercentual", () => {
  it("soma exatamente 100, sempre", () => {
    // O banco guarda sete inteiros que precisam fechar.
    for (const centro of [
      { a: 3, b: 1, c: 0, d: -1, e: -2, f: -0.5, g: 0.2 },
      { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0 },
      { a: 10, b: -10, c: 0, d: 0, e: 0, f: 0, g: 0 },
    ]) {
      const p = afinidadeEmPercentual(centro);
      expect(Object.values(p).reduce((s, v) => s + v, 0)).toBe(100);
    }
  });

  it("nunca produz negativo — o escore centrado tem negativos", () => {
    // `normalizeToPercent` dividia pela soma; num vetor centrado a soma passa
    // perto de zero POR CONSTRUCAO, e o resultado explodia ou invertia sinal.
    const p = afinidadeEmPercentual({ a: -5, b: -3, c: -1, d: 0, e: 1, f: 3, g: 5 });
    expect(Object.values(p).every((v) => v >= 0)).toBe(true);
  });

  it("nao zera o ultimo colocado", () => {
    // "Desloca pelo minimo" afirmaria afinidade NULA com quem ficou em setimo.
    const p = afinidadeEmPercentual({ a: 3, b: 2, c: 1, d: 0, e: -1, f: -2, g: -3 });
    expect(Math.min(...Object.values(p))).toBeGreaterThan(0);
  });

  it("preserva a ordem do escore centrado, de forma NAO-CRESCENTE", () => {
    // Fraca, nao estrita: o percentual e inteiro e tem piso de 1, entao a cauda
    // empata. A ordem ESTRITA vive na afinidade continua, que e quem decide o
    // dominante — ver o teste "o dominante do percentual e o mesmo da
    // afinidade".
    const centro = { a: 2, b: 1, c: 0, d: -1, e: -2, f: -3, g: -4 };
    const p = afinidadeEmPercentual(centro);
    const ordem = ["a", "b", "c", "d", "e", "f", "g"] as const;
    for (let i = 1; i < ordem.length; i += 1) {
      const px = p as Record<string, number>;
      expect(px[ordem[i - 1]]).toBeGreaterThanOrEqual(px[ordem[i]]);
    }
    // O topo continua estritamente separado: o piso so' afeta a cauda.
    const v = (k: string) => (p as Record<string, number>)[k];
    expect(v("a")).toBeGreaterThan(v("b"));
    expect(v("b")).toBeGreaterThan(v("c"));
  });

  it("empate total vira distribuicao uniforme", () => {
    const p = afinidadeEmPercentual({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0 });
    const valores = Object.values(p);
    expect(Math.max(...valores) - Math.min(...valores)).toBeLessThanOrEqual(1);
  });
});

describe("computarPerfil — a conta que a tela e o banco compartilham", () => {
  it("o dominante do percentual e o mesmo da afinidade", () => {
    // Se divergirem, a tela mostra um perfil e o banco guarda outro.
    const r = computarPerfil({ answers: responder((q) => (q.reverse ? 1 : 4)), ordenacao: ORDEM });
    const topoDoPercentual = Object.entries(r.percentual).sort((a, b) => b[1] - a[1])[0][0];
    expect(topoDoPercentual).toBe(r.dominante);
    expect(r.ordenado[0].key).toBe(r.dominante);
  });

  it("o percentual soma 100 e carrega label para a tela", () => {
    const r = computarPerfil({ answers: responder(() => 3), ordenacao: ORDEM });
    expect(Object.values(r.percentual).reduce((s, v) => s + v, 0)).toBe(100);
    expect(r.ordenado.every((o) => typeof o.label === "string" && o.label.length > 0)).toBe(true);
  });

  it("a ordenacao declarada MUDA o percentual salvo", () => {
    // A prova de que a correcao chega ao banco: antes, o percentual vinha de
    // `computeBrainHexResult`, que nem sabe que a ordenacao existe.
    const answers = responder(() => 3);
    const a = computarPerfil({ answers, ordenacao: ORDEM });
    const b = computarPerfil({ answers, ordenacao: [...ORDEM].reverse() });
    expect(a.percentual).not.toEqual(b.percentual);
    expect(a.dominante).not.toBe(b.dominante);
  });

  it("leva confianca junto, nao so o percentual", () => {
    const r = computarPerfil({ answers: responder(() => SCALE_MAX), ordenacao: ORDEM });
    expect(r.confianca).toBeGreaterThan(0);
    expect(r.confianca).toBeLessThan(0.5);
    expect(r.qualidade.motivos.length).toBeGreaterThan(0);
  });
});
