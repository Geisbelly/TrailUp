import { describe, expect, it } from "vitest";
import { centralizar, enquadrar, numeroNaSequencia, resumoDaTurma } from "./mapa";

const cartao = { largura: 240, altura: 140 };

describe("enquadrar", () => {
  it("sem cartões volta à vista inicial", () => {
    expect(enquadrar([], { largura: 800, altura: 600 }, cartao)).toEqual({ zoom: 1, offset: { x: 0, y: 0 } });
  });

  it("conjunto pequeno não passa de 1x e fica centralizado", () => {
    const v = enquadrar([{ x: 0, y: 0 }], { largura: 800, altura: 600 }, cartao);
    expect(v.zoom).toBe(1);
    expect(v.offset.x).toBeCloseTo((800 - 240) / 2);
    expect(v.offset.y).toBeCloseTo((600 - 140) / 2);
  });

  it("conjunto largo reduz o zoom até caber com margem", () => {
    const v = enquadrar([{ x: 0, y: 0 }, { x: 2000, y: 0 }], { largura: 800, altura: 600 }, cartao, 40);
    expect(v.zoom).toBeCloseTo((800 - 80) / 2240);
    const direita = 2240 * v.zoom + v.offset.x;
    expect(v.offset.x).toBeGreaterThanOrEqual(40 - 0.001);
    expect(direita).toBeLessThanOrEqual(800 - 40 + 0.001);
  });

  it("nunca desce do zoom mínimo", () => {
    expect(enquadrar([{ x: 0, y: 0 }, { x: 100000, y: 0 }], { largura: 800, altura: 600 }, cartao).zoom).toBe(0.2);
  });
});

describe("centralizar", () => {
  it("leva o centro do conjunto ao centro da janela", () => {
    const o = centralizar([{ x: 100, y: 100 }], 1, { largura: 800, altura: 600 }, cartao);
    expect(o.x + 100 + 120).toBeCloseTo(400);
    expect(o.y + 100 + 70).toBeCloseTo(300);
  });
});

describe("rótulos", () => {
  it("número da sequência usa ordem ou o índice", () => {
    expect(numeroNaSequencia(3, 0)).toBe(3);
    expect(numeroNaSequencia(null, 4)).toBe(5);
    expect(numeroNaSequencia(0, 1)).toBe(2);
  });
  it("resumo concorda no singular", () => {
    expect(resumoDaTurma(1, 1)).toBe("1 tópico · 1 aluno");
    expect(resumoDaTurma(8, null)).toBe("8 tópicos");
  });
});
