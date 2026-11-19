import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CartaoDaMissao } from "./CartaoDaMissao";
import type { Missao } from "./missoesApi";

const base: Missao = {
  id: 1,
  classeId: 7,
  perfilAlvo: null,
  titulo: "Meta da semana",
  objetivo: "Estudar 30 minutos.",
  prazo: null,
  criterio: { metrica: "minutos_totais", minutos: 30 },
  criterioRotulo: "Minutos de estudo: 30 minutos",
  origem: "professor",
  aprovacao: "nao_requer",
  motivoRecusa: null,
  escopo: "turma",
  ativa: true,
  caminho: "meta",
  atividadeId: null,
  topicoId: null,
  topicoNome: "—",
  pontos: 0,
  moedas: 0,
  entregues: 0,
  total: 10,
  desafio: null,
  desafioGrupo: null,
  conteudoId: null,
  perfis: [],
  linhasDoDesafio: [],
};

const desafio: Missao = {
  ...base,
  id: 10,
  titulo: "Desafio de lógica: Frações",
  objetivo: "Um desafio de lógica sobre o conteúdo que você estudou.",
  origem: "ia",
  aprovacao: "aprovada",
  escopo: "aluno",
  criterio: { metrica: "desafio" },
  criterioRotulo: "Resolver o desafio",
  perfilAlvo: "seeker",
  desafio: { tipo: "logica", formato: "multipla", enunciado: "?", alternativas: ["a", "b"] },
  desafioGrupo: "g1",
  conteudoId: 30,
  perfis: ["seeker", "mastermind"],
  linhasDoDesafio: [
    { id: 10, perfilAlvo: "seeker", ativa: true },
    { id: 11, perfilAlvo: "mastermind", ativa: true },
  ],
};

const nada = () => {};
const desenhar = (missao: Missao) =>
  renderToStaticMarkup(
    createElement(CartaoDaMissao, {
      missao,
      onEditar: nada,
      onDuplicar: nada,
      onExcluir: nada,
      onAlternarDesafio: nada,
      onTrocarPerfis: async () => {},
    }),
  );

describe("CartaoDaMissao com desafio", () => {
  it("mostra o selo Desafio, o tipo e os perfis do grupo", () => {
    const html = desenhar(desafio);
    expect(html).toContain(">Desafio<");
    expect(html).toContain("Lógica · múltipla escolha");
    expect(html).toContain("Seeker (Explorador)");
    expect(html).toContain("Mastermind (Estrategista)");
    expect(html).toContain("Cada aluno");
  });

  it("dois desafios do mesmo tipo no mesmo conteúdo se distinguem pelo enunciado ou pelas pistas", () => {
    const outro = { ...desafio, desafio: { tipo: "logica", formato: "multipla", enunciado: "Quanto é 1/2 + 1/4?", alternativas: ["3/4", "1/6"] } };
    const html = desenhar(outro);
    expect(html).toContain("Quanto é 1/2 + 1/4?");
    expect(html).toContain("line-clamp-2");
    expect(html).not.toContain("1/6");

    const cruzadinha = desenhar({
      ...desafio,
      desafio: {
        tipo: "cruzadinha",
        linhas: 9,
        colunas: 9,
        palavras: [
          { numero: 1, direcao: "h", linha: 0, coluna: 0, tamanho: 5, pista: "Parte de cima da fração" },
          { numero: 2, direcao: "v", linha: 0, coluna: 0, tamanho: 5, pista: "Parte de baixo da fração" },
        ],
      },
    });
    expect(cruzadinha).toContain("Pistas: Parte de cima da fração · Parte de baixo da fração");
  });

  it("não oferece editar, duplicar nem excluir; oferece desativar e trocar perfis", () => {
    const html = desenhar(desafio);
    expect(html).not.toContain("Editar Desafio");
    expect(html).not.toContain("Duplicar Desafio");
    expect(html).not.toContain("Excluir Desafio");
    expect(html).toContain("Desativar");
    expect(html).toContain("Trocar perfis");
    // A v1 só troca perfil nas linhas que existem: o cartão diz que acrescentar não dá.
    expect(html).toMatch(/acrescentar perfil/i);
  });

  it("desafio desligado em todas as linhas diz Desativada e oferece Reativar", () => {
    const html = desenhar({ ...desafio, ativa: false });
    expect(html).toContain("Desativada");
    expect(html).toContain("Reativar");
    expect(html).not.toContain(">Desativar<");
  });

  it("missão comum continua com editar, duplicar e excluir, sem selo de desafio", () => {
    const html = desenhar(base);
    expect(html).toContain("Editar Meta da semana");
    expect(html).toContain("Duplicar Meta da semana");
    expect(html).toContain("Excluir Meta da semana");
    expect(html).not.toContain(">Desafio<");
    expect(html).not.toContain("Trocar perfis");
  });
});
