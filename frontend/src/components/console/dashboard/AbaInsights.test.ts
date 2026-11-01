import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Insight } from "./insights";

const estadoDoHook = vi.hoisted(() => ({
  valor: {} as Record<string, unknown>,
}));
vi.mock("./useInsightsDaTurma", () => ({ useInsightsDaTurma: () => estadoDoHook.valor }));
// A seção de alterações da trilha tem teste próprio (SecaoAlteracoesDaTrilha.test.ts).
vi.mock("./useAlteracoesDaTrilha", () => ({ useAlteracoesDaTrilha: () => ({ estado: { tipo: "indisponivel" } }) }));
import AbaInsights from "./AbaInsights";

const alerta: Insight = {
  id: "x1",
  classe_id: 1,
  aluno_id: "a1",
  escopo: "aluno",
  natureza: "sugestao",
  texto: "Frustração em 3 dos últimos 5 ciclos. Converse no início da aula.",
  base: "3 dos últimos 5 registros de estado mental: frustração.",
  status: "pending",
  motivo_descarte: null,
  geracao_id: null,
  created_at: "2026-10-31T12:00:00Z",
  resolved_at: null,
};

function render(alertas: Insight[], lote: Insight[] = []) {
  estadoDoHook.valor = {
    lote,
    recentes: [],
    alertas,
    estado: { tipo: "pronto" },
    gerando: false,
    aviso: null,
    gerar: vi.fn(),
    decidir: vi.fn(),
  };
  return renderToStaticMarkup(
    createElement(AbaInsights, {
      classIds: [1],
      alunos: [{ id: "a1", classe_id: 1, nome: "Bia" }] as never,
      mostrarTurma: false,
      nomeDaTurma: () => "T",
      onAbrirAluno: vi.fn(),
    }),
  );
}

describe("AbaInsights · alertas por aluno (#64)", () => {
  it("mostra a seção com o aluno, o texto, a base e as ações, mesmo sem lote gerado", () => {
    const html = render([alerta]);
    expect(html).toContain("Alertas por aluno (1)");
    expect(html).toContain("Bia");
    expect(html).toContain(alerta.texto);
    expect(html).toContain("com base em: 3 dos últimos 5 registros");
    expect(html).toContain("Aceitar");
    // O estado vazio do lote continua lá: são coisas diferentes.
    expect(html).toContain("Ainda sem sínteses geradas");
  });

  it("sem alerta, a seção não aparece", () => {
    expect(render([])).not.toContain("Alertas por aluno");
  });
});
