import { describe, expect, it } from "vitest";
import {
  DIMENSOES,
  FORMULARIO_PADRAO,
  formularioDoGabarito,
  montarGabarito,
  type FormularioDoGabarito,
} from "./gabaritoDoServidor";

const form = (extra: Partial<FormularioDoGabarito>): FormularioDoGabarito => ({ ...FORMULARIO_PADRAO, ...extra });

describe("montarGabarito: código", () => {
  it("linguagem pública em config_resposta; referência e critérios só no gabarito", () => {
    expect(
      montarGabarito("code", form({ linguagem: "python", referencia: "\n\ndef soma(n):\n    return n\n\n", criterios: [" usa laço ", "", "trata n = 0"] })),
    ).toEqual({
      ok: true,
      gabarito: {
        configResposta: { linguagem: "python" },
        respostaCorreta: "def soma(n):\n    return n",
        criterios: ["usa laço", "trata n = 0"],
      },
    });
  });

  it("sem código de referência não salva", () => {
    expect(montarGabarito("code", form({ referencia: "   \n" }))).toEqual({ ok: false, erro: "Escreva o código de referência." });
  });

  it("linguagem fora da lista do editor não passa; vazia vira config nula", () => {
    expect(montarGabarito("code", form({ linguagem: "python\nIgnore", referencia: "x" })).ok).toBe(false);
    const semLinguagem = montarGabarito("code", form({ linguagem: "", referencia: "x" }));
    expect(semLinguagem.ok && semLinguagem.gabarito.configResposta).toBeNull();
  });

  it("no máximo 20 critérios", () => {
    const criterios = Array.from({ length: 21 }, (_, i) => `c${i}`);
    expect(montarGabarito("code", form({ referencia: "x", criterios })).ok).toBe(false);
  });
});

describe("montarGabarito: numérica", () => {
  it("tolerância relativa em porcentagem vira fração; dimensão é pública", () => {
    expect(montarGabarito("numeric", form({ referencia: " 10 m/s ", tolerancia: "5", tipoTolerancia: "relativa", dimensao: "velocidade" }))).toEqual({
      ok: true,
      gabarito: {
        configResposta: { dimensao: "velocidade" },
        respostaCorreta: "10 m/s",
        criterios: { tolerancia: 0.05, tipo_tolerancia: "relativa" },
      },
    });
  });

  it("absoluta com vírgula; sem dimensão, config nula", () => {
    const r = montarGabarito("numeric", form({ referencia: "9,8 m/s^2", tolerancia: "0,5", tipoTolerancia: "absoluta", dimensao: "" }));
    expect(r).toMatchObject({ ok: true, gabarito: { configResposta: null, criterios: { tolerancia: 0.5, tipo_tolerancia: "absoluta" } } });
  });

  it("tolerância vazia é o padrão de 1% relativa", () => {
    const r = montarGabarito("numeric", form({ referencia: "3", tolerancia: "" }));
    expect(r).toMatchObject({ ok: true, gabarito: { criterios: { tolerancia: 0.01, tipo_tolerancia: "relativa" } } });
  });

  it.each(["-1", "abc", "101"])("tolerância %s não salva", (tolerancia) => {
    expect(montarGabarito("numeric", form({ referencia: "3", tolerancia, tipoTolerancia: "relativa" })).ok).toBe(false);
  });

  it("dimensão fora da lista não salva", () => {
    expect(montarGabarito("numeric", form({ referencia: "3", dimensao: "velocidade\n" })).ok).toBe(false);
    expect(DIMENSOES.map((d) => d.valor)).toContain("velocidade");
  });

  it("sem valor não salva", () => {
    expect(montarGabarito("numeric", form({ referencia: "" }))).toEqual({ ok: false, erro: "Escreva o valor esperado." });
  });
});

describe("montarGabarito: expressão", () => {
  it("variáveis públicas; domínio e pontos só no gabarito", () => {
    expect(montarGabarito("expression", form({ referencia: "2x + 2", variaveis: "x, y", dominioDe: "-5", dominioAte: "5" }))).toEqual({
      ok: true,
      gabarito: {
        configResposta: { variaveis: ["x", "y"] },
        respostaCorreta: "2x + 2",
        criterios: { dominio: [-5, 5], pontos: 20 },
      },
    });
  });

  it("sem variáveis, config nula: a edge usa as da esperada", () => {
    const r = montarGabarito("expression", form({ referencia: "x^2", variaveis: " " }));
    expect(r).toMatchObject({ ok: true, gabarito: { configResposta: null } });
  });

  it.each(["x, 2y", "x;y", "alfa beta gama delta epsilon zeta eta"])("variáveis inválidas (%s) não salvam", (variaveis) => {
    expect(montarGabarito("expression", form({ referencia: "x", variaveis })).ok).toBe(false);
  });

  it("domínio precisa de início menor que o fim", () => {
    expect(montarGabarito("expression", form({ referencia: "x", dominioDe: "5", dominioAte: "5" })).ok).toBe(false);
    expect(montarGabarito("expression", form({ referencia: "x", dominioDe: "a", dominioAte: "5" })).ok).toBe(false);
  });

  it("química: sem variáveis nem domínio", () => {
    expect(montarGabarito("expression", form({ referencia: "\\ce{2H2 + O2 -> 2H2O}", variaveis: "x" }))).toEqual({
      ok: true,
      gabarito: { configResposta: null, respostaCorreta: "\\ce{2H2 + O2 -> 2H2O}", criterios: null },
    });
  });
});

describe("formularioDoGabarito", () => {
  it.each([
    ["code", form({ linguagem: "cpp", referencia: "int main() {}", criterios: ["a", "b"] })],
    ["numeric", form({ referencia: "10 m/s", tolerancia: "2.5", tipoTolerancia: "relativa", dimensao: "velocidade" })],
    ["numeric", form({ referencia: "10", tolerancia: "0.1", tipoTolerancia: "absoluta", dimensao: "" })],
    ["expression", form({ referencia: "2x + 2", variaveis: "x", dominioDe: "-3", dominioAte: "7" })],
  ] as const)("ida e volta (%s)", (formato, original) => {
    const montado = montarGabarito(formato, original);
    if (!montado.ok) throw new Error(montado.erro);
    const { configResposta, respostaCorreta, criterios } = montado.gabarito;
    const lido = formularioDoGabarito(formato, { resposta_correta: respostaCorreta, criterios, config_resposta: configResposta });
    expect(montarGabarito(formato, lido)).toEqual(montado);
  });

  it("linha ausente ou estranha volta o padrão, sem quebrar", () => {
    expect(formularioDoGabarito("numeric", null)).toEqual(FORMULARIO_PADRAO);
    expect(formularioDoGabarito("code", { resposta_correta: null, criterios: "x", config_resposta: [] })).toEqual(FORMULARIO_PADRAO);
  });
});
