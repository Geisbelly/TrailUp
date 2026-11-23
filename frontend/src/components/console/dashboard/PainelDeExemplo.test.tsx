import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { METRICAS } from "@/features/pesquisa/pesquisaProfessores";
import PainelDeExemplo from "./PainelDeExemplo";

describe("painel de exemplo da pesquisa", () => {
  const html = renderToStaticMarkup(createElement(PainelDeExemplo));

  it("diz que os números são de exemplo", () => {
    expect(html).toContain("Exemplo: valores ilustrativos");
    expect(html).toContain("Nenhum desses números descreve uma turma real.");
  });

  it("mostra todas as métricas que o formulário pede para avaliar", () => {
    for (const metrica of METRICAS) expect(html).toContain(metrica);
  });

  it("mostra valor, e não o estado vazio, nos cartões", () => {
    expect(html).not.toContain("Sem dado ainda");
    expect(html).not.toContain("Sem dados ainda");
    expect(html).toContain("32");
  });
});
