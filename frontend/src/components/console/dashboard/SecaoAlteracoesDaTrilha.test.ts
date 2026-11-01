import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AlteracaoDaTrilha, AlteracaoDoAluno } from "./alteracoes";

const estadoDoHook = vi.hoisted(() => ({ valor: {} as Record<string, unknown> }));
vi.mock("./useAlteracoesDaTrilha", () => ({ useAlteracoesDaTrilha: () => estadoDoHook.valor }));
import SecaoAlteracoesDaTrilha from "./SecaoAlteracoesDaTrilha";

const alteracao: AlteracaoDaTrilha = {
  id: 7,
  classe_id: 1,
  topico_id: 10,
  alvo_tipo: "atividade",
  conteudo_id: null,
  atividade_id: 500,
  mudancas: [{ tabela: "questoes", id: 1, op: "UPDATE", campos: ["enunciado"] }],
  status: "analisada",
  classificacao: "relevante",
  resumo: "A questão 1 foi reescrita.",
  motivo: "O enunciado mudou de sentido.",
  tentativas: 1,
  ultimo_erro: null,
  criada_em: "2026-11-01T12:00:00Z",
};

function aluno(campos: Partial<AlteracaoDoAluno>): AlteracaoDoAluno {
  return {
    id: 1,
    alteracao_id: 7,
    aluno_id: "a1",
    classe_id: 1,
    situacao: "fez",
    decisao: "revisar",
    decisao_professor: null,
    decisao_efetiva: "revisar",
    motivo: "Respondeu antes da mudança.",
    recorrigida: false,
    revisada_em: null,
    ...campos,
  };
}

function render(estado: Record<string, unknown>, alunos: AlteracaoDoAluno[] = []) {
  estadoDoHook.valor = {
    alteracoes: [alteracao],
    alunosPorAlteracao: new Map([[7, alunos]]),
    titulos: new Map([["atividade:500", "Frações"]]),
    decidir: vi.fn(),
    ...estado,
  };
  return renderToStaticMarkup(
    createElement(SecaoAlteracoesDaTrilha, {
      classIds: [1],
      alunos: [{ id: "a1", classe_id: 1, nome: "Ana" }, { id: "a2", classe_id: 1, nome: "Bia" }] as never,
      mostrarTurma: false,
      nomeDaTurma: () => "Turma",
    }),
  );
}

describe("SecaoAlteracoesDaTrilha", () => {
  it("some enquanto a migração não está no banco", () => {
    expect(render({ estado: { tipo: "indisponivel" } })).toBe("");
  });

  it("mostra o que mudou, o que o aluno vê e a decisão de cada um, com o desfazer", () => {
    const html = render({ estado: { tipo: "pronto" } }, [
      aluno({}),
      aluno({ id: 2, aluno_id: "a2", situacao: "viu", decisao: "destacar", decisao_efetiva: "destacar", decisao_professor: "destacar", motivo: null }),
    ]);
    expect(html).toContain("Frações");
    expect(html).toContain("Mudou: enunciado.");
    expect(html).toContain("A questão 1 foi reescrita.");
    expect(html).toContain("Revisão pedida");
    expect(html).toContain("Não pedir revisão");
    // Bia só viu: não há revisão a pedir, e a decisão foi do professor.
    expect(html).toContain("Avisado (você)");
    expect(html).toContain("Voltar à IA");
    expect(html.match(/Pedir revisão/g)).toBeNull();
  });
});
