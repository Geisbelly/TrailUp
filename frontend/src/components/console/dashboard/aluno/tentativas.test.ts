import { describe, expect, it } from "vitest";
import {
  estadoDoCronometro,
  formatarDuracao,
  regraDoCronometro,
  resumirTentativas,
  textoDasTentativas,
  type LinhaDeTentativa,
} from "./tentativas";

const tentativa = (p: Partial<LinhaDeTentativa>): LinhaDeTentativa => ({
  atividade_id: 1,
  numero: 1,
  iniciada_em: "2026-11-01T10:00:00Z",
  respondida_em: "2026-11-01T10:01:30Z",
  cronometrada: true,
  limite_seg: 120,
  no_tempo: true,
  acertos_percentual: "80",
  pontuacao_obtida: "8",
  pontuacao_maxima: "10",
  ...p,
});

describe("estadoDoCronometro", () => {
  it("sem escolha gravada vale o perfil dominante", () => {
    expect(estadoDoCronometro(null, "Achiever")).toMatchObject({ ligado: true, origem: "perfil" });
    expect(estadoDoCronometro(null, "seeker")).toMatchObject({ ligado: false, origem: "perfil" });
    expect(estadoDoCronometro(null, "Socializer")).toMatchObject({ ligado: false, origem: "perfil" });
  });
  it("sem perfil reconhecido fica desligado, como no banco", () => {
    expect(estadoDoCronometro(null, "")).toMatchObject({ ligado: false, origem: "perfil" });
  });
  it("a escolha do aluno ou da IA vence o perfil", () => {
    expect(
      estadoDoCronometro({ ligado: false, origem: "aluno", motivo: null, atualizado_em: "2026-11-01T00:00:00Z" }, "Achiever"),
    ).toEqual({ ligado: false, origem: "aluno", motivo: null, desde: "2026-11-01T00:00:00Z" });
    expect(
      estadoDoCronometro({ ligado: false, origem: "ia", motivo: "ansiedade recorrente", atualizado_em: null }, "Survivor"),
    ).toMatchObject({ origem: "ia", motivo: "ansiedade recorrente" });
  });
});

describe("resumirTentativas", () => {
  it("vale a última entregue; a primeira fica guardada à parte", () => {
    const [r] = resumirTentativas(
      [
        tentativa({ numero: 1, acertos_percentual: "40", pontuacao_obtida: "4" }),
        tentativa({
          numero: 2,
          iniciada_em: "2026-11-01T11:00:00Z",
          respondida_em: "2026-11-01T11:03:00Z",
          no_tempo: false,
          acertos_percentual: "90",
          pontuacao_obtida: "9",
        }),
      ],
      [{ id: 1, titulo: "Quiz", tentativas_max: 3 }],
      [],
    );
    expect(r).toMatchObject({ titulo: "Quiz", feitas: 2, maximo: 3, primeiraAcertos: 40, emAberto: false });
    expect(r.ultima).toMatchObject({ numero: 2, acertos: 90, pontos: 9, pontosMax: 10, noTempo: false, duracaoSeg: 180 });
  });

  it("tentativa aberta não conta como feita, mas aparece", () => {
    const [r] = resumirTentativas([tentativa({ numero: 1, respondida_em: null, no_tempo: null })], [], []);
    expect(r).toMatchObject({ feitas: 0, emAberto: true, ultima: null, titulo: "Atividade 1", maximo: null });
  });

  it("soma o bônus da atividade e ignora referência de outra", () => {
    const [r] = resumirTentativas(
      [tentativa({})],
      [],
      [
        { referencia: "atividade:1", valor: "10" },
        { referencia: "atividade:1", valor: 10 },
        { referencia: "atividade:12", valor: 10 },
        { referencia: null, valor: 10 },
      ],
    );
    expect(r.bonusXp).toBe(20);
  });

  it("ordena da atividade mexida por último para a mais antiga", () => {
    const lista = resumirTentativas(
      [
        tentativa({ atividade_id: 1, iniciada_em: "2026-11-01T08:00:00Z", respondida_em: "2026-11-01T08:01:00Z" }),
        tentativa({ atividade_id: 2, iniciada_em: "2026-11-01T09:00:00Z", respondida_em: null }),
      ],
      [],
      [],
    );
    expect(lista.map((r) => r.atividadeId)).toEqual([2, 1]);
  });
});

describe("regraDoCronometro", () => {
  it("faixas acumulam, como o banco paga", () => {
    const regra = regraDoCronometro(
      [
        { chave: "cronometro_atividade_padrao_seg", valor: "120" },
        { chave: "cronometro_tolerancia_seg", valor: "5" },
      ],
      [
        { tipo: "atividade_no_tempo_90", pontos: "10" },
        { tipo: "atividade_no_tempo_70", pontos: 10 },
        { tipo: "atividade_no_tempo_80", pontos: "10" },
        { tipo: "outro", pontos: 99 },
      ],
    );
    expect(regra).toEqual({
      duracaoSeg: 120,
      toleranciaSeg: 5,
      faixas: [
        { minimo: 70, xp: 10 },
        { minimo: 80, xp: 20 },
        { minimo: 90, xp: 30 },
      ],
    });
  });
  it("chave que o RLS escondeu fica null, não vira padrão inventado", () => {
    expect(regraDoCronometro([], [])).toEqual({ duracaoSeg: null, toleranciaSeg: null, faixas: [] });
  });
});

describe("formatação", () => {
  it("duração", () => {
    expect(formatarDuracao(45)).toBe("45 s");
    expect(formatarDuracao(120)).toBe("2 min");
    expect(formatarDuracao(102)).toBe("1 min 42 s");
    expect(formatarDuracao(null)).toBe("—");
  });
  it("tentativas", () => {
    expect(textoDasTentativas(2, 3)).toBe("2/3");
    // Sem a atividade não se sabe o limite; com ela, nunca é null (#136, 20261102_08).
    expect(textoDasTentativas(4, null)).toBe("4");
  });
});
