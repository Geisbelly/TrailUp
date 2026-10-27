import { describe, expect, it } from "vitest";
import { criterioMudou, noTeto, rotuloDoTeto, textoDeAlternar, textoDeMudancaDeCriterio } from "./textos";

describe("teto", () => {
  it("rótulo e limite", () => {
    expect(rotuloDoTeto(12, 20)).toBe("12 de 20 conquistas desta turma");
    expect(noTeto(19, 20)).toBe(false);
    expect(noTeto(20, 20)).toBe(true);
    expect(noTeto(25, 20)).toBe(true);
  });
});

describe("textoDeAlternar", () => {
  const c = { nome: "Maratonista", ativa: true, concedidas: 3 };

  it("desativar: preserva quem ganhou e diz que não há exclusão", () => {
    const t = textoDeAlternar(c, true);
    expect(t.confirmar).toBe("Desativar");
    expect(t.corpo).toContain("Quem já ganhou (3) continua");
    expect(t.corpo).toContain("Não dá para excluir");
  });

  it("com o gatilho respeitando `ativa`, promete que deixa de ser avaliada", () => {
    expect(textoDeAlternar(c, true).corpo).toContain("deixa de ser avaliada");
  });

  it("com o gatilho AINDA não respeitando, não promete o que não acontece", () => {
    const corpo = textoDeAlternar(c, false).corpo;
    expect(corpo).not.toContain("deixa de ser avaliada");
    expect(corpo).toContain("ainda não respeita");
  });

  it("o texto padrão reflete a flag do módulo (hoje ligada: o gatilho respeita `ativa`)", () => {
    expect(textoDeAlternar(c).corpo).toContain("deixa de ser avaliada");
    expect(textoDeAlternar(c).corpo).not.toContain("ainda não respeita");
  });

  it("sem ninguém que tenha ganhado, diz isso", () => {
    expect(textoDeAlternar({ ...c, concedidas: 0 }, true).corpo).toContain("Ninguém ganhou");
  });

  it("reativar é simples", () => {
    const t = textoDeAlternar({ ...c, ativa: false });
    expect(t.titulo).toBe("Reativar conquista");
    expect(t.confirmar).toBe("Reativar");
  });
});

describe("troca de critério", () => {
  const inicial = { metrica: "atividades_concluidas" as const, limiar: "5" };

  it("só métrica ou limiar contam como troca", () => {
    expect(criterioMudou(inicial, { ...inicial })).toBe(false);
    expect(criterioMudou(inicial, { ...inicial, limiar: " 5 " })).toBe(false);
    expect(criterioMudou(inicial, { ...inicial, limiar: "6" })).toBe(true);
    expect(criterioMudou(inicial, { metrica: "minutos_totais", limiar: "5" })).toBe(true);
    expect(criterioMudou({ metrica: "topicos_visitados", limiar: "Todos" }, { metrica: "topicos_visitados", limiar: "todos" })).toBe(false);
  });

  it("avisa que não revoga e que fica no histórico", () => {
    const t = textoDeMudancaDeCriterio(" Maratonista ", 3);
    expect(t.pergunta).toBe("Salvar o critério novo de “Maratonista”?");
    expect(t.corpo).toContain("Quem já ganhou (3) continua com ela");
    expect(t.corpo).toContain("nunca é revogada");
    expect(t.corpo).toContain("registrada no histórico");
    expect(t.confirmar).toBe("Salvar critério novo");
  });

  it("sem ninguém premiado, não fala em revogar", () => {
    const t = textoDeMudancaDeCriterio("Maratonista", 0);
    expect(t.corpo).toContain("Ninguém ganhou esta conquista ainda");
    expect(t.corpo).not.toContain("revogada");
    expect(t.corpo).toContain("registrada no histórico");
  });
});
