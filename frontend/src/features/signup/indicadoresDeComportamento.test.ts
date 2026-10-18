import { describe, expect, it } from "vitest";

import { atualizarPerfil } from "./atualizacaoDoPerfil";
import { PERFIS_EM_ORDEM } from "./brainhexOrdenacao";
import {
  coletarObservacoes,
  conclusaoDeOpcional,
  persistenciaAposErro,
  proporcaoDeTeoria,
} from "./indicadoresDeComportamento";

describe("persistenciaAposErro (Survivor)", () => {
  it("quem volta depois de errar pontua positivo", () => {
    const o = persistenciaAposErro([
      { questao_id: 1, attempt_number: 1, is_correct: false },
      { questao_id: 1, attempt_number: 2, is_correct: true },
    ]);
    expect(o?.perfil).toBe("survivor");
    expect(o?.valor).toBeGreaterThan(0);
    expect(o?.n).toBe(1);
  });

  it("quem desiste na primeira pontua negativo", () => {
    const o = persistenciaAposErro([{ questao_id: 1, attempt_number: 1, is_correct: false }]);
    expect(o?.valor).toBeLessThan(0);
  });

  it("sem questao errada devolve null, nao zero", () => {
    // Zero afirmaria "nao persiste"; null diz "nao houve ocasiao de medir".
    const o = persistenciaAposErro([{ questao_id: 1, attempt_number: 1, is_correct: true }]);
    expect(o).toBeNull();
  });

  it("UMA linha ja produz observacao — nao espera volume", () => {
    const o = persistenciaAposErro([{ questao_id: 9, attempt_number: 1, is_correct: false }]);
    expect(o).not.toBeNull();
    expect(o?.n).toBe(1);
  });

  it("n cresce com o numero de questoes erradas", () => {
    const muitas = Array.from({ length: 40 }, (_, i) => ({
      questao_id: i, attempt_number: 1, is_correct: false,
    }));
    expect(persistenciaAposErro(muitas)?.n).toBe(40);
  });
});

describe("conclusaoDeOpcional (Achiever)", () => {
  it("so olha o opcional: o obrigatorio nao discrimina ninguem", () => {
    const o = conclusaoDeOpcional([
      { obrigatorio: true, percentual_concluido: 100 },
      { obrigatorio: true, percentual_concluido: 100 },
      { obrigatorio: false, percentual_concluido: 0 },
    ]);
    expect(o?.n).toBe(1);
    expect(o?.valor).toBeLessThan(0);
  });

  it("sem material opcional devolve null", () => {
    expect(conclusaoDeOpcional([{ obrigatorio: true, percentual_concluido: 100 }])).toBeNull();
  });
});

describe("proporcaoDeTeoria (Mastermind)", () => {
  it("quem so faz exercicio pontua negativo", () => {
    const o = proporcaoDeTeoria([{ tipo: "atividade", tempo_ativo_seg: 600 }]);
    expect(o?.valor).toBeLessThan(0);
  });

  it("meio a meio fica em zero", () => {
    const o = proporcaoDeTeoria([
      { tipo: "teoria", tempo_ativo_seg: 300 },
      { tipo: "atividade", tempo_ativo_seg: 300 },
    ]);
    expect(o?.valor).toBeCloseTo(0, 9);
  });

  it("n e em MINUTOS: dez minutos sustentam mais que dez linhas curtas", () => {
    const curtas = Array.from({ length: 10 }, () => ({
      tipo: "teoria" as const, tempo_ativo_seg: 0.5,
    }));
    const longa = [{ tipo: "teoria" as const, tempo_ativo_seg: 600 }];
    expect(proporcaoDeTeoria(longa)!.n).toBeGreaterThan(proporcaoDeTeoria(curtas)!.n);
  });

  it("tempo zero devolve null em vez de dividir por zero", () => {
    expect(proporcaoDeTeoria([{ tipo: "teoria", tempo_ativo_seg: 0 }])).toBeNull();
  });
});

describe("integracao: indicadores -> atualizacao", () => {
  const prior = {
    afinidade: Object.fromEntries(PERFIS_EM_ORDEM.map((p) => [p, 0])) as Record<string, number>,
    confianca: 0.5,
  };

  it("SEM nenhum dado, o perfil nao se move — nao ha pre-requisito de volume", () => {
    const observacoes = coletarObservacoes({});
    expect(observacoes).toEqual([]);
    const r = atualizarPerfil({ prior: prior as never, observacoes });
    expect(r.afinidade).toEqual(prior.afinidade);
    expect(r.confianca).toBeCloseTo(0.5, 9);
  });

  it("com UM aluno e UMA questao, ja roda e mal move", () => {
    const observacoes = coletarObservacoes({
      tentativas: [
        { questao_id: 1, attempt_number: 1, is_correct: false },
        { questao_id: 1, attempt_number: 3, is_correct: true },
      ],
    });
    expect(observacoes).toHaveLength(1);
    const r = atualizarPerfil({ prior: prior as never, observacoes });
    expect(Math.abs(r.afinidade.survivor)).toBeGreaterThan(0);
    expect(Math.abs(r.afinidade.survivor)).toBeLessThan(0.2);
  });

  it("indicadores de perfis diferentes nao se atropelam", () => {
    const observacoes = coletarObservacoes({
      tentativas: [
        { questao_id: 1, attempt_number: 2, is_correct: true },
        { questao_id: 1, attempt_number: 1, is_correct: false },
      ],
      progresso: [{ obrigatorio: false, percentual_concluido: 100 }],
      tempo: [{ tipo: "teoria", tempo_ativo_seg: 900 }],
    });
    expect(observacoes.map((o) => o.perfil).sort()).toEqual(
      ["achiever", "mastermind", "survivor"],
    );
    const r = atualizarPerfil({ prior: prior as never, observacoes });
    expect(r.afinidade.seeker).toBe(0);
    expect(r.afinidade.conqueror).toBe(0);
  });
});
