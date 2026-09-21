import { describe, expect, it } from "vitest";

import {
  acharTipo,
  ehMissao,
  formatoDaQuestao,
  FORMATOS_DE_QUESTAO,
  normalizarFormato,
  rotularTipoDeAtividade,
  TIPO_DE_MISSAO,
  TIPOS_DE_ATIVIDADE,
  tipoDeAtividadeDoFormato,
} from "./tiposDeAtividade";

describe("a lista é o único lugar", () => {
  it("missão está entre os tipos", () => {
    expect(TIPOS_DE_ATIVIDADE.some((t) => t.tipo === TIPO_DE_MISSAO)).toBe(true);
  });

  it("todo tipo com formato aponta para um formato existente", () => {
    // Formato inventado aqui vira questão que não casa nenhum ramo do editor, e
    // o professor vê formulário VAZIO sem erro -- o defeito que a #150 nomeia.
    const formatos = new Set(FORMATOS_DE_QUESTAO.map((f) => f.formato));
    for (const t of TIPOS_DE_ATIVIDADE) {
      if (t.formato === null) continue;
      expect(formatos.has(t.formato), t.tipo).toBe(true);
    }
  });

  it("só a missão fica sem formato implícito", () => {
    // É o que a torna capaz de misturar itens: nos outros tipos,
    // `atividades.tipo` e `questoes.tipo` são a mesma informação.
    const semFormato = TIPOS_DE_ATIVIDADE.filter((t) => t.formato === null);
    expect(semFormato.map((t) => t.tipo)).toEqual(["missao"]);
  });

  it("não há dois tipos com o mesmo formato", () => {
    // Dois tipos apontando para o mesmo formato fariam
    // `tipoDeAtividadeDoFormato` devolver um dos dois arbitrariamente.
    const comFormato = TIPOS_DE_ATIVIDADE.filter((t) => t.formato !== null);
    const formatos = comFormato.map((t) => t.formato);
    expect(new Set(formatos).size).toBe(comFormato.length);
  });
});

describe("ehMissao", () => {
  it("reconhece a missão, sem se importar com caixa ou espaço", () => {
    expect(ehMissao("missao")).toBe(true);
    expect(ehMissao("  MISSAO  ")).toBe(true);
  });

  it("não confunde com os outros tipos", () => {
    expect(ehMissao("quiz")).toBe(false);
    expect(ehMissao(null)).toBe(false);
    expect(ehMissao("")).toBe(false);
  });
});

describe("formatoDaQuestao", () => {
  it("fora da missão, o tipo da atividade manda", () => {
    // É a informação canônica: a questão pode ter vindo de importação com
    // vocabulário diferente.
    expect(formatoDaQuestao("quiz", "dissertativa")).toBe("multipla");
    expect(formatoDaQuestao("essay", "multipla")).toBe("dissertativa");
    expect(formatoDaQuestao("true_false", null)).toBe("verdadeiro_falso");
    expect(formatoDaQuestao("fill_blank", undefined)).toBe("fill_blank");
  });

  it("na missão, a questão decide", () => {
    expect(formatoDaQuestao("missao", "dissertativa")).toBe("dissertativa");
    expect(formatoDaQuestao("missao", "verdadeiro_falso")).toBe("verdadeiro_falso");
    expect(formatoDaQuestao("missao", "fill_blank")).toBe("fill_blank");
  });

  it("missão com itens de formatos diferentes é o ponto da missão", () => {
    const itens = ["multipla", "dissertativa", "fill_blank"];
    expect(itens.map((q) => formatoDaQuestao("missao", q))).toEqual(itens);
  });

  it("cai em múltipla quando não dá para saber", () => {
    // Sem reserva, a questão não renderizaria campo algum -- formulário vazio
    // de novo.
    expect(formatoDaQuestao("missao", null)).toBe("multipla");
    expect(formatoDaQuestao("missao", "formato_inventado")).toBe("multipla");
    expect(formatoDaQuestao("tipo_que_nao_existe", null)).toBe("multipla");
  });

  it("tipo desconhecido ainda respeita o formato da questão", () => {
    // `atividades.tipo` é texto livre: um typo não pode apagar a informação que
    // a questão carrega.
    expect(formatoDaQuestao("quizz", "dissertativa")).toBe("dissertativa");
  });
});

describe("normalizarFormato", () => {
  it("aceita os dois vocabulários", () => {
    expect(normalizarFormato("quiz")).toBe("multipla");
    expect(normalizarFormato("multipla")).toBe("multipla");
    expect(normalizarFormato("true_false")).toBe("verdadeiro_falso");
    expect(normalizarFormato("essay")).toBe("dissertativa");
  });

  it("devolve null para o que não reconhece", () => {
    expect(normalizarFormato("outro")).toBeNull();
    expect(normalizarFormato(null)).toBeNull();
  });
});

describe("tipoDeAtividadeDoFormato", () => {
  it("faz o caminho de volta", () => {
    expect(tipoDeAtividadeDoFormato("dissertativa")).toBe("essay");
    expect(tipoDeAtividadeDoFormato("verdadeiro_falso")).toBe("true_false");
    expect(tipoDeAtividadeDoFormato("fill_blank")).toBe("fill_blank");
    expect(tipoDeAtividadeDoFormato("multipla")).toBe("quiz");
  });

  it("ida e volta não muda o tipo", () => {
    for (const t of TIPOS_DE_ATIVIDADE) {
      if (t.formato === null) continue;
      expect(tipoDeAtividadeDoFormato(t.formato), t.tipo).toBe(t.tipo);
    }
  });

  it("desconhecido cai em quiz, que é o formulário mais completo", () => {
    expect(tipoDeAtividadeDoFormato("nada disso")).toBe("quiz");
  });
});

describe("rotularTipoDeAtividade", () => {
  it("rotula os conhecidos", () => {
    expect(rotularTipoDeAtividade("missao")).toBe("Missão");
    expect(rotularTipoDeAtividade("quiz")).toBe("Quiz (Múltipla)");
  });

  it("tipo desconhecido aparece cru em vez de sumir", () => {
    // Sumir esconderia uma atividade que existe, e `tipo` é texto livre.
    expect(rotularTipoDeAtividade("video")).toBe("video");
    expect(acharTipo("video")).toBeNull();
  });
});
