import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { METRICAS } from "@/features/pesquisa/pesquisaProfessores";
import PainelDeExemplo from "./PainelDeExemplo";
import { alunosDeExemplo, TOTAL_DE_ALUNOS } from "./exemploDaPesquisa";

const HOJE = new Date("2026-11-24T12:00:00Z");

describe("painel de exemplo da pesquisa", () => {
  const alunos = alunosDeExemplo(42, "Turma de demonstração", HOJE);
  const html = renderToStaticMarkup(createElement(PainelDeExemplo, { alunos, onAbrir: () => undefined, hoje: HOJE }));

  it("diz que os alunos são de exemplo", () => {
    expect(html).toContain("Exemplo: valores ilustrativos");
    expect(html).toContain("Nenhum aluno marcado como exemplo descreve uma turma real.");
  });

  it("mostra todas as métricas que o formulário pede para avaliar", () => {
    for (const metrica of METRICAS) expect(html).toContain(metrica);
  });

  it("mostra valor, e não o estado vazio, nos cartões", () => {
    expect(html).not.toContain("Sem dado ainda");
    expect(html).not.toContain("Sem dados ainda");
    expect(html).toContain(String(TOTAL_DE_ALUNOS));
  });

  it("mostra os alunos na lista de atenção e na tabela", () => {
    expect(html).toContain("Felipe (exemplo)");
    expect(html).toContain("Ana Clara (exemplo)");
  });
});
