import { describe, expect, it } from "vitest";
import { concedido, faixaValida, filtrarExtrato, mensagemDeErro, numeroOuNulo } from "./economiaRegras";

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
