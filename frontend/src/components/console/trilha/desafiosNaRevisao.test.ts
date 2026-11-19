import { describe, expect, it } from "vitest";
import { MAX_EXISTENTES } from "../../../../supabase/functions/generate-content-ai/repetidas.ts";
import type { PropostaDeDesafio } from "../../../../supabase/functions/generate-content-ai/desafios.ts";
import {
  avisoDosDesafios,
  existentesDosDesafios,
  filaDepoisDoAplicar,
  itemDaFila,
  loteDoAplicar,
  mensagensDosDesafiosCriados,
  type SugestaoNaFila,
} from "./desafiosNaRevisao";
import type { AiSuggestion } from "./types";

const logica = (enunciado: string): PropostaDeDesafio => ({
  tipo: "logica",
  titulo: enunciado,
  desafio: { tipo: "logica", enunciado, formato: "curta" },
  resposta: { aceitas: ["x"] },
  perfis: ["mastermind", "achiever"],
});
const card = (titulo: string) => ({ titulo, descricao: "d" });
const atividade = (titulo: string): AiSuggestion["atividades"][number] => ({
  titulo,
  enunciado: titulo,
  tipo: "quiz",
  alternativas: ["a", "b"],
  resposta_correta: "a",
});
const item = (conteudoId: number | null, extra: Partial<SugestaoNaFila["sugestao"]> = {}): SugestaoNaFila => ({
  conteudoId,
  titulo: `C${conteudoId}`,
  sugestao: { cards: [card("c1")], atividades: [atividade("a1")], desafios: [logica("L1"), logica("L2")], ...extra },
});

describe("existentesDosDesafios", () => {
  it("os desafios aplicados e os da fila entram em questoes, antes do que o tópico já tem", () => {
    const r = existentesDosDesafios({ questoes: ["Pergunta do tópico"], cards: ["Card"] }, ["Desafio aplicado"], ["Desafio na fila"]);
    expect(r).toEqual({ questoes: ["Desafio aplicado", "Desafio na fila", "Pergunta do tópico"], cards: ["Card"] });
  });

  it("no teto, quem fica de fora é o que o tópico tem, não o desafio aplicado", () => {
    const doTopico = Array.from({ length: MAX_EXISTENTES }, (_, i) => `Pergunta numero ${i} do topico`);
    const r = existentesDosDesafios({ questoes: doTopico, cards: [] }, ["Desafio aplicado"], []);
    expect(r.questoes).toHaveLength(MAX_EXISTENTES);
    expect(r.questoes[0]).toBe("Desafio aplicado");
  });

  it("sem base nem desafios, nada", () => {
    expect(existentesDosDesafios(undefined, [], [])).toEqual({ questoes: [], cards: [] });
  });
});

describe("avisoDosDesafios", () => {
  it("falha com cards ou atividades: o aviso diz que o resto está abaixo, com a mensagem da edge", () => {
    const r = avisoDosDesafios({ status: "rejected", reason: new Error("Não foi possível gerar desafios a partir deste material. Tente de novo.") }, true);
    expect(r).toEqual({
      tipo: "warning",
      texto: "Os desafios não vieram desta vez; os cards e as atividades estão abaixo.",
      descricao: "Não foi possível gerar desafios a partir deste material. Tente de novo.",
    });
  });

  it("falha sem cards nem atividades: não promete o que não veio", () => {
    const r = avisoDosDesafios({ status: "rejected", reason: "x" }, false);
    expect(r?.texto).toBe("Os desafios não vieram desta vez.");
  });

  it("200 com tudo descartado: diz quantos e por quê", () => {
    expect(avisoDosDesafios({ status: "fulfilled", value: { desafios: [], descartados: 3 } }, true)).toEqual({
      tipo: "info",
      texto: "A IA propôs 3 desafios, mas nenhum passou na conferência (seriam recusados ao aplicar ou entregavam a resposta). Peça de novo para tentar outros.",
    });
    expect(avisoDosDesafios({ status: "fulfilled", value: { desafios: [], descartados: 1 } }, true)?.texto).toContain("A IA propôs 1 desafio,");
  });

  it("desafios que chegaram, ou nada descartado: sem aviso", () => {
    expect(avisoDosDesafios({ status: "fulfilled", value: { desafios: [{} as never], descartados: 2 } }, true)).toBeNull();
    expect(avisoDosDesafios({ status: "fulfilled", value: { desafios: [], descartados: 0 } }, true)).toBeNull();
  });
});

