import { describe, it, expect } from "vitest";
import {
  buildProfileImageFrame,
  clarearParaFundoEscuro,
  corComAlpha,
} from "./profileImageFrame";

// Cores-assinatura reais dos perfis (microservice/src/constants/brainHex.ts).
const DAREDEVIL_VERMELHO = "#d7263d"; // Aventureiro (conferido em brainHex.ts)
const MASTERMIND = "#5b3fd9";
const SURVIVOR = "#4e5a66";
const SOCIALIZER = "#f4623a";

describe("clarearParaFundoEscuro", () => {
  it("clareia cor escura demais ate ficar visivel no fundo escuro", () => {
    const ajustada = clarearParaFundoEscuro(MASTERMIND);
    expect(ajustada.toLowerCase()).not.toBe(MASTERMIND);
  });

  it("preserva o matiz: roxo continua roxo, nao vira cinza", () => {
    const ajustada = clarearParaFundoEscuro(MASTERMIND);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ajustada.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(g);
  });

  it("preserva o matiz do vermelho do Aventureiro", () => {
    const ajustada = clarearParaFundoEscuro(DAREDEVIL_VERMELHO);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ajustada.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it("nao mexe em cor que ja tem contraste suficiente", () => {
    expect(clarearParaFundoEscuro(SOCIALIZER)).toBe(SOCIALIZER);
  });

  it("aguenta o cinza do Sobrevivente sem virar branco", () => {
    const ajustada = clarearParaFundoEscuro(SURVIVOR);
    expect(ajustada).not.toBe("#ffffff");
  });

  it("cor invalida cai no violeta do TrailUp em vez de quebrar", () => {
    expect(clarearParaFundoEscuro("nao-e-cor")).toBe("#a057fd");
    expect(clarearParaFundoEscuro("")).toBe("#a057fd");
  });

  it("aceita hex de 3 digitos", () => {
    expect(clarearParaFundoEscuro("#f43")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("corComAlpha", () => {
  it("converte hex em rgba com o alpha pedido", () => {
    expect(corComAlpha("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });

  it("cor invalida nao gera rgba quebrado", () => {
    expect(corComAlpha("xxx", 0.2)).toMatch(/^rgba\(\d+, \d+, \d+, 0\.2\)$/);
  });
});

describe("buildProfileImageFrame", () => {
  it("deriva borda, glow e fundo da cor do perfil", () => {
    const frame = buildProfileImageFrame(DAREDEVIL_VERMELHO);

    expect(frame.accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(frame.borda).toMatch(/^rgba\(/);
    expect(frame.glow).toMatch(/^rgba\(/);
    expect(frame.fundo).toMatch(/^rgba\(/);
  });

  it("perfis diferentes produzem molduras diferentes", () => {
    expect(buildProfileImageFrame(DAREDEVIL_VERMELHO).accent).not.toBe(
      buildProfileImageFrame(MASTERMIND).accent,
    );
  });

  it("sem cor informada ainda devolve uma moldura utilizavel", () => {
    const frame = buildProfileImageFrame(null);
    expect(frame.accent).toBe("#a057fd");
    expect(frame.borda).toMatch(/^rgba\(/);
  });

  it("a borda e mais opaca que o glow, e o fundo e o mais sutil", () => {
    const frame = buildProfileImageFrame(MASTERMIND);
    const alpha = (cor: string) => Number(cor.match(/,\s*([\d.]+)\)$/)?.[1]);

    expect(alpha(frame.borda)).toBeGreaterThan(alpha(frame.glow));
    expect(alpha(frame.glow)).toBeGreaterThan(alpha(frame.fundo));
  });
});

describe("contraste da legenda (texto pequeno)", () => {
  const luminancia = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (u: number) => (u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const razao = (a: string, b: string) => {
    const [hi, lo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it.each([
    ["Daredevil", "#d7263d"],
    ["Mastermind", "#5b3fd9"],
    ["Seeker", "#17a398"],
    ["Survivor", "#4e5a66"],
    ["Socializer", "#f4623a"],
  ])("legenda do %s alcanca AAA (7:1) sobre o fundo do card", (_nome, cor) => {
    const frame = buildProfileImageFrame(cor);
    expect(razao(frame.accentTexto, "#161a27")).toBeGreaterThanOrEqual(7);
  });

  it("o traco pode ficar mais escuro que a legenda (3:1 basta pra borda)", () => {
    const frame = buildProfileImageFrame(DAREDEVIL_VERMELHO);
    expect(razao(frame.accent, "#161a27")).toBeGreaterThanOrEqual(3);
    expect(razao(frame.accentTexto, "#161a27")).toBeGreaterThanOrEqual(razao(frame.accent, "#161a27"));
  });
});
