import { describe, expect, it } from "vitest";
import { descreverCriterio, lerCriterio, metricaPorChave, METRICAS, montarCriterio, validarLimiar } from "./criterio";

const m = (chave: string) => metricaPorChave(chave)!;

describe("lista de métricas", () => {
  it("tem as seis do protótipo, cada uma com chave única", () => {
    expect(METRICAS).toHaveLength(6);
    expect(new Set(METRICAS.map((x) => x.chave)).size).toBe(6);
  });
  it("métrica fora da lista não existe", () => {
    expect(metricaPorChave("qualquer_coisa")).toBeNull();
    expect(metricaPorChave(null)).toBeNull();
  });
});

describe("validarLimiar", () => {
  it("aceita inteiro dentro dos limites, com espaços", () => {
    expect(validarLimiar(m("dias_seguidos"), " 7 ")).toEqual({ ok: true, valor: 7, erro: null });
    expect(validarLimiar(m("acertos_percentual"), "80")).toEqual({ ok: true, valor: 80, erro: null });
  });
  it("recusa vazio, texto, decimal, abaixo do mínimo e acima do máximo", () => {
    expect(validarLimiar(m("minutos_totais"), "").ok).toBe(false);
    expect(validarLimiar(m("minutos_totais"), "abc").ok).toBe(false);
    expect(validarLimiar(m("minutos_totais"), "2.5").ok).toBe(false);
    expect(validarLimiar(m("dias_seguidos"), "1")).toMatchObject({ ok: false });
    expect(validarLimiar(m("acertos_percentual"), "101")).toMatchObject({ ok: false });
  });
  it("só tópicos visitados aceita 'todos'", () => {
    expect(validarLimiar(m("topicos_visitados"), "Todos")).toEqual({ ok: true, valor: "todos", erro: null });
    expect(validarLimiar(m("minutos_totais"), "todos").ok).toBe(false);
  });
});

describe("montarCriterio / lerCriterio", () => {
  it("grava o limiar na chave que o banco lê", () => {
    expect(montarCriterio(m("atividades_concluidas"), 5)).toEqual({ metrica: "atividades_concluidas", minimo: 5 });
    expect(montarCriterio(m("acertos_percentual"), 80)).toEqual({ metrica: "acertos_percentual", percentual: 80 });
    expect(montarCriterio(m("topicos_visitados"), "todos")).toEqual({ metrica: "topicos_visitados", visitados: "todos" });
    expect(montarCriterio(m("atividade_rapida"), 30)).toEqual({ metrica: "atividade_rapida", max_tempo: 30 });
  });
  it("ida e volta preserva métrica, limiar e aparência", () => {
    const l = lerCriterio(montarCriterio(m("minutos_totais"), 300, { icone: "estrela", cor: "#9b5de5" }))!;
    expect(l.metrica.chave).toBe("minutos_totais");
    expect(l.limiar).toBe(300);
    expect(l.aparencia).toEqual({ icone: "estrela", cor: "#9b5de5" });
  });
  it("lê as conquistas globais antigas (limiar como texto, sem aparência)", () => {
    expect(lerCriterio({ metrica: "dias_seguidos", dias_seguidos: "7" })).toMatchObject({ limiar: 7, aparencia: null });
  });
  it("métrica de sistema fora da lista da turma, ou critério quebrado, vira null", () => {
    expect(lerCriterio({ metrica: "eventos_totais", minimo: 3 })).toBeNull();
    expect(lerCriterio({ metrica: "dias_seguidos" })).toBeNull();
    expect(lerCriterio(null)).toBeNull();
    expect(lerCriterio("x")).toBeNull();
  });
});

describe("descreverCriterio", () => {
  it("escreve em português claro", () => {
    expect(descreverCriterio(m("acertos_percentual"), 80)).toBe("Acertos ≥ 80%");
    expect(descreverCriterio(m("topicos_visitados"), "todos")).toBe("Todos os tópicos visitados");
    expect(descreverCriterio(m("topicos_visitados"), 1)).toBe("1 tópico visitado");
    expect(descreverCriterio(m("atividade_rapida"), 30)).toBe("Conclusão em até 30 min");
    expect(descreverCriterio(m("atividades_concluidas"), 1)).toBe("1 atividade concluída");
  });
});
