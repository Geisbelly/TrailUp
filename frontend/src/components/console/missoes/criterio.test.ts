import { describe, expect, it } from "vitest";
import {
  CHAVE_DO_ALVO,
  METRICAS,
  alvoSugerido,
  METRICAS_DE_GUILDA,
  metricaSomaEmGuilda,
  criterioDeEntrega,
  criterioDeMeta,
  definicaoDaMetrica,
  rotuloDoCriterio,
  type MetricaDeMissao,
} from "./criterio";

describe("CHAVE_DO_ALVO", () => {
  // Copiado de `trg_eventos_aluno_after_iud`. Errar a chave NÃO dá erro: o avaliador faz
  // `COALESCE((criterio->>'chave')::int, 0)`, então chave errada vira alvo zero e a missão é
  // concluída na hora, para todo mundo. Este teste é o que impede isso.
  it.each([
    ["minutos_totais", "minutos"],
    ["dias_seguidos", "dias_seguidos"],
    ["topicos_concluidos", "minimo"],
    ["atividades_concluidas", "minimo"],
    ["acertos_percentual", "percentual"],
    ["trilha_percentual", "percentual"],
  ] as const)("%s lê o alvo de `%s`", (metrica, chave) => {
    expect(CHAVE_DO_ALVO[metrica as MetricaDeMissao]).toBe(chave);
  });

  it("toda métrica oferecida tem chave de alvo", () => {
    for (const m of METRICAS) expect(CHAVE_DO_ALVO[m.chave]).toBeTruthy();
    expect(Object.keys(CHAVE_DO_ALVO).sort()).toEqual(METRICAS.map((m) => m.chave).sort());
  });
});

describe("criterioDeMeta", () => {
  it("usa a chave que o avaliador espera, não um nome genérico", () => {
    expect(criterioDeMeta("minutos_totais", 30)).toEqual({ metrica: "minutos_totais", minutos: 30 });
    expect(criterioDeMeta("topicos_concluidos", 4)).toEqual({ metrica: "topicos_concluidos", minimo: 4 });
    expect(criterioDeMeta("acertos_percentual", 80)).toEqual({ metrica: "acertos_percentual", percentual: 80 });
  });

  it("nunca grava a chave `alvo`, que o avaliador não lê", () => {
    for (const m of METRICAS) {
      expect(Object.keys(criterioDeMeta(m.chave, 1))).not.toContain("alvo");
    }
  });
});

describe("criterioDeEntrega", () => {
  it("é o mesmo formato que a migração 20261019_05 grava", () => {
    expect(criterioDeEntrega(77)).toEqual({ metrica: "atividade_especifica", atividade_id: 77 });
  });
});

describe("definicaoDaMetrica", () => {
  it("desconhecida devolve null em vez de chutar", () => {
    expect(definicaoDaMetrica("inventada")).toBeNull();
    expect(definicaoDaMetrica("")).toBeNull();
  });
  it("percentual tem teto 100", () => {
    expect(definicaoDaMetrica("acertos_percentual")?.max).toBe(100);
    expect(definicaoDaMetrica("trilha_percentual")?.max).toBe(100);
  });
});

describe("rotuloDoCriterio", () => {
  it("entrega", () => {
    expect(rotuloDoCriterio({ metrica: "atividade_especifica", atividade_id: 1 })).toBe("Concluir a atividade");
  });
  it("meta com alvo", () => {
    expect(rotuloDoCriterio({ metrica: "minutos_totais", minutos: 45 })).toBe("Minutos de estudo: 45 minutos");
    expect(rotuloDoCriterio({ metrica: "acertos_percentual", percentual: 80 })).toBe("Percentual de acertos: 80%");
  });
  it("meta sem o alvo esperado não inventa número", () => {
    // Se a chave estiver errada, o cartão mostra só o rótulo — e o professor percebe.
    expect(rotuloDoCriterio({ metrica: "minutos_totais", minimo: 45 })).toBe("Minutos de estudo");
  });
  it("nulo, vazio e desconhecido não quebram o cartão", () => {
    expect(rotuloDoCriterio(null)).toBe("Sem critério");
    expect(rotuloDoCriterio(undefined)).toBe("Sem critério");
    expect(rotuloDoCriterio("texto")).toBe("Sem critério");
    expect(rotuloDoCriterio({})).toBe("Sem critério");
    expect(rotuloDoCriterio({ metrica: "evento_medalha" })).toBe("evento_medalha");
    expect(rotuloDoCriterio({ metrica: "minutos_no_dia", minutos: 10 })).toBe("Minutos no dia: 10");
    expect(rotuloDoCriterio({ metrica: "eventos_no_dia", minimo: 2, evento: "atividade_concluida" })).toBe("2 atividades no dia");
  });
});

describe("METRICAS_DE_GUILDA", () => {
  // Copiado de `METRICAS_SOMAVEIS` em `20261021_15`: o banco soma só estas na guilda, e a
  // guarda recusa o resto com 22023. Oferecer outra aqui seria um erro de servidor na tela.
  const SOMAVEIS_NO_BANCO = ["eventos_totais", "eventos_do_tipo", "atividades_concluidas", "eventos_no_dia", "minutos_no_dia"];

  it("toda métrica de guilda desta tela soma no banco e existe no formulário", () => {
    for (const m of METRICAS_DE_GUILDA) {
      expect(SOMAVEIS_NO_BANCO).toContain(m);
      expect(definicaoDaMetrica(m)).not.toBeNull();
    }
  });

  it("percentual, sequência e acumulado de vida inteira não somam", () => {
    for (const m of ["acertos_percentual", "trilha_percentual", "dias_seguidos", "minutos_totais", "topicos_concluidos"]) {
      expect(metricaSomaEmGuilda(m)).toBe(false);
    }
    expect(metricaSomaEmGuilda("atividades_concluidas")).toBe(true);
  });
});

describe("alvoSugerido", () => {
  const turma = { topicos: 4, atividades: 12 };

  it("contagem sai do que a turma tem", () => {
    expect(alvoSugerido("topicos_concluidos", turma)).toBe(4);
    expect(alvoSugerido("atividades_concluidas", turma)).toBe(12);
  });

  it("percentual de trilha é a trilha inteira", () => {
    expect(alvoSugerido("trilha_percentual", turma)).toBe(100);
  });

  it("turma vazia ainda dá um alvo válido (o banco trata 0 como cumprido)", () => {
    expect(alvoSugerido("topicos_concluidos", { topicos: 0, atividades: 0 })).toBe(1);
  });

  it("toda medida oferecida tem sugestão dentro do limite", () => {
    for (const m of METRICAS) {
      const v = alvoSugerido(m.chave, turma)!;
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(m.max);
    }
  });

  it("medida desconhecida não sugere", () => {
    expect(alvoSugerido("eventos_totais", turma)).toBeNull();
  });
});
