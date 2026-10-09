import { describe, expect, it } from "vitest";

import { PERFIS_EM_ORDEM } from "./brainhexOrdenacao";
import {
  atualizarPerfil,
  confiancaDe,
  precisaoDe,
  type EstadoDoPerfil,
  type Observacao,
} from "./atualizacaoDoPerfil";

const prior: EstadoDoPerfil = {
  afinidade: Object.fromEntries(PERFIS_EM_ORDEM.map((p, i) => [p, i - 3])) as EstadoDoPerfil["afinidade"],
  confianca: 0.5,
};

const obs = (n: number, valor = 3, perfil = "survivor" as const): Observacao => ({
  perfil, valor, n, indicador: "teste",
});

describe("precisao <-> confianca", () => {
  it("sao a mesma coisa em unidades diferentes (ida e volta)", () => {
    for (const c of [0, 0.1, 0.5, 0.9, 0.99]) {
      expect(confiancaDe(precisaoDe(c))).toBeCloseTo(c, 9);
    }
  });

  it("confianca 0 e precisao 0", () => {
    expect(precisaoDe(0)).toBe(0);
    expect(confiancaDe(0)).toBe(0);
  });
});

describe("atualizarPerfil — o ponto da correcao", () => {
  it("SEM observacao, o posterior e EXATAMENTE o prior", () => {
    // Isto nao precisa de "piso de evidencia": e o resultado da conta.
    const r = atualizarPerfil({ prior, observacoes: [] });
    expect(r.afinidade).toEqual(prior.afinidade);
    expect(r.confianca).toBeCloseTo(prior.confianca, 9);
    expect(r.movimento).toEqual({});
  });

  it("UMA observacao mal move o posterior", () => {
    const r = atualizarPerfil({ prior, observacoes: [obs(1)] });
    const deslocamento = Math.abs(r.afinidade.survivor - prior.afinidade.survivor);
    expect(deslocamento).toBeGreaterThan(0);
    expect(deslocamento).toBeLessThan(0.3);
  });

  it("muita observacao domina o prior", () => {
    const r = atualizarPerfil({ prior, observacoes: [obs(100_000)] });
    expect(r.afinidade.survivor).toBeCloseTo(3, 2);
  });

  it("o deslocamento cresce de forma monotona com o volume", () => {
    // A propriedade que torna piso e teto desnecessarios.
    const deslocamentos = [0, 1, 5, 20, 100, 1000].map((n) => {
      const r = atualizarPerfil({ prior, observacoes: n === 0 ? [] : [obs(n)] });
      return Math.abs(r.afinidade.survivor - prior.afinidade.survivor);
    });
    for (let i = 1; i < deslocamentos.length; i += 1) {
      expect(deslocamentos[i]).toBeGreaterThanOrEqual(deslocamentos[i - 1]);
    }
  });

  it("o posterior nunca ultrapassa a evidencia (sem teto artificial)", () => {
    // Media ponderada fica SEMPRE entre prior e observacao. Nao precisa de cap.
    for (const n of [1, 10, 100, 10000]) {
      const r = atualizarPerfil({ prior, observacoes: [obs(n, 3)] });
      expect(r.afinidade.survivor).toBeGreaterThanOrEqual(prior.afinidade.survivor);
      expect(r.afinidade.survivor).toBeLessThanOrEqual(3);
    }
  });

  it("prior mais confiante resiste mais a mesma evidencia", () => {
    const fraco = atualizarPerfil({ prior: { ...prior, confianca: 0.2 }, observacoes: [obs(10)] });
    const forte = atualizarPerfil({ prior: { ...prior, confianca: 0.95 }, observacoes: [obs(10)] });
    const dFraco = Math.abs(fraco.afinidade.survivor - prior.afinidade.survivor);
    const dForte = Math.abs(forte.afinidade.survivor - prior.afinidade.survivor);
    expect(dFraco).toBeGreaterThan(dForte);
  });

  it("a confianca sobe com evidencia, e nao cai", () => {
    const sem = atualizarPerfil({ prior, observacoes: [] });
    const pouca = atualizarPerfil({ prior, observacoes: [obs(5)] });
    const muita = atualizarPerfil({ prior, observacoes: [obs(500)] });
    expect(pouca.confianca).toBeGreaterThan(sem.confianca);
    expect(muita.confianca).toBeGreaterThan(pouca.confianca);
    expect(muita.confianca).toBeLessThanOrEqual(1);
  });

  it("so' move o perfil que teve evidencia", () => {
    const r = atualizarPerfil({ prior, observacoes: [obs(50)] });
    expect(r.afinidade.survivor).not.toBeCloseTo(prior.afinidade.survivor, 3);
    for (const p of PERFIS_EM_ORDEM.filter((x) => x !== "survivor")) {
      expect(r.afinidade[p]).toBeCloseTo(prior.afinidade[p], 9);
    }
  });

  it("registra de onde veio o movimento, para ser auditavel", () => {
    const r = atualizarPerfil({
      prior,
      observacoes: [{ perfil: "survivor", valor: 2, n: 7, indicador: "persistencia_apos_erro" }],
    });
    expect(r.movimento.survivor.evidencias).toEqual(["persistencia_apos_erro (n=7)"]);
    expect(r.movimento.survivor.de).toBe(prior.afinidade.survivor);
  });

  it("observacao com n<=0 ou valor invalido e ignorada, nao envenena a conta", () => {
    const r = atualizarPerfil({
      prior,
      observacoes: [obs(0), obs(-5), { ...obs(10), valor: Number.NaN }],
    });
    expect(r.afinidade).toEqual(prior.afinidade);
  });

  it("evidencias concorrentes sobre o mesmo perfil se somam em precisao", () => {
    const uma = atualizarPerfil({ prior, observacoes: [obs(10, 3)] });
    const duas = atualizarPerfil({
      prior,
      observacoes: [obs(10, 3), { ...obs(10, 3), indicador: "outro" }],
    });
    // Duas fontes concordando movem mais que uma.
    expect(Math.abs(duas.afinidade.survivor - prior.afinidade.survivor))
      .toBeGreaterThan(Math.abs(uma.afinidade.survivor - prior.afinidade.survivor));
  });

  it("evidencias contraditorias puxam para o MEIO, nao deixam a ultima vencer", () => {
    // Duas medidas opostas da mesma grandeza sao evidencia a favor do ponto
    // medio entre elas — nao ausencia de evidencia. O posterior sai do prior
    // (-2) em direcao a 0, que e a media das duas.
    const r = atualizarPerfil({
      prior,
      observacoes: [obs(10, 3), { ...obs(10, -3), indicador: "oposto" }],
    });
    expect(r.afinidade.survivor).toBeGreaterThan(prior.afinidade.survivor);
    expect(r.afinidade.survivor).toBeLessThan(0);
    // E nao importa a ordem em que chegaram.
    const invertido = atualizarPerfil({
      prior,
      observacoes: [{ ...obs(10, -3), indicador: "oposto" }, obs(10, 3)],
    });
    expect(invertido.afinidade.survivor).toBeCloseTo(r.afinidade.survivor, 9);
  });
});
