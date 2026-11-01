import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RiscoDeReprovacao from "./RiscoDeReprovacao";
import { eFuncaoAusente, lerRiscoDeReprovacao, resumirRisco } from "./riscoReprovacao";
import type { EstadoDoRisco } from "./useRiscoDeReprovacao";

const faltas = { fator: "faltas", texto: "Presente em 1 de 3 aulas nas últimas 4 semanas", valor: 1 };
const prazos = { fator: "prazos_perdidos", texto: "2 atividades com prazo vencido nos últimos 30 dias sem entrega" };
const acertos = { fator: "acertos_baixos", texto: "17% de acerto em 6 questões nos últimos 30 dias" };

describe("lerRiscoDeReprovacao", () => {
  it("lê a linha da função e descarta fator malformado", () => {
    const r = lerRiscoDeReprovacao([
      { aluno_id: "a", sinalizado: true, fatores_disparados: 2, fatores: [faltas, prazos, { fator: 1 }] },
      { aluno_id: 7, sinalizado: true },
    ]);
    expect(r).toEqual([{ aluno_id: "a", sinalizado: true, fatores: [{ fator: "faltas", texto: faltas.texto }, { fator: "prazos_perdidos", texto: prazos.texto }] }]);
  });

  it("resposta que não é lista: null, não lista inventada", () => {
    expect(lerRiscoDeReprovacao({ erro: "x" })).toBeNull();
  });
});

describe("resumirRisco", () => {
  it("sinalizados primeiro por número de sinais; um sinal só conta como em observação", () => {
    const r = resumirRisco([
      { aluno_id: "a", sinalizado: true, fatores: [faltas, prazos] },
      { aluno_id: "b", sinalizado: true, fatores: [faltas, prazos, acertos] },
      { aluno_id: "c", sinalizado: false, fatores: [faltas] },
      { aluno_id: "d", sinalizado: false, fatores: [] },
    ]);
    expect(r.sinalizados.map((s) => s.aluno_id)).toEqual(["b", "a"]);
    expect(r.emObservacao).toBe(1);
  });
});

describe("eFuncaoAusente", () => {
  it("reconhece a função que ainda não existe no ambiente", () => {
    expect(eFuncaoAusente({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
    expect(eFuncaoAusente({ code: "42501", message: "turma_nao_encontrada_ou_sem_permissao" })).toBe(false);
  });
});

function render(estado: Partial<EstadoDoRisco>, turmaUnica: number | null = 1) {
  return renderToStaticMarkup(
    createElement(RiscoDeReprovacao, {
      turmaUnica,
      estado: { linhas: null, carregando: false, erro: null, indisponivel: false, ...estado },
      alunos: [{ id: "a", nome: "Bia" }],
      onAbrir: vi.fn(),
    }),
  );
}

describe("RiscoDeReprovacao", () => {
  it("mostra o aluno sinalizado com o fato de cada sinal", () => {
    const html = render({ linhas: [{ aluno_id: "a", sinalizado: true, fatores: [faltas, prazos] }] });
    expect(html).toContain("Bia");
    expect(html).toContain("2 sinais");
    expect(html).toContain(faltas.texto);
    expect(html).toContain("Só você vê");
  });

  it("estados: sem turma, ninguém sinalizado, função ausente e erro", () => {
    expect(render({}, null)).toContain("Escolha uma turma");
    expect(render({ linhas: [{ aluno_id: "a", sinalizado: false, fatores: [faltas] }] })).toContain(
      "Nenhum aluno com dois ou mais sinais agora. 1 tem um sinal só",
    );
    expect(render({ indisponivel: true, erro: "x" })).toContain("Ainda não disponível");
    expect(render({ erro: "x" })).toContain("Não foi possível carregar");
  });
});