describe("mensagensDosDesafiosCriados", () => {
  it("quantos viraram missão e o que o banco recusou", () => {
    expect(mensagensDosDesafiosCriados({ criados: 2, falhas: [] })).toEqual({ sucesso: "2 desafios viraram missão da turma." });
    expect(mensagensDosDesafiosCriados({ criados: 1, falhas: ["Cruzadinha: A grade precisa de 2 a 40 linhas."] })).toEqual({
      sucesso: "1 desafio virou missão da turma.",
      falha: "1 desafio não foi criado.",
      detalhes: "Cruzadinha: A grade precisa de 2 a 40 linhas.",
    });
    expect(mensagensDosDesafiosCriados({ criados: 0, falhas: ["a", "b"] })).toEqual({
      falha: "2 desafios não foram criados.",
      detalhes: "a\nb",
    });
  });
});

describe("itemDaFila", () => {
  const ok = <T,>(value: T): PromiseSettledResult<T> => ({ status: "fulfilled", value });
  const falhou = (): PromiseSettledResult<never> => ({ status: "rejected", reason: new Error("x") });

  it("cards, atividades e desafios no mesmo item", () => {
    const r = itemDaFila(7, "Bancos", ok({ cards: [card("c")], atividades: [atividade("a")], descricao: "d" }), ok({ desafios: [logica("L")], descartados: 0 }));
    expect(r).toEqual({
      conteudoId: 7,
      titulo: "Bancos",
      sugestao: { cards: [card("c")], atividades: [atividade("a")], descricao: "d", desafios: [logica("L")] },
    });
  });

  it("desafios que falharam não tiram os cards; conteúdo que falhou não tira os desafios", () => {
    expect(itemDaFila(7, "B", ok({ cards: [card("c")], atividades: [] }), falhou())?.sugestao).toEqual({
      cards: [card("c")],
      atividades: [],
      desafios: [],
    });
    expect(itemDaFila(7, "B", falhou(), ok({ desafios: [logica("L")], descartados: 0 }))?.sugestao).toEqual({
      cards: [],
      atividades: [],
      desafios: [logica("L")],
    });
  });

  it("nada em lugar nenhum: sem item", () => {
    expect(itemDaFila(7, "B", ok({ cards: [], atividades: [] }), ok({ desafios: [], descartados: 2 }))).toBeNull();
    expect(itemDaFila(7, "B", falhou(), falhou())).toBeNull();
    expect(itemDaFila(7, "B", ok(null as unknown as AiSuggestion), ok({ desafios: [], descartados: 0 }))).toBeNull();
  });
});

describe("loteDoAplicar", () => {
  it("só os selecionados, em ordem, e os desafios com os perfis editados", () => {
    const sugestao = item(7, { cards: [card("c1"), card("c2"), card("c3")] }).sugestao;
    const lote = loteDoAplicar(
      sugestao,
      { cards: new Set([2, 0]), atividades: new Set<number>(), desafios: new Set([1, 9]) },
      [["seeker"], ["daredevil", "survivor"]],
    );
    expect(lote.cards).toEqual([card("c1"), card("c3")]);
    expect(lote.atividades).toEqual([]);
    expect(lote.desafios).toEqual([{ ...logica("L2"), perfis: ["daredevil", "survivor"] }]);
  });

  it("sem perfil editado, vale o da proposta", () => {
    const lote = loteDoAplicar(item(7).sugestao, { cards: new Set(), atividades: new Set(), desafios: new Set([0]) }, []);
    expect(lote.desafios).toEqual([logica("L1")]);
  });
});

describe("filaDepoisDoAplicar", () => {
  it("tudo criado: a fila avança", () => {
    const fila = [item(1), item(2)];
    expect(filaDepoisDoAplicar(fila, [logica("L1")], [])).toEqual([item(2)]);
  });

  it("desafio recusado fica na cabeça, sozinho, com os perfis editados; cards e atividades já foram criados", () => {
    const fila = [item(1), item(2)];
    const lote = [{ ...logica("L1"), perfis: ["seeker" as const] }, logica("L2")];
    const r = filaDepoisDoAplicar(fila, lote, [0]);
    expect(r).toEqual([
      { ...item(1), sugestao: { ...item(1).sugestao, cards: [], atividades: [], desafios: [{ ...logica("L1"), perfis: ["seeker"] }] } },
      item(2),
    ]);
    // Objeto novo na cabeça: o efeito da seleção roda de novo e marca o que ficou.
    expect(r[0]).not.toBe(fila[0]);
    expect(fila[0].sugestao.cards).toHaveLength(1);
  });

  it("fila vazia continua vazia", () => {
    expect(filaDepoisDoAplicar([], [logica("L1")], [0])).toEqual([]);
  });
});
