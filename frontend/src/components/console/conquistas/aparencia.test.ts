import { describe, expect, it } from "vitest";
import { contraste } from "../dashboard/contraste";
import { COR_DO_PERFIL, PERFIS_EM_ORDEM } from "../dashboard/perfilCores";
import { COR_PADRAO, corDaConquista, corValida, ICONES_DA_CONQUISTA, iconeValido, PALETA_DE_CORES } from "./aparencia";

const CARD = "#1a1627"; // --card do tema do console

describe("paleta", () => {
  it("toda cor da paleta é distinguível do card (3:1, objeto gráfico)", () => {
    for (const cor of PALETA_DE_CORES) expect(contraste(cor, CARD)).toBeGreaterThanOrEqual(3);
  });

  it("não tem cor repetida e a padrão é a primeira", () => {
    expect(new Set(PALETA_DE_CORES).size).toBe(PALETA_DE_CORES.length);
    expect(COR_PADRAO).toBe(PALETA_DE_CORES[0]);
  });

  it("só cores da paleta são válidas, sem diferenciar caixa", () => {
    expect(corValida("#9B5DE5")).toBe(true);
    expect(corValida("#123456")).toBe(false);
    expect(corValida(null)).toBe(false);
  });
});

describe("ícones", () => {
  it("chaves únicas e validação por lista fechada", () => {
    expect(new Set(ICONES_DA_CONQUISTA.map((i) => i.chave)).size).toBe(ICONES_DA_CONQUISTA.length);
    expect(iconeValido("trofeu")).toBe(true);
    expect(iconeValido("http://x/y.png")).toBe(false);
    expect(iconeValido(undefined)).toBe(false);
  });
});

describe("corDaConquista", () => {
  it("conquista de perfil usa SEMPRE a cor-assinatura do perfil, ignorando a escolhida", () => {
    for (const p of PERFIS_EM_ORDEM) expect(corDaConquista("#e2574c", p)).toBe(COR_DO_PERFIL[p].marca);
  });

  it("geral usa a escolhida se for da paleta; senão cai na padrão", () => {
    expect(corDaConquista("#4FD1C5", null)).toBe("#4fd1c5");
    expect(corDaConquista("#abcdef", null)).toBe(COR_PADRAO);
    expect(corDaConquista(undefined, null)).toBe(COR_PADRAO);
  });
});
