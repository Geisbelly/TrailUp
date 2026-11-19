import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PropostaDeDesafio } from "../../../../supabase/functions/generate-content-ai/desafios.ts";
import { ListaDeDesafios } from "./ListaDeDesafios";

const multipla: PropostaDeDesafio = {
  tipo: "logica",
  titulo: "Sequência",
  desafio: { tipo: "logica", enunciado: "Qual o próximo: 2, 4, 8, ?", formato: "multipla", alternativas: ["10", "16", "12", "14"] },
  resposta: { aceitas: ["16"] },
  perfis: ["mastermind", "achiever"],
};

const curta: PropostaDeDesafio = {
  tipo: "logica",
  titulo: "Dedução",
  desafio: { tipo: "logica", enunciado: "Que estrutura guarda pares chave e valor?", formato: "curta" },
  resposta: { aceitas: ["Dicionário", "mapa"] },
  perfis: ["mastermind"],
};

const cruzadinha: PropostaDeDesafio = {
  tipo: "cruzadinha",
  titulo: "Termos",
  desafio: {
    tipo: "cruzadinha",
    linhas: 3,
    colunas: 4,
    palavras: [
      { numero: 1, direcao: "h", linha: 0, coluna: 0, tamanho: 4, pista: "Guarda dados" },
      { numero: 2, direcao: "v", linha: 0, coluna: 2, tamanho: 3, pista: "Ligação" },
    ],
  },
  resposta: { palavras: { "1h": "BASE", "2v": "SOL" } },
  perfis: ["seeker", "mastermind"],
};

const desenhar = (desafios: PropostaDeDesafio[], selecionados = new Set<number>([0])) =>
  renderToStaticMarkup(
    createElement(ListaDeDesafios, {
      desafios,
      selecionados,
      perfis: desafios.map((d) => d.perfis),
      onAlternar: () => undefined,
      onPerfis: () => undefined,
    }),
  );

describe("ListaDeDesafios", () => {
  it("mostra o título da lista, o tipo, o enunciado, a resposta e a recompensa", () => {
    const html = desenhar([multipla, curta]);
    expect(html).toContain("Desafios (missão) (2)");
    expect(html).toContain("Lógica · múltipla escolha");
    expect(html).toContain("Qual o próximo: 2, 4, 8, ?");
    expect(html).toContain("Resposta:");
    expect(html).toContain("16");
    expect(html).toContain("Lógica · resposta curta");
    expect(html).toContain("Dicionário · mapa");
    expect(html).toContain("moedas e pontos de missão");
  });

  it("marca a seleção pela proposta", () => {
    const html = desenhar([multipla, curta], new Set([1]));
    expect(html).toMatch(/role="checkbox" aria-checked="false"[^>]*aria-label="Selecionar Sequência"/);
    expect(html).toMatch(/role="checkbox" aria-checked="true"[^>]*aria-label="Selecionar Dedução"/);
  });

  it("os 7 perfis em chips, com o padrão marcado", () => {
    const html = desenhar([multipla]);
    for (const nome of ["Seeker", "Survivor", "Daredevil", "Mastermind", "Conqueror", "Socializer", "Achiever"]) {
      expect(html).toContain(`>${nome}</button>`);
    }
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(5);
  });

  it("os chips seguem os perfis editados, não os da proposta", () => {
    const html = renderToStaticMarkup(
      createElement(ListaDeDesafios, {
        desafios: [multipla],
        selecionados: new Set([0]),
        perfis: [["seeker"]],
        onAlternar: () => undefined,
        onPerfis: () => undefined,
      }),
    );
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Seeker<\/button>/);
  });

  it("a cruzadinha aparece em miniatura, com as pistas e as palavras", () => {
    const html = desenhar([cruzadinha]);
    expect(html).toContain("Cruzadinha");
    expect(html).toContain('aria-label="Grade da cruzadinha, 3 por 4"');
    expect(html).toContain("1 → Guarda dados");
    expect(html).toContain("BASE");
    expect(html).toContain("2 ↓ Ligação");
    expect(html).toContain("SOL");
  });

  it("sem desafios, não desenha nada", () => {
    expect(desenhar([], new Set())).toBe("");
  });
});
