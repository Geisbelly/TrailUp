import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { TOTAL_DE_ALUNOS } from "../dashboard/exemploDaPesquisa";
import { AbaNaTurma } from "./AbaNaTurma";
import { exemploNaTurma, resumoComExemplo } from "./exemploNaTurma";

const HOJE = new Date("2026-11-24T12:00:00Z");
const exemplo = exemploNaTurma(3, "Turma de demonstração", HOJE);

describe("alunos de exemplo na aba Turmas", () => {
  it("são os mesmos 32 da Visão geral, sem e-mail", () => {
    expect(exemplo.alunos).toHaveLength(TOTAL_DE_ALUNOS);
    expect(exemplo.alunos.every((a) => a.nome.endsWith("(exemplo)") && a.email === null)).toBe(true);
  });

  it("turma sem aluno real mostra os de exemplo e a conclusão média deles", () => {
    const r = resumoComExemplo({ alunos: 0, topicos: 5, conclusaoPct: null }, exemplo.conclusoes);
    expect(r.alunos).toBe(TOTAL_DE_ALUNOS);
    expect(r.topicos).toBe(5);
    expect(Math.round(r.conclusaoPct!)).toBe(61);
  });

  it("com aluno real, a conclusão é a média de todos", () => {
    const r = resumoComExemplo({ alunos: 1, topicos: 5, conclusaoPct: 100 }, [0, 50]);
    expect(r.alunos).toBe(3);
    expect(r.conclusaoPct).toBe(50);
  });

  it("a janela de matrículas lista os de exemplo, com selo e sem remover", () => {
    const html = renderToStaticMarkup(
      createElement(AbaNaTurma, {
        matriculados: [],
        total: 0,
        perfis: new Map(),
        termos: new Map(),
        erroDosTermos: null,
        carregando: false,
        erro: null,
        onRemover: async () => [],
        onTermoSalvo: () => undefined,
        onIrParaAdicionar: () => undefined,
        cancelarConfirmacao: { current: null },
        exemplo,
      }),
    );
    expect(html).not.toContain("Nenhum aluno nesta turma ainda");
    expect(html).toContain("Exemplo: valores ilustrativos");
    expect(html).toContain("Ana Clara (exemplo)");
    expect(html).not.toContain("Remover");
    expect(html).not.toContain("Termo recebido");
  });
});
