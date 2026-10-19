import { describe, expect, it } from "vitest";
import { concedido, descreverPadrao, faixaValida, filtrarExtrato, limiteDoTexto, mensagemDeErro, numeroOuNulo, precoDaUnidade, textoDoLimite } from "./economiaRegras";

describe("faixa de prazo e tempo", () => {
  it("aceita mínimo dentro do máximo e máximo dentro do teto", () => {
    expect(faixaValida({ min: 1, max: 2, teto: 4, tetoGeral: 6 })).toBe(true);
  });

  it("recusa mínimo acima do máximo, máximo acima do teto e teto da atividade acima do da turma", () => {
    expect(faixaValida({ min: 3, max: 1, teto: 4 })).toBe(false);
    expect(faixaValida({ min: 1, max: 5, teto: 4 })).toBe(false);
    expect(faixaValida({ min: 1, max: 2, teto: 4, tetoGeral: 3 })).toBe(false);
  });
});

describe("quanto um uso concede", () => {
  it("aperta o pedido do item para dentro do mínimo e do máximo", () => {
    expect(concedido(1, 2, 3, 0, 4, 0, 4)).toEqual({ ok: true, valor: 2 });
    expect(concedido(9, 1, 2, 0, 4, 0, 4)).toEqual({ ok: true, valor: 2 });
  });

  it("recusa quando não cabe na atividade, na turma, ou quando a extensão está desligada", () => {
    expect(concedido(1, 1, 1, 2, 2, 2, 4).ok).toBe(false);
    expect(concedido(1, 1, 1, 2, 2, 2, 4)).toMatchObject({ erro: "teto_da_atividade" });
    expect(concedido(1, 1, 1, 0, 2, 4, 4)).toMatchObject({ erro: "teto_da_turma" });
    expect(concedido(1, 0, 0, 0, 2, 0, 4)).toMatchObject({ erro: "extensao_desligada" });
  });
});

describe("extrato e erros", () => {
  it("filtra pelo motivo e deixa passar tudo", () => {
    const linhas = [
      { id: 1, motivo: "evento", delta: 2 },
      { id: 2, motivo: "compra", delta: -5 },
      { id: 3, motivo: "estorno", delta: 5 },
    ];
    expect(filtrarExtrato(linhas, "compra").map((l) => l.id)).toEqual([2]);
    expect(filtrarExtrato(linhas, "todos")).toHaveLength(3);
  });

  it("traduz o código que o banco devolve", () => {
    expect(mensagemDeErro("teto_da_turma")).toMatch(/turma/);
    expect(mensagemDeErro("desconhecido")).toBe("Não foi possível concluir.");
  });

  it("campo vazio herda e texto inválido não vira número", () => {
    expect(numeroOuNulo("")).toBeNull();
    expect(numeroOuNulo(" 4 ")).toBe(4);
    expect(Number.isNaN(numeroOuNulo("abc"))).toBe(true);
  });
});

describe("várias unidades e limite de uso", () => {
  it("vazio herda, 0 bloqueia, sem limite vira -1 e fora da faixa é inválido", () => {
    expect(limiteDoTexto("")).toBeNull();
    expect(limiteDoTexto("0")).toBe(0);
    expect(limiteDoTexto("3")).toBe(3);
    expect(limiteDoTexto("sem limite")).toBe(-1);
    expect(limiteDoTexto("-")).toBe(-1);
    expect(Number.isNaN(limiteDoTexto("101"))).toBe(true);
    expect(Number.isNaN(limiteDoTexto("1.5"))).toBe(true);
    expect(textoDoLimite(-1)).toBe("sem limite");
    expect(textoDoLimite(null)).toBe("");
  });

  it("mostra o padrão de cada tipo de item", () => {
    expect(descreverPadrao("prazo_extra", "por_atividade")).toBe("1");
    expect(descreverPadrao("segunda_chance", "por_questao")).toBe("1");
    expect(descreverPadrao("tempo_extra", "por_atividade")).toBe("3");
    expect(descreverPadrao("prazo_extra", "por_dia")).toBe("sem limite");
  });

  it("aumento por compra: fator 1 mantém o preço", () => {
    expect([0, 1, 2].map((n) => precoDaUnidade(8, 2, n))).toEqual([8, 16, 32]);
    expect([0, 1, 2].map((n) => precoDaUnidade(10, 1, n))).toEqual([10, 10, 10]);
  });

  it("nomeia o limite que segurou o uso", () => {
    expect(mensagemDeErro("limite_por_questao")).toMatch(/questão/);
    expect(mensagemDeErro("limite_por_dia")).toMatch(/hoje/);
    expect(mensagemDeErro("sem_unidade")).toMatch(/mochila/);
  });
});
