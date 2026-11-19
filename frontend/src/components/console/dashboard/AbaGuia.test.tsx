import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DadosDoGuia, EstadoDoGuia } from "./useGuiaDaTurma";

let dados: DadosDoGuia = { topicos: [], porTopico: [], conceitos: [], porAluno: [] };
let estado: EstadoDoGuia = { tipo: "pronto" };
vi.mock("./useGuiaDaTurma", () => ({ useGuiaDaTurma: () => ({ dados, estado }) }));

import AbaGuia from "./AbaGuia";
import type { Aluno } from "./aluno/tipos";

const ANA = { id: "a", nome: "Ana", classe_id: 1 } as unknown as Aluno;

const render = () =>
  renderToStaticMarkup(
    createElement(AbaGuia, { classIds: [1], alunos: [ANA], mostrarTurma: false, nomeDaTurma: () => "T1", onAbrirAluno: () => {} }),
  );

beforeEach(() => {
  dados = { topicos: [], porTopico: [], conceitos: [], porAluno: [] };
  estado = { tipo: "pronto" };
});

describe("AbaGuia", () => {
  it("sem pergunta, explica o que vai aparecer e que o texto não é guardado", () => {
    const html = render();
    expect(html).toContain("Nenhum aluno desta turma perguntou ao Guia ainda.");
    expect(html).toContain("não é guardado");
  });

  it("sem a migration, avisa em vez de mostrar erro", () => {
    estado = { tipo: "indisponivel" };
    expect(render()).toContain("ainda não disponíveis");
  });

  it("mostra onde a turma trava, por tópico e por aluno, sem chamar o antes/depois de efeito", () => {
    dados = {
      topicos: [{ id: 10, classe_id: 1, nome: "Frações" }],
      porTopico: [
        {
          classe_id: 1,
          topico_id: 10,
          perguntas: 3,
          alunos: 1,
          duvidas_materia: 2,
          pedidos_resposta: 1,
          navegacao_app: 0,
          alunos_com_dificuldade: 1,
          alunos_travados: 1,
          ultima_em: null,
        },
        {
          classe_id: 1,
          topico_id: null,
          perguntas: 1,
          alunos: 1,
          duvidas_materia: 0,
          pedidos_resposta: 0,
          navegacao_app: 1,
          alunos_com_dificuldade: 0,
          alunos_travados: 0,
          ultima_em: null,
        },
      ],
      conceitos: [{ classe_id: 1, topico_id: 10, conceito: "mmc", mencoes: 2, alunos: 1, alunos_com_dificuldade: 1, ultima_em: null }],
      porAluno: [
        {
          classe_id: 1,
          aluno_id: "a",
          topico_id: 10,
          perguntas: 3,
          duvidas_materia: 2,
          pedidos_resposta: 1,
          com_dificuldade: 2,
          travado: 1,
          primeira_em: null,
          ultima_em: null,
          tentativas_antes: 1,
          acerto_antes_pct: 40,
          tentativas_depois: 1,
          acerto_depois_pct: 80,
        },
      ],
    };
    const html = render();
    expect(html).toContain("Onde a turma trava");
    expect(html).toContain("mmc");
    expect(html).toContain("Frações");
    expect(html).toContain("Fora de um tópico");
    expect(html).toContain("Ana");
    expect(html).toContain("40% → 80%");
    expect(html).toContain("não prova que o Guia ajudou");
    expect(html).not.toMatch(/melhor(ou|a) (por causa|graças)/i);
  });
});
